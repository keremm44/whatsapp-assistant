from __future__ import annotations

import re
from typing import Any

from return_issue_repository import evaluate_quantity_limit_request


_QUANTITY_WORD_PATTERN = r"(?:adet|tane)"
_EXPLICIT_BEFORE = re.compile(
    rf"\b(\d{{1,9}})\s*{_QUANTITY_WORD_PATTERN}\b",
    re.IGNORECASE,
)
_EXPLICIT_AFTER = re.compile(
    rf"\b{_QUANTITY_WORD_PATTERN}\s*[:=]?\s*(\d{{1,9}})\b",
    re.IGNORECASE,
)
_RANGE_PATTERN = re.compile(
    rf"\b\d{{1,9}}\s*(?:-|–|—|ile|veya|ya\s+da)\s*\d{{1,9}}\s*{_QUANTITY_WORD_PATTERN}\b",
    re.IGNORECASE,
)
_QUANTITY_WORD_RE = re.compile(rf"\b{_QUANTITY_WORD_PATTERN}\b", re.IGNORECASE)
_ORDER_CONTEXT_RE = re.compile(
    r"\b(?:sipariş|siparis|al(?:mak|abilir|acağ|acag)?|yaptır|yaptir|yapabilir|"
    r"üret|uret|bastır|bastir|ver(?:mek|ebilir)?|ist(?:emek|iyorum|iyoruz)?|"
    r"hazırlat|hazirlat|lazım|lazim)\w*\b|olur\s+mu|olabilir\s+mi",
    re.IGNORECASE,
)
_LIMIT_CONTEXT_RE = re.compile(
    r"\b(?:minimum|min(?:imum)?|maksimum|max(?:imum)?|en\s+az|en\s+fazla|limit|sınır|sinir)\b",
    re.IGNORECASE,
)
_RETURN_PRIORITY_TERMS = (
    "iade",
    "değişim",
    "degisim",
    "kırık",
    "kirik",
    "hasarlı",
    "hasarli",
    "yanlış geldi",
    "yanlis geldi",
    "şikayet",
    "sikayet",
    "teslim edilmedi",
    "kargom gelmedi",
    "ürün sorunu",
    "urun sorunu",
)


def _normalize_for_detection(value: str) -> str:
    return " ".join(
        value.strip().translate(str.maketrans({"I": "ı", "İ": "i"})).lower().split()
    )


def detect_quantity_question(message: str) -> dict[str, Any]:
    """Sipariş-adedi sorusunu tahminsiz yakalar; ürün özelliği sayısını quantity sanmaz."""
    if not isinstance(message, str) or not message.strip():
        return {"detected": False, "requested_quantity": None, "ambiguous": False}

    normalized = _normalize_for_detection(message)
    if any(term in normalized for term in _RETURN_PRIORITY_TERMS):
        return {"detected": False, "requested_quantity": None, "ambiguous": False}

    has_quantity_word = _QUANTITY_WORD_RE.search(normalized) is not None
    has_order_context = _ORDER_CONTEXT_RE.search(normalized) is not None
    has_limit_context = _LIMIT_CONTEXT_RE.search(normalized) is not None
    mentions_order = "sipariş" in normalized or "siparis" in normalized

    if not (
        (has_quantity_word and (has_order_context or has_limit_context))
        or (mentions_order and has_limit_context)
    ):
        return {"detected": False, "requested_quantity": None, "ambiguous": False}

    if _RANGE_PATTERN.search(normalized):
        return {"detected": True, "requested_quantity": None, "ambiguous": True}

    quantities = {
        int(match.group(1))
        for pattern in (_EXPLICIT_BEFORE, _EXPLICIT_AFTER)
        for match in pattern.finditer(normalized)
    }

    if len(quantities) == 1:
        return {
            "detected": True,
            "requested_quantity": next(iter(quantities)),
            "ambiguous": False,
        }
    if len(quantities) > 1:
        return {"detected": True, "requested_quantity": None, "ambiguous": True}

    return {"detected": True, "requested_quantity": None, "ambiguous": False}


def _configured_limits(product_info: Any) -> tuple[int | None, int | None]:
    if not isinstance(product_info, dict):
        return None, None
    order = product_info.get("order")
    if not isinstance(order, dict):
        return None, None

    minimum = order.get("min_quantity")
    maximum = order.get("max_quantity")
    if (
        not isinstance(minimum, int)
        or isinstance(minimum, bool)
        or minimum <= 0
    ):
        return None, None
    if maximum is not None and (
        not isinstance(maximum, int)
        or isinstance(maximum, bool)
        or maximum <= 0
        or maximum < minimum
    ):
        return None, None
    return minimum, maximum


def _limits_sentence(minimum: int, maximum: int | None) -> str:
    if maximum is None:
        return f"Bu mağazada sipariş adedi en az {minimum} olmalıdır."
    if minimum == maximum:
        return f"Bu mağazada sipariş adedi {minimum} olarak belirlenmiştir."
    return f"Bu mağazada sipariş adedi {minimum} ile {maximum} arasındadır."


def _review_response(request: dict[str, Any]) -> str | None:
    requested = request.get("requested_quantity")
    minimum = request.get("min_quantity_snapshot")
    maximum = request.get("max_quantity_snapshot")
    direction = request.get("quantity_limit_direction")

    if (
        not isinstance(requested, int)
        or isinstance(requested, bool)
        or not isinstance(minimum, int)
        or isinstance(minimum, bool)
        or minimum <= 0
    ):
        return None

    if direction == "below_min" and requested < minimum:
        return (
            f"Bu mağazada minimum sipariş adedi {minimum}. "
            f"{requested} adet bu sınırın altında. "
            "Bunun için satıcıyla görüşmeniz gerekiyor."
        )

    if (
        direction == "above_max"
        and isinstance(maximum, int)
        and not isinstance(maximum, bool)
        and maximum >= minimum
        and requested > maximum
    ):
        return (
            f"Bu mağazada bir sipariş için en fazla {maximum} adet kabul ediliyor. "
            f"{requested} adet bu sınırın üzerinde. "
            "Bunun için satıcıyla görüşmeniz gerekiyor."
        )

    return None


def handle_quantity_message(
    *,
    seller_id: int,
    customer_id: int,
    source_message_id: int,
    message_text: str,
    product_info: Any,
) -> dict[str, Any]:
    """Quantity sorusunu yanıtlar; yalnız sınır dışındaysa seller-review kaydı üretir."""
    detection = detect_quantity_question(message_text)
    if detection.get("detected") is not True:
        return {"durum": "başarılı", "handled": False}

    requested = detection.get("requested_quantity")
    if requested is None:
        minimum, maximum = _configured_limits(product_info)
        if minimum is None:
            return {
                "durum": "hata",
                "handled": True,
                "error_code": "quantity_limits_unavailable",
                "mesaj": "Sipariş adet sınırları doğrulanamadı.",
            }
        return {
            "durum": "başarılı",
            "handled": True,
            "review_required": False,
            "ambiguous_quantity": detection.get("ambiguous") is True,
            "response_text": _limits_sentence(minimum, maximum),
        }

    result = evaluate_quantity_limit_request(
        seller_id,
        customer_id,
        source_message_id,
        requested,
        reason_text=message_text,
    )
    if result.get("durum") != "başarılı":
        return {
            "durum": "hata",
            "handled": True,
            "error_code": "quantity_limit_evaluation_failed",
            "mesaj": result.get("mesaj") or "Sipariş adet sınırı değerlendirilemedi.",
        }

    if result.get("within_limit") is True:
        minimum = result["min_quantity"]
        maximum = result.get("max_quantity")
        return {
            "durum": "başarılı",
            "handled": True,
            "review_required": False,
            "response_text": (
                f"{requested} adet, mağazanın belirlediği sipariş adet sınırları içinde. "
                + _limits_sentence(minimum, maximum)
            ),
        }

    request = result.get("request")
    if not isinstance(request, dict):
        return {
            "durum": "hata",
            "handled": True,
            "error_code": "quantity_review_invalid",
            "mesaj": "Adet sınırı review kaydı doğrulanamadı.",
        }

    response_text = _review_response(request)
    if response_text is None:
        return {
            "durum": "hata",
            "handled": True,
            "error_code": "quantity_review_invalid",
            "mesaj": "Adet sınırı review kaydı doğrulanamadı.",
        }

    return {
        "durum": "başarılı",
        "handled": True,
        "review_required": True,
        "response_text": response_text,
        "request": request,
        "notification_created": result.get("notification_created") is True,
        "idempotent": result.get("idempotent") is True,
    }

from __future__ import annotations

import re
from typing import Any

from database import (
    CONTROL_STATE_RETURN_REVIEW,
    RETURN_IMAGE_REQUIREMENTS,
    RETURN_ISSUE_STATUS_COLLECTING,
    RETURN_ISSUE_STATUS_HANDLED,
    RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED,
    RETURN_ISSUE_TYPES,
    add_return_issue_request_evidence,
    create_or_get_return_issue_request,
    get_customers_by_ids,
    get_return_issue_request_detail,
    get_return_issue_type_settings,
    list_orders,
    list_return_issue_requests,
    mark_return_issue_handled,
    mark_return_issue_review_required,
    transition_conversation_control,
    update_return_issue_request_from_message,
    update_return_issue_type_setting,
)
from return_issue_repository import (
    QUANTITY_LIMIT_ISSUE_TYPE,
    get_active_collectable_return_issue_request,
)


ISSUE_TYPE_ORDER = [
    "RETURN_REQUEST",
    "DAMAGED_ITEM",
    "WRONG_ITEM",
    "PRINT_OR_PERSONALIZATION_ISSUE",
    "DELIVERY_ISSUE",
    "OTHER_ORDER_ISSUE",
]

ISSUE_TYPE_DISPLAY_NAMES = {
    "RETURN_REQUEST": "İade talebi",
    "DAMAGED_ITEM": "Hasarlı ürün",
    "WRONG_ITEM": "Yanlış ürün",
    "PRINT_OR_PERSONALIZATION_ISSUE": "Baskı / kişiselleştirme sorunu",
    "DELIVERY_ISSUE": "Teslimat sorunu",
    "OTHER_ORDER_ISSUE": "Diğer sipariş sorunu",
    QUANTITY_LIMIT_ISSUE_TYPE: "Adet sınırı talebi",
}

_IMAGE_REQUIREMENT_DEFAULT = "OPTIONAL"

_DAMAGED_TERMS = (
    "kırık",
    "kirik",
    "hasarlı",
    "hasarli",
    "çatlak",
    "catlak",
    "ezik",
    "parçalandı",
    "parcalandi",
)
_WRONG_ITEM_TERMS = (
    "yanlış ürün",
    "yanlis urun",
    "farklı ürün",
    "farkli urun",
    "başka ürün",
    "baska urun",
)
_PRINT_TERMS = (
    "baskı",
    "baski",
    "kişiselleştirme",
    "kisisellestirme",
    "yazı yanlış",
    "yazi yanlis",
    "isim yanlış",
    "isim yanlis",
    "tasarım yanlış",
    "tasarim yanlis",
)
_DELIVERY_TERMS = (
    "teslim edilmedi",
    "ulaşmadı",
    "ulasmadi",
    "kargoda kayıp",
    "kargo kayıp",
    "kargom gelmedi",
    "teslimat sorunu",
    "kargo gecikti",
    "kargom gecikti",
)

_URGENT_TERMS = (
    "yaralandım",
    "yaralandim",
    "kanama",
    "hastaneye",
    "hastane",
    "zehirlendim",
    "zehirlenme",
    "yangın",
    "yangin",
    "patladı",
    "patladi",
    "elektrik çarptı",
    "elektrik carpti",
    "acil yardım",
    "acil yardim",
    "sağlık sorunu",
    "saglik sorunu",
)

_GENERIC_RETURN_PATTERNS = (
    r"^iade(?:\s+etmek)?\s+istiyorum[.!\s]*$",
    r"^iade\s+istiyorum[.!\s]*$",
    r"^ürünü\s+iade\s+etmek\s+istiyorum[.!\s]*$",
    r"^urunu\s+iade\s+etmek\s+istiyorum[.!\s]*$",
    r"^değişim\s+istiyorum[.!\s]*$",
    r"^degisim\s+istiyorum[.!\s]*$",
)

_EXPLICIT_ORDER_PATTERNS = (
    re.compile(
        r"(?:sipariş|siparis)\s*(?:numarası|numarasi|numaram|no|nolu|#)?\s*[:#-]?\s*"
        r"([A-Za-z0-9][A-Za-z0-9_-]{2,99})",
        re.IGNORECASE,
    ),
    re.compile(r"#([A-Za-z0-9][A-Za-z0-9_-]{2,99})"),
)
_STANDALONE_ORDER_NUMBER_PATTERN = re.compile(
    r"[A-Za-z0-9][A-Za-z0-9_.\/-]{2,99}"
)


def _is_positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _error(
    code: str,
    message: str,
    *,
    kind: str = "unavailable",
    fail_closed: bool = False,
    request: dict[str, Any] | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "durum": "hata",
        "error_code": code,
        "mesaj": message,
        "kind": kind,
    }
    if fail_closed:
        result["fail_closed"] = True
        result["outgoing_allowed"] = False
    if request is not None:
        result["request"] = request
    return result


def _map_database_error(
    result: dict[str, Any],
    *,
    default_code: str,
    default_message: str,
) -> dict[str, Any]:
    durum = result.get("durum")
    if durum in {"bulunamadı", "reddedildi"}:
        return _error(
            "return_issue_not_found",
            "İade/sorun talebi bulunamadı.",
            kind="not_found",
        )
    if durum == "çakışma":
        mapped = _error(
            "return_issue_version_conflict",
            result.get("mesaj") or "İade/sorun talebi değişti.",
            kind="conflict",
        )
        if result.get("request") is not None:
            mapped["request"] = result["request"]
        if result.get("setting") is not None:
            mapped["setting"] = result["setting"]
        return mapped
    if durum == "doğrulama_hatası":
        return _error(
            "return_issue_validation_error",
            result.get("mesaj") or default_message,
            kind="validation",
        )
    return _error(default_code, default_message, kind="unavailable")


def classify_issue_type(intent: str, message: str) -> str:
    """Return/complaint mesajını deterministic canonical issue type'a map eder."""
    normalized = " ".join((message or "").strip().lower().split())

    if any(term in normalized for term in _DAMAGED_TERMS):
        return "DAMAGED_ITEM"
    if any(term in normalized for term in _WRONG_ITEM_TERMS):
        return "WRONG_ITEM"
    if any(term in normalized for term in _PRINT_TERMS):
        return "PRINT_OR_PERSONALIZATION_ISSUE"
    if any(term in normalized for term in _DELIVERY_TERMS):
        return "DELIVERY_ISSUE"
    if intent == "return_request":
        return "RETURN_REQUEST"
    return "OTHER_ORDER_ISSUE"


def is_urgent_issue_message(message: str) -> bool:
    normalized = " ".join((message or "").strip().lower().split())
    return any(term in normalized for term in _URGENT_TERMS)


def extract_explicit_order_number(message: str) -> str | None:
    text = (message or "").strip()
    if not text:
        return None
    for pattern in _EXPLICIT_ORDER_PATTERNS:
        match = pattern.search(text)
        if match:
            value = match.group(1).strip()
            if 1 <= len(value) <= 100:
                return value
    return None


def parse_order_number_answer(message: str) -> str | None:
    """Takip sorusuna verilen sipariş numarasını tahminsiz normalize eder."""
    text = (message or "").strip()
    if not text:
        return None

    explicit = extract_explicit_order_number(text)
    if explicit is not None:
        return explicit

    if not _STANDALONE_ORDER_NUMBER_PATTERN.fullmatch(text):
        return None
    if not any(char.isdigit() for char in text):
        return None
    return text


def initial_reason_candidate(
    issue_type: str,
    message: str,
) -> str | None:
    """İlk intent mesajı gerçekten sorun açıklaması içeriyorsa reason olarak kullanır."""
    normalized = " ".join((message or "").strip().split())
    if not normalized or len(normalized) > 2000:
        return None

    if issue_type != "RETURN_REQUEST":
        return normalized

    lowered = normalized.translate(str.maketrans({"I": "ı", "İ": "i"})).lower()
    for pattern in _GENERIC_RETURN_PATTERNS:
        if re.fullmatch(pattern, lowered, flags=re.IGNORECASE):
            return None

    return normalized


def _resolve_order_candidate(
    seller_id: int,
    customer_id: int,
    *,
    external_order_number: str | None = None,
) -> dict[str, Any]:
    """Exact order number veya tek historical order varsa güvenli link çözer."""
    if external_order_number is not None:
        result = list_orders(
            seller_id,
            customer_id=customer_id,
            external_order_number=external_order_number,
            limit=2,
            offset=0,
        )
    else:
        result = list_orders(
            seller_id,
            customer_id=customer_id,
            limit=2,
            offset=0,
        )

    if result.get("durum") != "başarılı":
        return _map_database_error(
            result,
            default_code="return_issue_order_lookup_unavailable",
            default_message="Sipariş bilgisi şu anda doğrulanamıyor.",
        )

    orders = result.get("orders") or []
    if len(orders) == 1:
        return {"durum": "başarılı", "order": orders[0]}
    return {"durum": "başarılı", "order": None}


def _missing_fields(detail: dict[str, Any]) -> list[str]:
    request = detail["request"]
    missing: list[str] = []

    if request.get("order_id") is None and not (
        isinstance(request.get("external_order_number_snapshot"), str)
        and request["external_order_number_snapshot"].strip()
    ):
        missing.append("order_number")

    if not (
        isinstance(request.get("reason_text"), str)
        and request["reason_text"].strip()
    ):
        missing.append("reason")

    if request.get("image_requirement_snapshot") == "REQUIRED":
        if not detail.get("evidence"):
            missing.append("image")

    return missing


def build_collection_question(awaiting: str) -> str:
    if awaiting == "order_number":
        return "Sipariş numaranızı paylaşır mısınız?"
    if awaiting == "reason":
        return "Sorunu kısaca anlatır mısınız?"
    if awaiting == "image":
        return "İnceleme için ürünün fotoğrafını gönderebilir misiniz?"
    raise ValueError(f"Desteklenmeyen return/issue collection alanı: {awaiting}")


def get_request_collection_state(
    seller_id: int,
    request_id: int,
) -> dict[str, Any]:
    detail = get_return_issue_request_detail(seller_id, request_id)
    if detail.get("durum") != "başarılı":
        return _map_database_error(
            detail,
            default_code="return_issue_detail_unavailable",
            default_message="İade/sorun talebi detayı okunamadı.",
        )

    request = detail.get("request")
    if isinstance(request, dict) and request.get("issue_type") == QUANTITY_LIMIT_ISSUE_TYPE:
        return {
            "durum": "başarılı",
            **detail,
            "missing_fields": [],
            "awaiting": None,
            "ready_for_review": True,
            "question": None,
        }

    missing = _missing_fields(detail)
    awaiting = missing[0] if missing else None
    return {
        "durum": "başarılı",
        **detail,
        "missing_fields": missing,
        "awaiting": awaiting,
        "ready_for_review": not missing,
        "question": build_collection_question(awaiting) if awaiting else None,
    }


def _finalize_review(
    *,
    seller_id: int,
    customer_id: int,
    request_id: int,
    source_message_id: int,
    starting_control_version: int,
    force_review: bool,
    review_reason_code: str | None = None,
    review_note: str | None = None,
) -> dict[str, Any]:
    review_result = mark_return_issue_review_required(
        seller_id,
        customer_id,
        request_id,
        force_review=force_review,
        review_reason_code=review_reason_code,
        review_note=review_note,
    )

    if review_result.get("durum") != "başarılı":
        request = review_result.get("request")
        return _error(
            "return_issue_review_persist_failed",
            "Talep satıcı incelemesine güvenli biçimde alınamadı.",
            kind="unavailable",
            fail_closed=True,
            request=request,
        )

    request = review_result["request"]

    control_result = transition_conversation_control(
        seller_id=seller_id,
        customer_id=customer_id,
        to_control_state=CONTROL_STATE_RETURN_REVIEW,
        reason_code="return_issue_review",
        reason_note=review_note,
        trigger_message_id=source_message_id,
        expected_version=starting_control_version,
    )

    if control_result.get("durum") != "başarılı":
        return _error(
            "return_issue_review_transition_failed",
            (
                "Talep kalıcı olarak satıcı incelemesine alındı fakat konuşma "
                "kontrolü güncellenemedi. Normal otomasyon kapalı tutulmalıdır."
            ),
            kind=(
                "conflict"
                if control_result.get("durum") == "çakışma"
                else "unavailable"
            ),
            fail_closed=True,
            request=request,
        ) | {
            "notification_created": review_result.get("notification_created") is True,
        }

    return {
        "durum": "başarılı",
        "state": "seller_review_required",
        "request": request,
        "review_required": True,
        "outgoing_allowed": False,
        "notification_created": review_result.get("notification_created") is True,
        "control": control_result.get("control"),
        "control_changed": control_result.get("changed") is True,
    }


def _collect_into_request(
    *,
    seller_id: int,
    customer_id: int,
    request: dict[str, Any],
    source_message_id: int,
    message_text: str,
    message_type: str,
    starting_control_version: int,
    urgent: bool,
    consume_as_answer: bool = True,
) -> dict[str, Any]:
    request_id = request.get("id")
    if not _is_positive_int(request_id):
        return _error(
            "return_issue_request_invalid",
            "İade/sorun talebi kimliği geçersiz.",
            fail_closed=True,
        )

    if request.get("issue_type") == QUANTITY_LIMIT_ISSUE_TYPE:
        return _error(
            "return_issue_collection_type_invalid",
            "Adet sınırı talebi bilgi toplama akışına alınamaz.",
            kind="conflict",
            fail_closed=True,
            request=request,
        )

    if request.get("status") == RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED:
        return _finalize_review(
            seller_id=seller_id,
            customer_id=customer_id,
            request_id=request_id,
            source_message_id=source_message_id,
            starting_control_version=starting_control_version,
            force_review=False,
        )

    if request.get("status") != RETURN_ISSUE_STATUS_COLLECTING:
        return _error(
            "return_issue_request_not_collecting",
            "İade/sorun talebi bilgi toplama durumunda değil.",
            kind="conflict",
            fail_closed=True,
            request=request,
        )

    state = get_request_collection_state(seller_id, request_id)
    if state.get("durum") != "başarılı":
        return {**state, "fail_closed": True, "outgoing_allowed": False}

    if message_type == "image":
        evidence_result = add_return_issue_request_evidence(
            seller_id,
            customer_id,
            request_id,
            source_message_id,
        )
        if evidence_result.get("durum") not in {"başarılı", "çakışma"}:
            return _error(
                "return_issue_evidence_persist_failed",
                "Gönderilen görsel güvenli biçimde kaydedilemedi.",
                fail_closed=True,
                request=state.get("request"),
            )

    awaiting = state.get("awaiting")
    normalized_text = (message_text or "").strip()

    if not consume_as_answer:
        if urgent:
            return _finalize_review(
                seller_id=seller_id,
                customer_id=customer_id,
                request_id=request_id,
                source_message_id=source_message_id,
                starting_control_version=starting_control_version,
                force_review=True,
                review_reason_code="urgent_customer_issue",
                review_note=(
                    "Yüksek riskli müşteri sorunu otomatik bilgi toplama "
                    "yapılmadan satıcıya bırakıldı."
                ),
            )

        refreshed = get_request_collection_state(seller_id, request_id)
        if refreshed.get("durum") != "başarılı":
            return {**refreshed, "fail_closed": True, "outgoing_allowed": False}

        if refreshed["ready_for_review"]:
            return _finalize_review(
                seller_id=seller_id,
                customer_id=customer_id,
                request_id=request_id,
                source_message_id=source_message_id,
                starting_control_version=starting_control_version,
                force_review=False,
            )

        return {
            "durum": "başarılı",
            "state": "collecting",
            "request": refreshed["request"],
            "awaiting": refreshed["awaiting"],
            "missing_fields": refreshed["missing_fields"],
            "question": refreshed["question"],
            "review_required": False,
            "outgoing_allowed": True,
        }

    if urgent:
        return _finalize_review(
            seller_id=seller_id,
            customer_id=customer_id,
            request_id=request_id,
            source_message_id=source_message_id,
            starting_control_version=starting_control_version,
            force_review=True,
            review_reason_code="urgent_customer_issue",
            review_note=(
                "Yüksek riskli müşteri sorunu otomatik bilgi toplama "
                "yapılmadan satıcıya bırakıldı."
            ),
        )

    if awaiting == "order_number" and message_type != "image":
        if not normalized_text or len(normalized_text) > 100:
            return {
                "durum": "başarılı",
                "state": "collecting",
                "request": state["request"],
                "awaiting": "order_number",
                "question": build_collection_question("order_number"),
                "validation_error": "Sipariş numarası geçerli değil.",
                "review_required": False,
                "outgoing_allowed": True,
            }

        order_number = parse_order_number_answer(normalized_text)
        if order_number is None:
            return {
                "durum": "başarılı",
                "state": "collecting",
                "request": state["request"],
                "awaiting": "order_number",
                "question": build_collection_question("order_number"),
                "validation_error": "Sipariş numarası geçerli değil.",
                "review_required": False,
                "outgoing_allowed": True,
            }

        order_lookup = _resolve_order_candidate(
            seller_id,
            customer_id,
            external_order_number=order_number,
        )
        if order_lookup.get("durum") != "başarılı":
            return {**order_lookup, "fail_closed": True, "outgoing_allowed": False}

        linked_order = order_lookup.get("order")
        update_result = update_return_issue_request_from_message(
            seller_id,
            customer_id,
            request_id,
            source_message_id,
            external_order_number=order_number,
            order_id=(linked_order or {}).get("id"),
        )
        if update_result.get("durum") != "başarılı":
            return _map_database_error(
                update_result,
                default_code="return_issue_order_persist_failed",
                default_message="Sipariş bilgisi kaydedilemedi.",
            ) | {"fail_closed": True, "outgoing_allowed": False}

    elif awaiting == "reason" and message_type != "image":
        if not normalized_text or len(normalized_text) > 2000:
            return {
                "durum": "başarılı",
                "state": "collecting",
                "request": state["request"],
                "awaiting": "reason",
                "question": build_collection_question("reason"),
                "validation_error": "Sorun açıklaması geçerli değil.",
                "review_required": False,
                "outgoing_allowed": True,
            }

        update_result = update_return_issue_request_from_message(
            seller_id,
            customer_id,
            request_id,
            source_message_id,
            reason_text=normalized_text,
        )
        if update_result.get("durum") != "başarılı":
            return _map_database_error(
                update_result,
                default_code="return_issue_reason_persist_failed",
                default_message="Sorun açıklaması kaydedilemedi.",
            ) | {"fail_closed": True, "outgoing_allowed": False}

    elif awaiting == "image" and message_type != "image":
        return {
            "durum": "başarılı",
            "state": "collecting",
            "request": state["request"],
            "awaiting": "image",
            "question": build_collection_question("image"),
            "validation_error": "Bu adım için görsel gereklidir.",
            "review_required": False,
            "outgoing_allowed": True,
        }

    refreshed = get_request_collection_state(seller_id, request_id)
    if refreshed.get("durum") != "başarılı":
        return {**refreshed, "fail_closed": True, "outgoing_allowed": False}

    if refreshed["ready_for_review"]:
        return _finalize_review(
            seller_id=seller_id,
            customer_id=customer_id,
            request_id=request_id,
            source_message_id=source_message_id,
            starting_control_version=starting_control_version,
            force_review=False,
        )

    return {
        "durum": "başarılı",
        "state": "collecting",
        "request": refreshed["request"],
        "awaiting": refreshed["awaiting"],
        "missing_fields": refreshed["missing_fields"],
        "question": refreshed["question"],
        "review_required": False,
        "outgoing_allowed": True,
    }


def process_customer_issue_message(
    *,
    seller_id: int,
    customer_id: int,
    source_message_id: int,
    message_text: str,
    message_type: str,
    intent: str,
    starting_control_version: int,
) -> dict[str, Any]:
    """Yeni veya açık return/issue request için tek incoming mesajı işler."""
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
        or not _is_positive_int(source_message_id)
        or not _is_positive_int(starting_control_version)
    ):
        return _error(
            "return_issue_validation_error",
            "İade/sorun işlem kimlikleri geçersiz.",
            kind="validation",
            fail_closed=True,
        )

    if intent not in {"return_request", "complaint", "continue"}:
        return _error(
            "return_issue_validation_error",
            "İade/sorun intent değeri geçersiz.",
            kind="validation",
            fail_closed=True,
        )

    if message_type not in {"text", "image"}:
        return _error(
            "return_issue_unsupported_message_type",
            "Bu mesaj türü otomatik iade/sorun toplama için desteklenmiyor.",
            kind="validation",
            fail_closed=True,
        )

    active_result = get_active_collectable_return_issue_request(seller_id, customer_id)
    if active_result.get("durum") != "başarılı":
        return _map_database_error(
            active_result,
            default_code="return_issue_active_lookup_unavailable",
            default_message="Açık iade/sorun talebi kontrol edilemedi.",
        ) | {"fail_closed": True, "outgoing_allowed": False}

    active_request = active_result.get("request")
    urgent = is_urgent_issue_message(message_text)

    if active_request is not None:
        return _collect_into_request(
            seller_id=seller_id,
            customer_id=customer_id,
            request=active_request,
            source_message_id=source_message_id,
            message_text=message_text,
            message_type=message_type,
            starting_control_version=starting_control_version,
            urgent=urgent,
        )

    if intent == "continue":
        return _error(
            "return_issue_not_found",
            "Devam ettirilecek açık iade/sorun talebi bulunamadı.",
            kind="not_found",
            fail_closed=True,
        )

    issue_type = classify_issue_type(intent, message_text)
    explicit_order_number = extract_explicit_order_number(message_text)
    reason = initial_reason_candidate(issue_type, message_text)

    order_lookup = _resolve_order_candidate(
        seller_id,
        customer_id,
        external_order_number=explicit_order_number,
    )
    if order_lookup.get("durum") != "başarılı":
        return {**order_lookup, "fail_closed": True, "outgoing_allowed": False}

    linked_order = order_lookup.get("order")

    create_result = create_or_get_return_issue_request(
        seller_id,
        customer_id,
        source_message_id,
        issue_type,
        initial_reason_text=reason,
        order_id=(linked_order or {}).get("id"),
        external_order_number=explicit_order_number,
    )
    if create_result.get("durum") != "başarılı":
        return _map_database_error(
            create_result,
            default_code="return_issue_create_failed",
            default_message="İade/sorun talebi kaydedilemedi.",
        ) | {"fail_closed": True, "outgoing_allowed": False}

    request = create_result["request"]

    return _collect_into_request(
        seller_id=seller_id,
        customer_id=customer_id,
        request=request,
        source_message_id=source_message_id,
        message_text=message_text,
        message_type=message_type,
        starting_control_version=starting_control_version,
        urgent=urgent,
        consume_as_answer=False,
    )


# =====================================================
# SELLER READ / ACTION HELPERS
# =====================================================


def list_seller_return_issue_requests(
    seller_id: int,
    *,
    view: str = "all",
    customer_id: int | None = None,
    issue_type: str | None = None,
    external_order_number: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    result = list_return_issue_requests(
        seller_id,
        view=view,
        customer_id=customer_id,
        issue_type=issue_type,
        external_order_number=external_order_number,
        limit=limit,
        offset=offset,
    )
    if result.get("durum") != "başarılı":
        return _map_database_error(
            result,
            default_code="return_issue_list_unavailable",
            default_message="İade/sorun talepleri okunamadı.",
        )

    requests = result["requests"]

    unique_customer_ids: list[int] = []
    seen_customer_ids: set[int] = set()
    for row in requests:
        row_customer_id = row.get("customer_id")
        if (
            _is_positive_int(row_customer_id)
            and row_customer_id not in seen_customer_ids
        ):
            seen_customer_ids.add(row_customer_id)
            unique_customer_ids.append(row_customer_id)

    phone_by_customer_id: dict[int, Any] = {}
    if unique_customer_ids:
        customers_result = get_customers_by_ids(seller_id, unique_customer_ids)
        if customers_result.get("durum") != "başarılı":
            return _map_database_error(
                customers_result,
                default_code="return_issue_list_unavailable",
                default_message="İade/sorun talepleri okunamadı.",
            )
        for customer in customers_result.get("customers") or []:
            found_id = customer.get("id")
            if _is_positive_int(found_id):
                phone_by_customer_id[found_id] = customer.get("whatsapp_number")

    return {
        "durum": "başarılı",
        "toplam": result["toplam"],
        "requests": [
            {
                **row,
                "customer_phone": phone_by_customer_id.get(
                    row.get("customer_id")
                ),
                "display_issue_type": ISSUE_TYPE_DISPLAY_NAMES.get(
                    row.get("issue_type"), row.get("issue_type")
                ),
                "seller_action_required": (
                    row.get("status") == RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED
                ),
            }
            for row in requests
        ],
    }


def get_seller_return_issue_request_detail(
    seller_id: int,
    request_id: int,
) -> dict[str, Any]:
    state = get_request_collection_state(seller_id, request_id)
    if state.get("durum") != "başarılı":
        return state

    request = state["request"]
    return {
        "durum": "başarılı",
        "request": {
            **request,
            "display_issue_type": ISSUE_TYPE_DISPLAY_NAMES.get(
                request.get("issue_type"), request.get("issue_type")
            ),
            "seller_action_required": (
                request.get("status") == RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED
            ),
        },
        "customer": state.get("customer"),
        "order": state.get("order"),
        "evidence": state.get("evidence") or [],
        "missing_fields": state["missing_fields"],
    }


def get_seller_return_issue_settings(seller_id: int) -> dict[str, Any]:
    result = get_return_issue_type_settings(seller_id)
    if result.get("durum") != "başarılı":
        return _map_database_error(
            result,
            default_code="return_issue_settings_unavailable",
            default_message="İade/sorun ayarları okunamadı.",
        )

    materialized = {
        row.get("issue_type"): row
        for row in result.get("settings") or []
        if row.get("issue_type") in RETURN_ISSUE_TYPES
    }

    settings: list[dict[str, Any]] = []
    for issue_type in ISSUE_TYPE_ORDER:
        row = materialized.get(issue_type)
        if row is None:
            settings.append(
                {
                    "issue_type": issue_type,
                    "display_name": ISSUE_TYPE_DISPLAY_NAMES[issue_type],
                    "image_requirement": _IMAGE_REQUIREMENT_DEFAULT,
                    "version": 1,
                    "updated_at": None,
                }
            )
            continue

        settings.append(
            {
                "issue_type": issue_type,
                "display_name": ISSUE_TYPE_DISPLAY_NAMES[issue_type],
                "image_requirement": row.get("image_requirement") or _IMAGE_REQUIREMENT_DEFAULT,
                "version": row.get("version"),
                "updated_at": row.get("updated_at"),
            }
        )

    return {"durum": "başarılı", "settings": settings}


def update_seller_return_issue_setting(
    seller_id: int,
    issue_type: str,
    image_requirement: str,
    expected_version: int,
) -> dict[str, Any]:
    if issue_type not in RETURN_ISSUE_TYPES:
        return _error(
            "return_issue_validation_error",
            "Geçersiz iade/sorun tipi.",
            kind="validation",
        )
    if image_requirement not in RETURN_IMAGE_REQUIREMENTS:
        return _error(
            "return_issue_validation_error",
            "Geçersiz görsel gereksinimi.",
            kind="validation",
        )

    result = update_return_issue_type_setting(
        seller_id,
        issue_type,
        image_requirement,
        expected_version,
    )
    if result.get("durum") != "başarılı":
        return _map_database_error(
            result,
            default_code="return_issue_setting_update_unavailable",
            default_message="İade/sorun ayarı güncellenemedi.",
        )

    setting = result["setting"]
    return {
        "durum": "başarılı",
        "changed": result.get("changed") is True,
        "setting": {
            "issue_type": issue_type,
            "display_name": ISSUE_TYPE_DISPLAY_NAMES[issue_type],
            "image_requirement": setting.get("image_requirement"),
            "version": setting.get("version"),
            "updated_at": setting.get("updated_at"),
        },
    }


def mark_seller_return_issue_handled(
    seller_id: int,
    request_id: int,
    actor_profile_id: int,
    expected_version: int,
    *,
    note: str | None = None,
) -> dict[str, Any]:
    result = mark_return_issue_handled(
        seller_id,
        request_id,
        actor_profile_id,
        expected_version,
        seller_note=note,
    )
    if result.get("durum") != "başarılı":
        return _map_database_error(
            result,
            default_code="return_issue_handle_unavailable",
            default_message="İade/sorun talebi handled olarak işaretlenemedi.",
        )

    return {
        "durum": "başarılı",
        "changed": result.get("changed") is True,
        "request": result["request"],
    }

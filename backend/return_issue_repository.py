from __future__ import annotations

from typing import Any

from database import get_supabase


QUANTITY_LIMIT_ISSUE_TYPE = "QUANTITY_LIMIT_REQUEST"


def _is_positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def get_active_collectable_return_issue_request(
    seller_id: int,
    customer_id: int,
) -> dict[str, Any]:
    """Return collection için quantity-review satırlarını hariç tutarak açık kaydı okur."""
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id ve customer_id pozitif tam sayı olmalıdır.",
        }

    try:
        result = (
            get_supabase()
            .table("return_issue_requests")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("customer_id", customer_id)
            .in_("status", ["COLLECTING", "SELLER_REVIEW_REQUIRED"])
            .neq("issue_type", QUANTITY_LIMIT_ISSUE_TYPE)
            .order("id")
            .limit(1)
            .execute()
        )
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Açık iade/sorun talebi okunamadı.",
        }

    rows = result.data or []
    if rows and not isinstance(rows[0], dict):
        return {
            "durum": "hata",
            "mesaj": "Açık iade/sorun talebi geçersiz yanıt döndürdü.",
        }

    return {
        "durum": "başarılı",
        "request": rows[0] if rows else None,
    }


def evaluate_quantity_limit_request(
    seller_id: int,
    customer_id: int,
    source_message_id: int,
    requested_quantity: int,
    *,
    reason_text: str | None = None,
) -> dict[str, Any]:
    """DB-authoritative min/max ile quantity talebini değerlendirir ve gerekirse review upsert eder."""
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
        or not _is_positive_int(source_message_id)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id, customer_id ve source_message_id pozitif tam sayı olmalıdır.",
        }

    if (
        not isinstance(requested_quantity, int)
        or isinstance(requested_quantity, bool)
        or requested_quantity < 0
        or requested_quantity > 999_999_999
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "requested_quantity geçerli bir tam sayı olmalıdır.",
        }

    normalized_reason = None
    if reason_text is not None:
        if not isinstance(reason_text, str):
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "reason_text metin olmalıdır.",
            }
        normalized_reason = reason_text.strip() or None
        if normalized_reason is not None and len(normalized_reason) > 2000:
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "reason_text en fazla 2000 karakter olabilir.",
            }

    try:
        result = get_supabase().rpc(
            "evaluate_quantity_limit_request",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "source_message_id": source_message_id,
                "requested_quantity_value": requested_quantity,
                "reason_text_value": normalized_reason,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Sipariş adet sınırı değerlendirilemedi.",
        }

    payload = result.data
    if isinstance(payload, list) and len(payload) == 1 and isinstance(payload[0], dict):
        payload = payload[0]
    if not isinstance(payload, dict):
        return {
            "durum": "hata",
            "mesaj": "Sipariş adet sınırı geçersiz yanıt döndürdü.",
        }

    status = payload.get("status")
    if status == "within_limit":
        minimum = payload.get("min_quantity")
        maximum = payload.get("max_quantity")
        returned_quantity = payload.get("requested_quantity")
        if (
            not _is_positive_int(minimum)
            or (
                maximum is not None
                and (
                    not _is_positive_int(maximum)
                    or maximum < minimum
                )
            )
            or returned_quantity != requested_quantity
        ):
            return {
                "durum": "hata",
                "mesaj": "Sipariş adet sınırı geçersiz yanıt döndürdü.",
            }
        return {
            "durum": "başarılı",
            "within_limit": True,
            "requested_quantity": requested_quantity,
            "min_quantity": minimum,
            "max_quantity": maximum,
            "review_required": False,
        }

    if status == "review_required":
        request = payload.get("request")
        if not isinstance(request, dict):
            return {
                "durum": "hata",
                "mesaj": "Adet sınırı review kaydı doğrulanamadı.",
            }
        if request.get("issue_type") != QUANTITY_LIMIT_ISSUE_TYPE:
            return {
                "durum": "hata",
                "mesaj": "Adet sınırı review türü doğrulanamadı.",
            }
        direction = request.get("quantity_limit_direction")
        if direction not in {"below_min", "above_max"}:
            return {
                "durum": "hata",
                "mesaj": "Adet sınırı review yönü doğrulanamadı.",
            }
        return {
            "durum": "başarılı",
            "within_limit": False,
            "review_required": True,
            "changed": payload.get("changed") is True,
            "created": payload.get("created") is True,
            "idempotent": payload.get("idempotent") is True,
            "race_resolved": payload.get("race_resolved") is True,
            "notification_created": payload.get("notification_created") is True,
            "request": request,
        }

    if status == "not_found":
        return {
            "durum": "bulunamadı",
            "mesaj": "Satıcı bulunamadı.",
        }
    if status == "forbidden":
        return {
            "durum": "reddedildi",
            "mesaj": "Adet talebi bu tenant için geçersiz.",
        }
    if status == "limits_unavailable":
        return {
            "durum": "doğrulama_hatası",
            "mesaj": payload.get("message") or "Sipariş adet sınırları kullanılamıyor.",
        }
    if status == "error":
        return {
            "durum": "hata",
            "mesaj": payload.get("message") or "Sipariş adet sınırı değerlendirilemedi.",
        }

    return {
        "durum": "hata",
        "mesaj": "Sipariş adet sınırı geçersiz yanıt döndürdü.",
    }

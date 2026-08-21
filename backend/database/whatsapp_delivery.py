from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload
from .common import is_positive_int as _is_positive_int


WHATSAPP_PROVIDER = "whatsapp_cloud"
WHATSAPP_PENDING_PROVIDER = "whatsapp_cloud_pending"
VALID_WHATSAPP_DELIVERY_STATUSES = frozenset(
    {"sent", "delivered", "read", "failed"}
)


def get_supabase():
    import database

    return database.get_supabase()


def _non_empty_string(value: Any, *, max_length: int) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized or len(normalized) > max_length:
        return None
    return normalized


def _delivery_rpc_response(data: Any) -> dict[str, Any]:
    payload = _extract_rpc_payload(data)
    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "WhatsApp teslimat işlemi geçersiz yanıt döndürdü.",
        }

    rpc_status = payload.get("status")
    if rpc_status == "not_found":
        response: dict[str, Any] = {
            "durum": "bulunamadı",
            "mesaj": "WhatsApp teslimat kaydı bulunamadı.",
        }
        if isinstance(payload.get("resource"), str):
            response["resource"] = payload["resource"]
        return response
    if rpc_status == "conflict":
        response = {
            "durum": "çakışma",
            "mesaj": "WhatsApp teslimat kaydı güvenli biçimde güncellenemedi.",
        }
        if isinstance(payload.get("reason"), str):
            response["reason"] = payload["reason"]
        return response
    if rpc_status == "error":
        return {
            "durum": "hata",
            "mesaj": "WhatsApp teslimat işlemi doğrulanamadı.",
        }
    if rpc_status != "success":
        return {
            "durum": "hata",
            "mesaj": "WhatsApp teslimat işlemi geçersiz durum döndürdü.",
        }

    response = {"durum": "başarılı"}
    outbox = payload.get("outbox")
    if isinstance(outbox, dict):
        response["outbox"] = outbox
    for flag in ("created", "claimed", "changed"):
        if payload.get(flag) is not None:
            response[flag] = payload.get(flag) is True
    return response


def resolve_whatsapp_channel(phone_number_id: str) -> dict[str, Any]:
    """Resolve Meta phone_number_id to one active seller-owned channel."""
    normalized = _non_empty_string(phone_number_id, max_length=64)
    if normalized is None:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "phone_number_id geçersiz.",
        }

    try:
        result = (
            get_supabase()
            .table("whatsapp_channels")
            .select("id,seller_id,phone_number_id,is_active")
            .eq("phone_number_id", normalized)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "WhatsApp kanal eşlemesi okunamadı.",
        }

    rows = result.data or []
    if not rows:
        return {
            "durum": "bulunamadı",
            "mesaj": "Aktif WhatsApp kanal eşlemesi bulunamadı.",
        }

    row = rows[0]
    channel_id = row.get("id")
    seller_id = row.get("seller_id")
    if (
        not _is_positive_int(channel_id)
        or not _is_positive_int(seller_id)
        or row.get("phone_number_id") != normalized
        or row.get("is_active") is not True
    ):
        return {
            "durum": "hata",
            "mesaj": "WhatsApp kanal eşlemesi geçersiz veri döndürdü.",
        }

    return {
        "durum": "başarılı",
        "channel": {
            "id": channel_id,
            "seller_id": seller_id,
            "phone_number_id": normalized,
        },
    }


def ensure_whatsapp_delivery_outbox(
    *,
    channel_id: int,
    seller_id: int,
    customer_id: int,
    source_message_id: int,
    message_id: int,
    recipient_id: str,
) -> dict[str, Any]:
    if not all(
        _is_positive_int(value)
        for value in (
            channel_id,
            seller_id,
            customer_id,
            source_message_id,
            message_id,
        )
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "WhatsApp outbox kimlikleri pozitif tam sayı olmalıdır.",
        }
    normalized_recipient = _non_empty_string(recipient_id, max_length=32)
    if normalized_recipient is None or len(normalized_recipient) < 5:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "WhatsApp alıcı kimliği geçersiz.",
        }

    try:
        result = get_supabase().rpc(
            "ensure_whatsapp_delivery_outbox",
            {
                "target_channel_id": channel_id,
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_source_message_id": source_message_id,
                "target_message_id": message_id,
                "recipient_value": normalized_recipient,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "WhatsApp outbox kaydı oluşturulamadı.",
        }
    return _delivery_rpc_response(result.data)


def claim_whatsapp_delivery_outbox(outbox_id: int) -> dict[str, Any]:
    if not _is_positive_int(outbox_id):
        return {"durum": "doğrulama_hatası", "mesaj": "outbox_id geçersiz."}
    try:
        result = get_supabase().rpc(
            "claim_whatsapp_delivery_outbox",
            {"target_outbox_id": outbox_id},
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "WhatsApp outbox kaydı claim edilemedi."}
    return _delivery_rpc_response(result.data)


def mark_whatsapp_delivery_sent(
    outbox_id: int,
    provider_message_id: str,
) -> dict[str, Any]:
    normalized_message_id = _non_empty_string(provider_message_id, max_length=150)
    if not _is_positive_int(outbox_id) or normalized_message_id is None:
        return {"durum": "doğrulama_hatası", "mesaj": "Gönderim sonucu geçersiz."}
    try:
        result = get_supabase().rpc(
            "mark_whatsapp_delivery_sent",
            {
                "target_outbox_id": outbox_id,
                "provider_message_id_value": normalized_message_id,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "WhatsApp gönderim sonucu kaydedilemedi."}
    return _delivery_rpc_response(result.data)


def mark_whatsapp_delivery_failed(
    outbox_id: int,
    error_code: str | None = None,
) -> dict[str, Any]:
    if not _is_positive_int(outbox_id):
        return {"durum": "doğrulama_hatası", "mesaj": "outbox_id geçersiz."}
    normalized_error = (
        _non_empty_string(error_code, max_length=64)
        if error_code is not None
        else None
    )
    try:
        result = get_supabase().rpc(
            "mark_whatsapp_delivery_failed",
            {
                "target_outbox_id": outbox_id,
                "error_code_value": normalized_error,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "WhatsApp failure durumu kaydedilemedi."}
    return _delivery_rpc_response(result.data)


def mark_whatsapp_delivery_unknown(
    outbox_id: int,
    error_code: str | None = None,
) -> dict[str, Any]:
    if not _is_positive_int(outbox_id):
        return {"durum": "doğrulama_hatası", "mesaj": "outbox_id geçersiz."}
    normalized_error = (
        _non_empty_string(error_code, max_length=64)
        if error_code is not None
        else None
    )
    try:
        result = get_supabase().rpc(
            "mark_whatsapp_delivery_unknown",
            {
                "target_outbox_id": outbox_id,
                "error_code_value": normalized_error,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "WhatsApp belirsiz gönderim durumu kaydedilemedi."}
    return _delivery_rpc_response(result.data)


def schedule_whatsapp_delivery_retry(
    outbox_id: int,
    retry_at: str,
    error_code: str | None = None,
) -> dict[str, Any]:
    normalized_retry_at = _non_empty_string(retry_at, max_length=80)
    if not _is_positive_int(outbox_id) or normalized_retry_at is None:
        return {"durum": "doğrulama_hatası", "mesaj": "Retry bilgisi geçersiz."}
    normalized_error = (
        _non_empty_string(error_code, max_length=64)
        if error_code is not None
        else None
    )
    try:
        result = get_supabase().rpc(
            "schedule_whatsapp_delivery_retry",
            {
                "target_outbox_id": outbox_id,
                "retry_at_value": normalized_retry_at,
                "error_code_value": normalized_error,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "WhatsApp retry kaydı oluşturulamadı."}
    return _delivery_rpc_response(result.data)


def apply_whatsapp_delivery_status(
    *,
    phone_number_id: str,
    provider_message_id: str,
    status: str,
    error_code: str | None = None,
) -> dict[str, Any]:
    normalized_phone_id = _non_empty_string(phone_number_id, max_length=64)
    normalized_message_id = _non_empty_string(provider_message_id, max_length=150)
    normalized_status = status.strip().lower() if isinstance(status, str) else ""
    if (
        normalized_phone_id is None
        or normalized_message_id is None
        or normalized_status not in VALID_WHATSAPP_DELIVERY_STATUSES
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "WhatsApp status callback bilgisi geçersiz.",
        }
    normalized_error = (
        _non_empty_string(error_code, max_length=64)
        if error_code is not None
        else None
    )

    try:
        result = get_supabase().rpc(
            "apply_whatsapp_delivery_status",
            {
                "phone_number_id_value": normalized_phone_id,
                "provider_message_id_value": normalized_message_id,
                "status_value": normalized_status,
                "error_code_value": normalized_error,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "WhatsApp teslimat statusu kaydedilemedi."}
    return _delivery_rpc_response(result.data)


def get_next_whatsapp_delivery_outbox_id() -> dict[str, Any]:
    """Return one due outbox identifier; dispatch still performs the atomic claim."""
    try:
        result = get_supabase().rpc(
            "next_whatsapp_delivery_outbox_id",
            {},
        ).execute()
    except Exception:
        return {"durum": "hata"}

    payload = _extract_rpc_payload(result.data)
    if payload is None or payload.get("status") != "success":
        return {"durum": "hata"}
    outbox_id = payload.get("outbox_id")
    if outbox_id is None:
        return {"durum": "boş"}
    if not _is_positive_int(outbox_id):
        return {"durum": "hata"}
    return {"durum": "başarılı", "outbox_id": outbox_id}


def get_whatsapp_delivery_context(outbox_id: int) -> dict[str, Any]:
    """Read the minimum secret-free data needed by a transport adapter."""
    if not _is_positive_int(outbox_id):
        return {"durum": "doğrulama_hatası", "mesaj": "outbox_id geçersiz."}

    try:
        outbox_result = (
            get_supabase()
            .table("whatsapp_delivery_outbox")
            .select(
                "id,channel_id,seller_id,customer_id,source_message_id,message_id,"
                "recipient_id,status,provider_message_id,attempt_count,next_attempt_at"
            )
            .eq("id", outbox_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return {"durum": "hata", "mesaj": "WhatsApp outbox kaydı okunamadı."}

    rows = outbox_result.data or []
    if not rows:
        return {"durum": "bulunamadı", "mesaj": "WhatsApp outbox kaydı bulunamadı."}
    outbox = rows[0]

    channel_id = outbox.get("channel_id")
    message_id = outbox.get("message_id")
    if not _is_positive_int(channel_id) or not _is_positive_int(message_id):
        return {"durum": "hata", "mesaj": "WhatsApp outbox bağlantıları geçersiz."}

    try:
        channel_result = (
            get_supabase()
            .table("whatsapp_channels")
            .select("id,seller_id,phone_number_id,is_active")
            .eq("id", channel_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        message_result = (
            get_supabase()
            .table("messages")
            .select(
                "id,seller_id,customer_id,direction,content,message_type,"
                "provider,provider_message_id,reply_to_message_id"
            )
            .eq("id", message_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return {"durum": "hata", "mesaj": "WhatsApp teslimat bağlamı okunamadı."}

    channel_rows = channel_result.data or []
    message_rows = message_result.data or []
    if not channel_rows or not message_rows:
        return {"durum": "bulunamadı", "mesaj": "WhatsApp teslimat bağlamı eksik."}

    channel = channel_rows[0]
    message = message_rows[0]
    if (
        channel.get("seller_id") != outbox.get("seller_id")
        or message.get("seller_id") != outbox.get("seller_id")
        or message.get("customer_id") != outbox.get("customer_id")
        or message.get("direction") != "outgoing"
        or message.get("provider") != WHATSAPP_PENDING_PROVIDER
        or message.get("provider_message_id") is not None
        or message.get("reply_to_message_id") != outbox.get("source_message_id")
    ):
        return {"durum": "çakışma", "mesaj": "WhatsApp teslimat tenant bağlamı uyuşmuyor."}

    return {
        "durum": "başarılı",
        "outbox": outbox,
        "channel": channel,
        "message": message,
    }

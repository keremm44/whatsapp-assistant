from __future__ import annotations

from typing import Any

from .common import is_positive_int as _is_positive_int


WHATSAPP_PENDING_PROVIDER = "whatsapp_cloud_pending"


def get_supabase():
    import database

    return database.get_supabase()


def get_outgoing_reply_for_source_message(
    *,
    seller_id: int,
    customer_id: int,
    source_message_id: int,
) -> dict[str, Any]:
    if not all(
        _is_positive_int(value)
        for value in (seller_id, customer_id, source_message_id)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "WhatsApp reply kimlikleri geçersiz.",
        }

    try:
        result = (
            get_supabase()
            .table("messages")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("customer_id", customer_id)
            .eq("direction", "outgoing")
            .eq("reply_to_message_id", source_message_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "WhatsApp reply kaydı okunamadı.",
        }

    rows = result.data or []
    if not rows:
        return {
            "durum": "bulunamadı",
            "message": None,
        }
    return {
        "durum": "başarılı",
        "message": rows[0],
    }


def save_whatsapp_pending_outgoing_message(
    *,
    seller_id: int,
    customer_id: int,
    source_message_id: int,
    content: str | None,
    message_type: str = "text",
    media_url: str | None = None,
    was_auto_replied: bool = False,
    ai_confidence: float | None = None,
) -> dict[str, Any]:
    """Insert one pending provider reply atomically correlated to its inbound."""
    if not all(
        _is_positive_int(value)
        for value in (seller_id, customer_id, source_message_id)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "WhatsApp pending reply kimlikleri geçersiz.",
        }

    data: dict[str, Any] = {
        "seller_id": seller_id,
        "customer_id": customer_id,
        "direction": "outgoing",
        "content": content,
        "message_type": message_type,
        "was_auto_replied": was_auto_replied,
        "provider": WHATSAPP_PENDING_PROVIDER,
        "provider_message_id": None,
        "reply_to_message_id": source_message_id,
    }
    if media_url:
        data["media_url"] = media_url
    if ai_confidence is not None:
        data["ai_confidence"] = ai_confidence

    try:
        result = get_supabase().table("messages").insert(data).execute()
        rows = result.data or []
        if not rows:
            return {
                "durum": "hata",
                "mesaj": "WhatsApp pending reply kaydı doğrulanamadı.",
            }
        return {
            "durum": "başarılı",
            "message": rows[0],
        }
    except Exception as exc:
        error_text = str(exc).lower()
        if "23505" not in error_text and "duplicate key" not in error_text:
            return {
                "durum": "hata",
                "mesaj": "WhatsApp pending reply kaydedilemedi.",
            }

    existing = get_outgoing_reply_for_source_message(
        seller_id=seller_id,
        customer_id=customer_id,
        source_message_id=source_message_id,
    )
    if existing.get("durum") != "başarılı":
        return {
            "durum": "hata",
            "mesaj": "WhatsApp pending reply çakışması güvenli biçimde çözülemedi.",
        }

    message = existing.get("message")
    if not isinstance(message, dict):
        return {
            "durum": "hata",
            "mesaj": "WhatsApp pending reply çakışması geçersiz kayıt döndürdü.",
        }
    if (
        message.get("provider") != WHATSAPP_PENDING_PROVIDER
        or message.get("reply_to_message_id") != source_message_id
        or message.get("seller_id") != seller_id
        or message.get("customer_id") != customer_id
    ):
        return {
            "durum": "çakışma",
            "mesaj": "WhatsApp pending reply başka bir kayıtla çakıştı.",
        }

    return {
        "durum": "duplicate",
        "message": message,
        "mesaj": "WhatsApp pending reply daha önce oluşturuldu.",
    }

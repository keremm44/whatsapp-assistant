from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload


_VALID_EVENT_TYPES = frozenset({"inbound_message", "message_status"})
_MAX_EVENT_KEY_LENGTH = 240


def get_supabase():
    import database

    return database.get_supabase()


def enqueue_whatsapp_event(
    *,
    event_type: str,
    event_key: str,
    phone_number_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Durable WhatsApp inbox'a bir normalize provider event'i yazar.

    ``event_key`` provider eventinin idempotency sınırıdır. Aynı key tekrar
    geldiğinde SQL ``ON CONFLICT`` ile mevcut kayıt döner; webhook çağrısı
    tekrar business orchestration çalıştırmaz.
    """
    normalized_type = event_type.strip() if isinstance(event_type, str) else ""
    normalized_key = event_key.strip() if isinstance(event_key, str) else ""
    normalized_phone_id = (
        phone_number_id.strip() if isinstance(phone_number_id, str) else ""
    )
    if (
        normalized_type not in _VALID_EVENT_TYPES
        or not normalized_key
        or len(normalized_key) > _MAX_EVENT_KEY_LENGTH
        or not normalized_phone_id
        or len(normalized_phone_id) > 64
        or not isinstance(payload, dict)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "WhatsApp inbox event bilgisi geçersiz.",
        }

    try:
        result = get_supabase().rpc(
            "enqueue_whatsapp_inbound_event",
            {
                "event_type_value": normalized_type,
                "event_key_value": normalized_key,
                "phone_number_id_value": normalized_phone_id,
                "payload_value": payload,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "WhatsApp inbox event kaydedilemedi.",
        }

    response = _extract_rpc_payload(result.data)
    if (
        response is None
        or response.get("status") != "success"
        or not isinstance(response.get("event"), dict)
    ):
        return {
            "durum": "hata",
            "mesaj": "WhatsApp inbox event geçersiz yanıt döndürdü.",
        }
    return {
        "durum": "başarılı",
        "created": response.get("created") is True,
        "event": response["event"],
    }

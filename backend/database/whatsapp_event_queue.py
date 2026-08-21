from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload
from .common import is_positive_int as _is_positive_int


_VALID_EVENT_TYPES = frozenset({"inbound_message", "message_status"})
_MAX_EVENT_KEY_LENGTH = 240


def get_supabase():
    import database

    return database.get_supabase()


def _rpc_result(data: Any) -> dict[str, Any]:
    payload = _extract_rpc_payload(data)
    if payload is None or payload.get("status") != "success":
        return {"durum": "hata"}
    event = payload.get("event")
    if not isinstance(event, dict):
        return {"durum": "hata"}
    return {"durum": "başarılı", "event": event, "created": payload.get("created") is True}


def enqueue_whatsapp_event(*, event_type: str, event_key: str, phone_number_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Durable WhatsApp inbox'a normalize provider event'i yazar."""
    event_type = event_type.strip() if isinstance(event_type, str) else ""
    event_key = event_key.strip() if isinstance(event_key, str) else ""
    phone_number_id = phone_number_id.strip() if isinstance(phone_number_id, str) else ""
    if event_type not in _VALID_EVENT_TYPES or not event_key or len(event_key) > _MAX_EVENT_KEY_LENGTH or not phone_number_id or len(phone_number_id) > 64 or not isinstance(payload, dict):
        return {"durum": "doğrulama_hatası"}
    try:
        result = get_supabase().rpc("enqueue_whatsapp_inbound_event", {"event_type_value": event_type, "event_key_value": event_key, "phone_number_id_value": phone_number_id, "payload_value": payload}).execute()
    except Exception:
        return {"durum": "hata"}
    return _rpc_result(result.data)


def claim_next_whatsapp_event(worker_id: str) -> dict[str, Any]:
    normalized = worker_id.strip() if isinstance(worker_id, str) else ""
    if not normalized or len(normalized) > 120:
        return {"durum": "doğrulama_hatası"}
    try:
        result = get_supabase().rpc("claim_next_whatsapp_inbound_event", {"worker_id_value": normalized}).execute()
    except Exception:
        return {"durum": "hata"}
    payload = _extract_rpc_payload(result.data)
    if payload is None or payload.get("status") != "success":
        return {"durum": "hata"}
    event = payload.get("event")
    if event is None:
        return {"durum": "boş"}
    return {"durum": "başarılı", "event": event}


def complete_whatsapp_event(event_id: int, *, outcome: str, error_code: str | None = None, retry_at: str | None = None) -> dict[str, Any]:
    if not _is_positive_int(event_id) or outcome not in {"PROCESSED", "FAILED", "UNKNOWN", "RETRY"}:
        return {"durum": "doğrulama_hatası"}
    try:
        result = get_supabase().rpc("complete_whatsapp_inbound_event", {"event_id_value": event_id, "outcome_value": outcome, "error_code_value": error_code, "retry_at_value": retry_at}).execute()
    except Exception:
        return {"durum": "hata"}
    payload = _extract_rpc_payload(result.data)
    return {"durum": "başarılı"} if payload and payload.get("status") == "success" else {"durum": "hata"}

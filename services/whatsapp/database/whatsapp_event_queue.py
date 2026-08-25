from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload
from .common import is_positive_int as _is_positive_int


_VALID_EVENT_TYPES = frozenset({"inbound_message", "message_status"})
_MAX_EVENT_KEY_LENGTH = 240
_MAX_WORKER_ID_LENGTH = 120


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
    return {
        "durum": "başarılı",
        "event": event,
        "created": payload.get("created") is True,
    }


def enqueue_whatsapp_event(
    *,
    event_type: str,
    event_key: str,
    phone_number_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Durable WhatsApp inbox'a normalize provider event'i yazar."""
    event_type = event_type.strip() if isinstance(event_type, str) else ""
    event_key = event_key.strip() if isinstance(event_key, str) else ""
    phone_number_id = phone_number_id.strip() if isinstance(phone_number_id, str) else ""
    if (
        event_type not in _VALID_EVENT_TYPES
        or not event_key
        or len(event_key) > _MAX_EVENT_KEY_LENGTH
        or not phone_number_id
        or len(phone_number_id) > 64
        or not isinstance(payload, dict)
    ):
        return {"durum": "doğrulama_hatası"}
    try:
        result = get_supabase().rpc(
            "enqueue_whatsapp_inbound_event",
            {
                "event_type_value": event_type,
                "event_key_value": event_key,
                "phone_number_id_value": phone_number_id,
                "payload_value": payload,
            },
        ).execute()
    except Exception:
        return {"durum": "hata"}
    return _rpc_result(result.data)


def claim_next_whatsapp_event(worker_id: str) -> dict[str, Any]:
    normalized = worker_id.strip() if isinstance(worker_id, str) else ""
    if not normalized or len(normalized) > _MAX_WORKER_ID_LENGTH:
        return {"durum": "doğrulama_hatası"}
    try:
        result = get_supabase().rpc(
            "claim_next_whatsapp_inbound_event",
            {"worker_id_value": normalized},
        ).execute()
    except Exception:
        return {"durum": "hata"}

    payload = _extract_rpc_payload(result.data)
    if payload is None or payload.get("status") != "success":
        return {"durum": "hata"}
    event = payload.get("event")
    if event is None:
        return {"durum": "boş"}
    if not isinstance(event, dict):
        return {"durum": "hata"}

    claim_version = event.get("claim_version")
    claimed_by = event.get("claimed_by")
    if not _is_positive_int(claim_version) or claimed_by != normalized:
        return {"durum": "hata"}

    return {"durum": "başarılı", "event": event}


def renew_whatsapp_event_claim(
    event_id: int,
    *,
    worker_id: str,
    claim_version: int,
) -> dict[str, Any]:
    """Atomically refresh the exact queue lease or fail closed if it was lost."""
    normalized_worker = worker_id.strip() if isinstance(worker_id, str) else ""
    if (
        not _is_positive_int(event_id)
        or not normalized_worker
        or len(normalized_worker) > _MAX_WORKER_ID_LENGTH
        or not _is_positive_int(claim_version)
    ):
        return {"durum": "doğrulama_hatası"}

    try:
        result = get_supabase().rpc(
            "renew_whatsapp_inbound_event_claim",
            {
                "event_id_value": event_id,
                "worker_id_value": normalized_worker,
                "claim_version_value": claim_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "reason_code": "claim_renew_failed"}

    payload = _extract_rpc_payload(result.data)
    if payload is None:
        return {"durum": "hata", "reason_code": "claim_renew_invalid_response"}
    if payload.get("status") == "success":
        if (
            payload.get("event_id") != event_id
            or payload.get("claim_version") != claim_version
        ):
            return {"durum": "hata", "reason_code": "claim_renew_identity_mismatch"}
        return {"durum": "başarılı"}
    if payload.get("status") == "conflict":
        return {
            "durum": "çakışma",
            "reason_code": str(payload.get("reason") or "claim_lost"),
        }
    return {
        "durum": "hata",
        "reason_code": str(payload.get("reason") or "claim_renew_failed"),
    }


def complete_whatsapp_event(
    event_id: int,
    *,
    worker_id: str,
    claim_version: int,
    outcome: str,
    error_code: str | None = None,
    retry_at: str | None = None,
) -> dict[str, Any]:
    normalized_worker = worker_id.strip() if isinstance(worker_id, str) else ""
    if (
        not _is_positive_int(event_id)
        or not normalized_worker
        or len(normalized_worker) > _MAX_WORKER_ID_LENGTH
        or not _is_positive_int(claim_version)
        or outcome not in {"PROCESSED", "FAILED", "UNKNOWN", "RETRY"}
    ):
        return {"durum": "doğrulama_hatası"}

    try:
        result = get_supabase().rpc(
            "complete_whatsapp_inbound_event",
            {
                "event_id_value": event_id,
                "worker_id_value": normalized_worker,
                "claim_version_value": claim_version,
                "outcome_value": outcome,
                "error_code_value": error_code,
                "retry_at_value": retry_at,
            },
        ).execute()
    except Exception:
        return {"durum": "hata"}

    payload = _extract_rpc_payload(result.data)
    if payload is None:
        return {"durum": "hata"}
    if payload.get("status") == "success":
        return {"durum": "başarılı"}
    if payload.get("status") == "conflict":
        return {
            "durum": "çakışma",
            "reason_code": str(payload.get("reason") or "claim_conflict"),
        }
    return {"durum": "hata"}

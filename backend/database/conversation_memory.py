from __future__ import annotations

from typing import Any

from .common import is_positive_int as _is_positive_int


def get_supabase():
    import database

    return database.get_supabase()


def _map_rpc_status(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {"durum": "hata", "reason_code": "conversation_memory_invalid_response"}

    status = payload.get("status")
    if status == "success":
        result = dict(payload)
        result["durum"] = "başarılı"
        return result
    if status == "not_found":
        return {
            "durum": "bulunamadı",
            "reason_code": str(payload.get("reason") or "conversation_memory_not_found"),
        }
    if status == "conflict":
        return {
            "durum": "çakışma",
            "reason_code": str(payload.get("reason") or "conversation_memory_conflict"),
        }
    return {
        "durum": "hata",
        "reason_code": str(payload.get("reason") or "conversation_memory_rpc_failed"),
    }


def get_conversation_ai_context(current_message_id: int) -> dict[str, Any]:
    """Read one bounded, privacy-minimized context window for an incoming message."""
    if not _is_positive_int(current_message_id):
        return {
            "durum": "doğrulama_hatası",
            "reason_code": "conversation_memory_message_id_invalid",
        }

    try:
        response = get_supabase().rpc(
            "get_conversation_ai_context",
            {"current_message_id_value": current_message_id},
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "reason_code": "conversation_memory_read_failed",
        }
    return _map_rpc_status(response.data)


def advance_conversation_ai_memory(
    *,
    current_message_id: int,
    expected_version: int,
    summary_text: str,
    last_intent: str | None,
    context_truncated: bool,
    worker_event_id: int | None = None,
    worker_id: str | None = None,
    claim_version: int | None = None,
) -> dict[str, Any]:
    """CAS-advance advisory AI memory through one persisted incoming message."""
    if (
        not _is_positive_int(current_message_id)
        or not isinstance(expected_version, int)
        or isinstance(expected_version, bool)
        or expected_version < 0
        or not isinstance(summary_text, str)
        or len(summary_text) > 1600
        or not isinstance(context_truncated, bool)
        or (last_intent is not None and (not isinstance(last_intent, str) or len(last_intent.strip()) > 64))
    ):
        return {
            "durum": "doğrulama_hatası",
            "reason_code": "conversation_memory_update_invalid",
        }

    supplied_claim_parts = (
        worker_event_id is not None,
        worker_id is not None,
        claim_version is not None,
    )
    if any(supplied_claim_parts) and not all(supplied_claim_parts):
        return {
            "durum": "doğrulama_hatası",
            "reason_code": "conversation_memory_claim_context_invalid",
        }

    if all(supplied_claim_parts):
        normalized_worker = worker_id.strip() if isinstance(worker_id, str) else ""
        if (
            not _is_positive_int(worker_event_id)
            or not normalized_worker
            or len(normalized_worker) > 120
            or not _is_positive_int(claim_version)
        ):
            return {
                "durum": "doğrulama_hatası",
                "reason_code": "conversation_memory_claim_context_invalid",
            }
        worker_id = normalized_worker

    params = {
        "current_message_id_value": current_message_id,
        "expected_version_value": expected_version,
        "summary_text_value": summary_text,
        "last_intent_value": last_intent,
        "context_truncated_value": context_truncated,
        "worker_event_id_value": worker_event_id,
        "worker_id_value": worker_id,
        "claim_version_value": claim_version,
    }
    try:
        response = get_supabase().rpc(
            "advance_conversation_ai_memory",
            params,
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "reason_code": "conversation_memory_update_failed",
        }
    return _map_rpc_status(response.data)

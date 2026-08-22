from __future__ import annotations

import re
from typing import Any


MAX_MEMORY_SUMMARY_CHARS = 1200
MAX_RECENT_CONTEXT_MESSAGES = 12
MAX_RECENT_CONTEXT_CHARS = 2400
MAX_SINGLE_CONTEXT_MESSAGE_CHARS = 600

_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_LONG_NUMBER_RE = re.compile(r"(?<!\w)(?:\+?\d[\d\s().-]{5,}\d)(?!\w)")


def sanitize_memory_summary(value: str) -> str:
    """Normalize and minimize obvious sensitive identifiers in AI-authored memory."""
    normalized = " ".join(value.strip().split())
    normalized = _EMAIL_RE.sub("[e-posta]", normalized)
    normalized = _LONG_NUMBER_RE.sub("[numara]", normalized)
    return normalized[:MAX_MEMORY_SUMMARY_CHARS]


def _positive_int(value: Any) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool) and value > 0:
        return value
    return None


def _nonnegative_int(value: Any) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
        return value
    return None


def _message_context_item(row: Any) -> dict[str, str] | None:
    if not isinstance(row, dict):
        return None
    direction = row.get("direction")
    if direction not in {"incoming", "outgoing"}:
        return None
    message_type = str(row.get("message_type") or "text")[:32]
    content = row.get("content")
    if isinstance(content, str) and content.strip():
        text = " ".join(content.strip().split())[:MAX_SINGLE_CONTEXT_MESSAGE_CHARS]
    elif message_type != "text":
        text = f"[{message_type}]"
    else:
        return None
    return {
        "role": "customer" if direction == "incoming" else "assistant",
        "type": message_type,
        "text": text,
    }


def _bounded_recent_messages(rows: Any) -> tuple[list[dict[str, str]], bool]:
    if not isinstance(rows, list):
        return [], False

    normalized: list[dict[str, str]] = []
    for row in rows[-MAX_RECENT_CONTEXT_MESSAGES:]:
        item = _message_context_item(row)
        if item is not None:
            normalized.append(item)

    selected_reversed: list[dict[str, str]] = []
    chars = 0
    app_truncated = False
    for item in reversed(normalized):
        item_chars = len(item["text"])
        if selected_reversed and chars + item_chars > MAX_RECENT_CONTEXT_CHARS:
            app_truncated = True
            break
        if not selected_reversed and item_chars > MAX_RECENT_CONTEXT_CHARS:
            item = dict(item)
            item["text"] = item["text"][-MAX_RECENT_CONTEXT_CHARS:]
            item_chars = len(item["text"])
            app_truncated = True
        selected_reversed.append(item)
        chars += item_chars

    selected = list(reversed(selected_reversed))
    if len(selected) < len(normalized) or len(rows) > MAX_RECENT_CONTEXT_MESSAGES:
        app_truncated = True
    return selected, app_truncated


def load_current_conversation_memory() -> dict[str, Any] | None:
    """Resolve bounded advisory memory from the request-local incoming message id."""
    try:
        from chat_service import transport_context
        import database
    except Exception:
        return None

    current_message_id = transport_context.current_incoming_message_id()
    if _positive_int(current_message_id) is None:
        return None

    result = database.get_conversation_ai_context(current_message_id)
    if not isinstance(result, dict) or result.get("durum") != "başarılı":
        return {
            "status": "read_failed",
            "current_message_id": current_message_id,
            "reason_code": (
                str(result.get("reason_code"))
                if isinstance(result, dict) and result.get("reason_code")
                else "conversation_memory_read_failed"
            ),
        }

    memory = result.get("memory")
    if not isinstance(memory, dict):
        return {
            "status": "read_failed",
            "current_message_id": current_message_id,
            "reason_code": "conversation_memory_invalid_shape",
        }

    version = _nonnegative_int(memory.get("version"))
    if version is None:
        return {
            "status": "read_failed",
            "current_message_id": current_message_id,
            "reason_code": "conversation_memory_invalid_version",
        }

    summary = memory.get("summary_text")
    if not isinstance(summary, str):
        summary = ""
    summary = sanitize_memory_summary(summary)

    recent_messages, app_truncated = _bounded_recent_messages(result.get("recent_messages"))
    db_truncated = result.get("context_truncated") is True
    memory_incomplete = memory.get("memory_incomplete") is True
    truncated = db_truncated or app_truncated

    claim = transport_context.current_whatsapp_claim()
    claim_payload: dict[str, Any] = {
        "worker_event_id": None,
        "worker_id": None,
        "claim_version": None,
    }
    if claim is not None:
        claim_payload = {
            "worker_event_id": claim.event_id,
            "worker_id": claim.worker_id,
            "claim_version": claim.claim_version,
        }

    last_intent = memory.get("last_intent")
    if not isinstance(last_intent, str) or not last_intent.strip():
        last_intent = None

    return {
        "status": "success",
        "current_message_id": current_message_id,
        "expected_version": version,
        "context_truncated": truncated,
        "memory_incomplete": memory_incomplete,
        "claim": claim_payload,
        "context": {
            "living_summary": summary,
            "last_intent": last_intent,
            "recent_messages_after_summary": recent_messages,
            "older_context_incomplete": memory_incomplete or truncated,
        },
    }


def persist_current_conversation_memory(
    state: dict[str, Any] | None,
    *,
    summary_text: str,
    last_intent: str | None,
) -> dict[str, Any]:
    """CAS-advance memory; failure is advisory and never becomes business state."""
    if not isinstance(state, dict) or state.get("status") != "success":
        return {"durum": "atlandı", "reason_code": "conversation_memory_context_unavailable"}

    current_message_id = _positive_int(state.get("current_message_id"))
    expected_version = _nonnegative_int(state.get("expected_version"))
    if current_message_id is None or expected_version is None:
        return {"durum": "atlandı", "reason_code": "conversation_memory_context_invalid"}

    claim = state.get("claim") if isinstance(state.get("claim"), dict) else {}
    sanitized_summary = sanitize_memory_summary(summary_text)

    try:
        import database
    except Exception:
        return {"durum": "hata", "reason_code": "conversation_memory_database_unavailable"}

    return database.advance_conversation_ai_memory(
        current_message_id=current_message_id,
        expected_version=expected_version,
        summary_text=sanitized_summary,
        last_intent=last_intent,
        context_truncated=state.get("context_truncated") is True,
        worker_event_id=claim.get("worker_event_id"),
        worker_id=claim.get("worker_id"),
        claim_version=claim.get("claim_version"),
    )

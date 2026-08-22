from __future__ import annotations

from typing import Any

import ai_memory
import database
from chat_service import transport_context


def test_summary_sanitizer_redacts_obvious_identifiers_and_caps() -> None:
    raw = "  Müşteri test@example.com adresini verdi, telefonu +90 555 111 22 33.  " + ("x" * 2000)
    sanitized = ai_memory.sanitize_memory_summary(raw)

    assert "test@example.com" not in sanitized
    assert "+90 555 111 22 33" not in sanitized
    assert "[e-posta]" in sanitized
    assert "[numara]" in sanitized
    assert len(sanitized) <= ai_memory.MAX_MEMORY_SUMMARY_CHARS


def test_context_is_bounded_privacy_minimized_and_uses_request_claim(monkeypatch) -> None:
    rows = [
        {
            "id": index,
            "direction": "incoming" if index % 2 else "outgoing",
            "content": "a" * 500,
            "message_type": "text",
            "was_auto_replied": index % 2 == 0,
            "media_url": "must-not-leak",
            "provider_message_id": "must-not-leak",
        }
        for index in range(1, 14)
    ]
    monkeypatch.setattr(
        database,
        "get_conversation_ai_context",
        lambda message_id: {
            "durum": "başarılı",
            "memory": {
                "version": 3,
                "summary_text": "Önceki özet",
                "last_intent": "price_question",
                "memory_incomplete": False,
            },
            "recent_messages": rows,
            "context_truncated": False,
        },
    )

    with transport_context.transport_scope(
        "whatsapp_cloud_pending",
        worker_event_id=17,
        worker_id="worker-a",
        claim_version=4,
    ):
        transport_context.record_incoming_message_id(101)
        state = ai_memory.load_current_conversation_memory()

    assert state is not None
    assert state["status"] == "success"
    assert state["expected_version"] == 3
    assert state["context_truncated"] is True
    assert state["claim"] == {
        "worker_event_id": 17,
        "worker_id": "worker-a",
        "claim_version": 4,
    }
    recent = state["context"]["recent_messages_after_summary"]
    assert len(recent) <= ai_memory.MAX_RECENT_CONTEXT_MESSAGES
    assert sum(len(item["text"]) for item in recent) <= ai_memory.MAX_RECENT_CONTEXT_CHARS
    assert all(set(item) == {"role", "type", "text"} for item in recent)
    assert "must-not-leak" not in str(state)


def test_persist_threads_expected_version_truncation_and_claim(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        database,
        "advance_conversation_ai_memory",
        lambda **kwargs: calls.append(kwargs) or {"durum": "başarılı"},
    )
    state = {
        "status": "success",
        "current_message_id": 101,
        "expected_version": 2,
        "context_truncated": True,
        "claim": {
            "worker_event_id": 17,
            "worker_id": "worker-a",
            "claim_version": 4,
        },
    }

    result = ai_memory.persist_current_conversation_memory(
        state,
        summary_text="Müşteri mail@example.com ile devam etti.",
        last_intent="custom_text_question",
    )

    assert result["durum"] == "başarılı"
    assert calls == [
        {
            "current_message_id": 101,
            "expected_version": 2,
            "summary_text": "Müşteri [e-posta] ile devam etti.",
            "last_intent": "custom_text_question",
            "context_truncated": True,
            "worker_event_id": 17,
            "worker_id": "worker-a",
            "claim_version": 4,
        }
    ]


def test_no_transport_incoming_id_means_no_memory_lookup(monkeypatch) -> None:
    monkeypatch.setattr(
        database,
        "get_conversation_ai_context",
        lambda message_id: (_ for _ in ()).throw(AssertionError("must not read")),
    )
    assert transport_context.current_incoming_message_id() is None
    assert ai_memory.load_current_conversation_memory() is None

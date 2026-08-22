from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import ai_engine


class _Completions:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=json.dumps(self.payload, ensure_ascii=False)
                    )
                )
            ],
            usage=SimpleNamespace(total_tokens=77),
        )


def _client(payload: dict[str, Any]) -> tuple[Any, _Completions]:
    completions = _Completions(payload)
    return SimpleNamespace(chat=SimpleNamespace(completions=completions)), completions


def _memory_state(*, incomplete: bool = False) -> dict[str, Any]:
    return {
        "status": "success",
        "current_message_id": 101,
        "expected_version": 2,
        "context_truncated": incomplete,
        "memory_incomplete": False,
        "claim": {
            "worker_event_id": 17,
            "worker_id": "worker-a",
            "claim_version": 4,
        },
        "context": {
            "living_summary": "Müşteri daha önce kargo süresini sordu.",
            "last_intent": "shipping_time",
            "recent_messages_after_summary": [
                {"role": "assistant", "type": "text", "text": "Kargo bilgisi paylaşıldı."}
            ],
            "older_context_incomplete": incomplete,
        },
    }


def test_classifier_sends_only_bounded_memory_plus_current_message_and_updates_memory(
    monkeypatch,
) -> None:
    client, completions = _client(
        {
            "intent": "shipping_company",
            "confidence": 0.96,
            "alternatives": [{"intent": "unclear", "confidence": 0.02}],
            "entities": {},
            "reason": "Takip sorusu kargo şirketiyle ilgili.",
            "context_used": True,
            "memory_summary": "Müşteri kargo süresi ve hangi kargo şirketiyle gönderim yapıldığını soruyor.",
        }
    )
    updates: list[dict[str, Any]] = []
    monkeypatch.setattr(ai_engine, "get_classifier_client", lambda: client)
    monkeypatch.setattr(ai_engine, "load_current_conversation_memory", lambda: _memory_state())
    monkeypatch.setattr(
        ai_engine,
        "persist_current_conversation_memory",
        lambda state, **kwargs: updates.append({"state": state, **kwargs})
        or {"durum": "başarılı"},
    )

    result = ai_engine.classify_intent("Peki hangisiyle gönderiyorsunuz?")

    assert result["intent"] == "shipping_company"
    assert result["memory_context_used"] is True
    assert result["memory_updated"] is True
    assert ai_engine.intent_is_safe(result) is True

    user_content = completions.calls[0]["messages"][1]["content"]
    payload = json.loads(user_content)
    assert payload["current_message"] == "Peki hangisiyle gönderiyorsunuz?"
    assert payload["conversation_context"]["living_summary"].startswith("Müşteri daha önce")
    assert "media_url" not in user_content
    assert "provider_message_id" not in user_content
    assert updates[0]["last_intent"] == "shipping_company"


def test_context_dependent_intent_fails_closed_when_memory_is_incomplete(monkeypatch) -> None:
    client, _ = _client(
        {
            "intent": "shipping_company",
            "confidence": 0.97,
            "alternatives": [],
            "entities": {},
            "reason": "Eksik bağlama dayalı takip sorusu.",
            "context_used": True,
            "memory_summary": "Müşteri kargo hakkında konuşuyor.",
        }
    )
    monkeypatch.setattr(ai_engine, "get_classifier_client", lambda: client)
    monkeypatch.setattr(
        ai_engine,
        "load_current_conversation_memory",
        lambda: _memory_state(incomplete=True),
    )
    monkeypatch.setattr(
        ai_engine,
        "persist_current_conversation_memory",
        lambda state, **kwargs: {"durum": "başarılı"},
    )

    result = ai_engine.classify_intent("Peki hangisi?")

    assert result["memory_context_incomplete"] is True
    assert result["context_used"] is True
    assert ai_engine.intent_is_safe(result) is False


def test_clear_current_message_can_remain_safe_with_incomplete_memory(monkeypatch) -> None:
    client, _ = _client(
        {
            "intent": "return_request",
            "confidence": 0.98,
            "alternatives": [],
            "entities": {},
            "reason": "Güncel mesaj tek başına açık bir iade talebi.",
            "context_used": False,
            "memory_summary": "Müşteri iade etmek istediğini söyledi.",
        }
    )
    monkeypatch.setattr(ai_engine, "get_classifier_client", lambda: client)
    monkeypatch.setattr(
        ai_engine,
        "load_current_conversation_memory",
        lambda: _memory_state(incomplete=True),
    )
    monkeypatch.setattr(
        ai_engine,
        "persist_current_conversation_memory",
        lambda state, **kwargs: {"durum": "başarılı"},
    )

    result = ai_engine.classify_intent("İade etmek istiyorum")

    assert result["context_used"] is False
    assert ai_engine.intent_is_safe(result) is True


def test_missing_context_used_signal_is_unsafe_when_memory_was_supplied(monkeypatch) -> None:
    client, _ = _client(
        {
            "intent": "price_question",
            "confidence": 0.99,
            "alternatives": [],
            "entities": {},
            "reason": "Fiyat sorusu.",
            "memory_summary": "Müşteri fiyat sordu.",
        }
    )
    monkeypatch.setattr(ai_engine, "get_classifier_client", lambda: client)
    monkeypatch.setattr(ai_engine, "load_current_conversation_memory", lambda: _memory_state())
    monkeypatch.setattr(
        ai_engine,
        "persist_current_conversation_memory",
        lambda state, **kwargs: {"durum": "başarılı"},
    )

    result = ai_engine.classify_intent("Kaç para?")

    assert result["context_used"] is None
    assert ai_engine.intent_is_safe(result) is False


def test_no_request_memory_preserves_legacy_single_message_shape(monkeypatch) -> None:
    client, completions = _client(
        {
            "intent": "price_question",
            "confidence": 0.95,
            "alternatives": [],
            "entities": {},
            "reason": "Fiyat sorusu.",
        }
    )
    monkeypatch.setattr(ai_engine, "get_classifier_client", lambda: client)
    monkeypatch.setattr(ai_engine, "load_current_conversation_memory", lambda: None)

    result = ai_engine.classify_intent("fiyat ne kadar")

    assert completions.calls[0]["messages"][1]["content"] == "fiyat ne kadar"
    assert result["memory_context_used"] is False
    assert ai_engine.intent_is_safe(result) is True

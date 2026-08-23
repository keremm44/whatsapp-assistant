from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import database.conversation_memory as memory_db


class _RpcCall:
    def __init__(self, data: Any) -> None:
        self._data = data

    def execute(self) -> Any:
        return SimpleNamespace(data=self._data)


class _Client:
    def __init__(self, payloads: dict[str, Any]) -> None:
        self.payloads = payloads
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _RpcCall:
        self.calls.append((name, params))
        return _RpcCall(self.payloads[name])


def test_context_helper_calls_bounded_rpc(monkeypatch) -> None:
    client = _Client(
        {
            "get_conversation_ai_context": {
                "status": "success",
                "memory": {"version": 2, "summary_text": "Özet"},
                "recent_messages": [],
                "context_truncated": False,
            }
        }
    )
    monkeypatch.setattr(memory_db, "get_supabase", lambda: client)

    result = memory_db.get_conversation_ai_context(101)

    assert result["durum"] == "başarılı"
    assert client.calls == [
        ("get_conversation_ai_context", {"current_message_id_value": 101})
    ]


def test_advance_helper_threads_cas_and_worker_claim(monkeypatch) -> None:
    client = _Client(
        {
            "advance_conversation_ai_memory": {
                "status": "success",
                "memory": {"version": 4},
            }
        }
    )
    monkeypatch.setattr(memory_db, "get_supabase", lambda: client)

    result = memory_db.advance_conversation_ai_memory(
        current_message_id=101,
        expected_version=3,
        summary_text="Kısa özet",
        last_intent="price_question",
        context_truncated=True,
        worker_event_id=17,
        worker_id=" worker-a ",
        claim_version=5,
    )

    assert result["durum"] == "başarılı"
    name, params = client.calls[0]
    assert name == "advance_conversation_ai_memory"
    assert params == {
        "current_message_id_value": 101,
        "expected_version_value": 3,
        "summary_text_value": "Kısa özet",
        "last_intent_value": "price_question",
        "context_truncated_value": True,
        "worker_event_id_value": 17,
        "worker_id_value": "worker-a",
        "claim_version_value": 5,
    }


def test_advance_helper_rejects_partial_claim_without_rpc(monkeypatch) -> None:
    monkeypatch.setattr(
        memory_db,
        "get_supabase",
        lambda: (_ for _ in ()).throw(AssertionError("rpc must not run")),
    )

    result = memory_db.advance_conversation_ai_memory(
        current_message_id=101,
        expected_version=0,
        summary_text="",
        last_intent=None,
        context_truncated=False,
        worker_event_id=17,
        worker_id=None,
        claim_version=5,
    )

    assert result["durum"] == "doğrulama_hatası"
    assert result["reason_code"] == "conversation_memory_claim_context_invalid"


def test_rpc_conflict_maps_without_leaking_raw_payload(monkeypatch) -> None:
    client = _Client(
        {
            "advance_conversation_ai_memory": {
                "status": "conflict",
                "reason": "memory_version_changed",
                "internal": "must-not-leak",
            }
        }
    )
    monkeypatch.setattr(memory_db, "get_supabase", lambda: client)

    result = memory_db.advance_conversation_ai_memory(
        current_message_id=101,
        expected_version=2,
        summary_text="Özet",
        last_intent="greeting",
        context_truncated=False,
    )

    assert result == {
        "durum": "çakışma",
        "reason_code": "memory_version_changed",
    }

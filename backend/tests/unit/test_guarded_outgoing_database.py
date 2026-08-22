from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import database.guarded_outgoing as guarded_db


@dataclass
class _Result:
    data: Any


class _RpcQuery:
    def __init__(self, data: Any) -> None:
        self._data = data

    def execute(self) -> _Result:
        return _Result(self._data)


class _Client:
    def __init__(self, data: Any) -> None:
        self.data = data
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _RpcQuery:
        self.calls.append((name, params))
        return _RpcQuery(self.data)


def test_guarded_reply_success_maps_and_sends_exact_guard(monkeypatch) -> None:
    client = _Client(
        {
            "status": "success",
            "created": True,
            "idempotent": False,
            "message": {"id": 202, "provider": "internal"},
        }
    )
    monkeypatch.setattr(guarded_db, "get_supabase", lambda: client)

    result = guarded_db.persist_guarded_auto_reply(
        seller_id=11,
        customer_id=22,
        source_message_id=101,
        expected_control_version=7,
        content="Merhaba",
        ai_confidence=0.91,
        provider="internal",
    )

    assert result == {
        "durum": "başarılı",
        "message": {"id": 202, "provider": "internal"},
        "created": True,
        "idempotent": False,
    }
    assert client.calls == [
        (
            "persist_guarded_auto_reply",
            {
                "target_seller_id": 11,
                "target_customer_id": 22,
                "target_source_message_id": 101,
                "expected_control_version": 7,
                "content_value": "Merhaba",
                "message_type_value": "text",
                "media_url_value": None,
                "ai_confidence_value": 0.91,
                "provider_value": "internal",
            },
        )
    ]


def test_guarded_reply_maps_control_change_to_stable_suppression(monkeypatch) -> None:
    client = _Client({"status": "suppressed", "reason": "control_changed"})
    monkeypatch.setattr(guarded_db, "get_supabase", lambda: client)

    result = guarded_db.persist_guarded_auto_reply(
        seller_id=11,
        customer_id=22,
        source_message_id=101,
        expected_control_version=7,
        content="Merhaba",
    )

    assert result["durum"] == "bastırıldı"
    assert result["reason_code"] == "outgoing_suppressed_control_changed"


def test_guarded_reply_rejects_invalid_guard_before_rpc(monkeypatch) -> None:
    def _unexpected() -> Any:
        raise AssertionError("database must not be called")

    monkeypatch.setattr(guarded_db, "get_supabase", _unexpected)

    result = guarded_db.persist_guarded_auto_reply(
        seller_id=11,
        customer_id=22,
        source_message_id=101,
        expected_control_version=0,
        content="Merhaba",
    )

    assert result["durum"] == "doğrulama_hatası"


def test_guarded_reply_fails_closed_on_malformed_rpc_payload(monkeypatch) -> None:
    client = _Client([{"unexpected": True}, {"unexpected": True}])
    monkeypatch.setattr(guarded_db, "get_supabase", lambda: client)

    result = guarded_db.persist_guarded_auto_reply(
        seller_id=11,
        customer_id=22,
        source_message_id=101,
        expected_control_version=7,
        content="Merhaba",
    )

    assert result["durum"] == "hata"

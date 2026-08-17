from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import database.whatsapp_message_bridge as bridge


@dataclass
class _Result:
    data: Any


class _Query:
    def __init__(
        self,
        *,
        calls: list[tuple[Any, ...]],
        read_rows: list[dict[str, Any]],
        insert_rows: list[dict[str, Any]] | None = None,
        insert_error: Exception | None = None,
    ) -> None:
        self.calls = calls
        self.read_rows = read_rows
        self.insert_rows = insert_rows
        self.insert_error = insert_error
        self.mode = "read"

    def select(self, fields: str) -> "_Query":
        self.calls.append(("select", fields))
        return self

    def insert(self, data: dict[str, Any]) -> "_Query":
        self.mode = "insert"
        self.calls.append(("insert", data))
        return self

    def eq(self, field: str, value: Any) -> "_Query":
        self.calls.append(("eq", field, value))
        return self

    def limit(self, value: int) -> "_Query":
        self.calls.append(("limit", value))
        return self

    def execute(self) -> _Result:
        self.calls.append(("execute", self.mode))
        if self.mode == "insert" and self.insert_error is not None:
            raise self.insert_error
        if self.mode == "insert":
            return _Result(self.insert_rows or [])
        return _Result(self.read_rows)


class _Client:
    def __init__(
        self,
        *,
        read_rows: list[dict[str, Any]] | None = None,
        insert_rows: list[dict[str, Any]] | None = None,
        insert_error: Exception | None = None,
    ) -> None:
        self.calls: list[tuple[Any, ...]] = []
        self.read_rows = read_rows or []
        self.insert_rows = insert_rows
        self.insert_error = insert_error

    def table(self, name: str) -> _Query:
        assert name == "messages"
        self.calls.append(("table", name))
        return _Query(
            calls=self.calls,
            read_rows=self.read_rows,
            insert_rows=self.insert_rows,
            insert_error=self.insert_error,
        )


def test_pending_reply_insert_contains_source_correlation(monkeypatch) -> None:
    inserted = {
        "id": 1002,
        "seller_id": 2,
        "customer_id": 3,
        "direction": "outgoing",
        "provider": "whatsapp_cloud_pending",
        "provider_message_id": None,
        "reply_to_message_id": 1001,
    }
    client = _Client(insert_rows=[inserted])
    monkeypatch.setattr(bridge, "get_supabase", lambda: client)

    result = bridge.save_whatsapp_pending_outgoing_message(
        seller_id=2,
        customer_id=3,
        source_message_id=1001,
        content="Yanıt",
        was_auto_replied=True,
        ai_confidence=0.9,
    )

    assert result == {"durum": "başarılı", "message": inserted}
    insert_calls = [call for call in client.calls if call[0] == "insert"]
    assert len(insert_calls) == 1
    payload = insert_calls[0][1]
    assert payload["provider"] == "whatsapp_cloud_pending"
    assert payload["provider_message_id"] is None
    assert payload["reply_to_message_id"] == 1001
    assert payload["seller_id"] == 2
    assert payload["customer_id"] == 3


def test_pending_reply_unique_race_recovers_exact_existing_row(monkeypatch) -> None:
    existing = {
        "id": 1002,
        "seller_id": 2,
        "customer_id": 3,
        "direction": "outgoing",
        "provider": "whatsapp_cloud_pending",
        "provider_message_id": None,
        "reply_to_message_id": 1001,
    }
    client = _Client(
        read_rows=[existing],
        insert_error=RuntimeError("23505 duplicate key"),
    )
    monkeypatch.setattr(bridge, "get_supabase", lambda: client)

    result = bridge.save_whatsapp_pending_outgoing_message(
        seller_id=2,
        customer_id=3,
        source_message_id=1001,
        content="Yanıt",
    )

    assert result["durum"] == "duplicate"
    assert result["message"] == existing
    assert ("eq", "reply_to_message_id", 1001) in client.calls
    assert ("eq", "seller_id", 2) in client.calls
    assert ("eq", "customer_id", 3) in client.calls


def test_pending_reply_unique_race_fails_closed_on_identity_mismatch(monkeypatch) -> None:
    client = _Client(
        read_rows=[
            {
                "id": 1002,
                "seller_id": 999,
                "customer_id": 3,
                "direction": "outgoing",
                "provider": "whatsapp_cloud_pending",
                "reply_to_message_id": 1001,
            }
        ],
        insert_error=RuntimeError("23505 duplicate key"),
    )
    monkeypatch.setattr(bridge, "get_supabase", lambda: client)

    result = bridge.save_whatsapp_pending_outgoing_message(
        seller_id=2,
        customer_id=3,
        source_message_id=1001,
        content="Yanıt",
    )

    assert result["durum"] == "çakışma"


def test_non_unique_insert_error_returns_generic_failure(monkeypatch) -> None:
    client = _Client(insert_error=RuntimeError("connection failed"))
    monkeypatch.setattr(bridge, "get_supabase", lambda: client)

    result = bridge.save_whatsapp_pending_outgoing_message(
        seller_id=2,
        customer_id=3,
        source_message_id=1001,
        content="Yanıt",
    )

    assert result == {
        "durum": "hata",
        "mesaj": "WhatsApp pending reply kaydedilemedi.",
    }

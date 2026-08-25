from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import database.whatsapp_inbound as inbound_db


MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "037_add_whatsapp_inbound_outcomes.sql"
)


@dataclass
class _Result:
    data: Any


class _RpcQuery:
    def __init__(self, data: Any) -> None:
        self.data = data

    def execute(self) -> _Result:
        return _Result(self.data)


class _TableQuery:
    def __init__(self, rows: list[dict[str, Any]], calls: list[tuple[Any, ...]]) -> None:
        self.rows = rows
        self.calls = calls

    def select(self, fields: str) -> "_TableQuery":
        self.calls.append(("select", fields))
        return self

    def eq(self, field: str, value: Any) -> "_TableQuery":
        self.calls.append(("eq", field, value))
        return self

    def limit(self, value: int) -> "_TableQuery":
        self.calls.append(("limit", value))
        return self

    def execute(self) -> _Result:
        return _Result(self.rows)


class _Client:
    def __init__(self, *, rpc_data: Any = None, rows: list[dict[str, Any]] | None = None) -> None:
        self.rpc_data = rpc_data
        self.rows = rows or []
        self.calls: list[tuple[Any, ...]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _RpcQuery:
        self.calls.append(("rpc", name, params))
        return _RpcQuery(self.rpc_data)

    def table(self, name: str) -> _TableQuery:
        self.calls.append(("table", name))
        return _TableQuery(self.rows, self.calls)


def test_inbound_outcome_migration_is_backend_only_and_shape_locked() -> None:
    sql = MIGRATION_PATH.read_text(encoding="utf-8")
    upper = sql.upper()

    assert "'037'" in sql
    assert "CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_outcomes" in sql
    assert "UNIQUE (incoming_message_id)" in sql
    assert "UNIQUE (outgoing_message_id)" in sql
    assert "outcome IN ('NO_REPLY', 'REPLY')" in sql
    assert "m.provider = 'whatsapp_cloud'" in sql
    assert "m.provider IN ('whatsapp_cloud_pending', 'whatsapp_cloud')" in sql
    assert "ALTER TABLE public.whatsapp_inbound_outcomes ENABLE ROW LEVEL SECURITY" in sql
    assert "FROM PUBLIC, anon, authenticated" in sql
    assert "TO service_role" in sql
    assert "SECURITY DEFINER" not in upper


def test_reply_outcome_requires_outgoing_id_before_rpc(monkeypatch) -> None:
    def unexpected() -> Any:
        raise AssertionError("database must not be called")

    monkeypatch.setattr(inbound_db, "get_supabase", unexpected)

    result = inbound_db.ensure_whatsapp_inbound_outcome(
        channel_id=1,
        seller_id=2,
        customer_id=3,
        incoming_message_id=4,
        outcome="REPLY",
    )

    assert result["durum"] == "doğrulama_hatası"


def test_no_reply_outcome_uses_exact_identity(monkeypatch) -> None:
    client = _Client(
        rpc_data={
            "status": "success",
            "created": True,
            "outcome": {
                "id": 8,
                "channel_id": 1,
                "seller_id": 2,
                "customer_id": 3,
                "incoming_message_id": 4,
                "outcome": "NO_REPLY",
                "outgoing_message_id": None,
            },
        }
    )
    monkeypatch.setattr(inbound_db, "get_supabase", lambda: client)

    result = inbound_db.ensure_whatsapp_inbound_outcome(
        channel_id=1,
        seller_id=2,
        customer_id=3,
        incoming_message_id=4,
        outcome="NO_REPLY",
        reason_code=" stored_customer_muted ",
    )

    assert result["durum"] == "başarılı"
    assert result["created"] is True
    assert client.calls == [
        (
            "rpc",
            "ensure_whatsapp_inbound_outcome",
            {
                "target_channel_id": 1,
                "target_seller_id": 2,
                "target_customer_id": 3,
                "target_incoming_message_id": 4,
                "outcome_value": "NO_REPLY",
                "target_outgoing_message_id": None,
                "reason_code_value": "stored_customer_muted",
            },
        )
    ]


def test_get_inbound_outcome_is_tenant_scoped(monkeypatch) -> None:
    row = {
        "id": 8,
        "channel_id": 1,
        "seller_id": 2,
        "customer_id": 3,
        "incoming_message_id": 4,
        "outcome": "REPLY",
        "outgoing_message_id": 5,
        "reason_code": None,
    }
    client = _Client(rows=[row])
    monkeypatch.setattr(inbound_db, "get_supabase", lambda: client)

    result = inbound_db.get_whatsapp_inbound_outcome(
        seller_id=2,
        customer_id=3,
        incoming_message_id=4,
    )

    assert result == {"durum": "başarılı", "outcome": row}
    assert ("eq", "seller_id", 2) in client.calls
    assert ("eq", "customer_id", 3) in client.calls
    assert ("eq", "incoming_message_id", 4) in client.calls

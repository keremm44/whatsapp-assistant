from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import database.atomic_message_persistence as message_db


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

    def table(self, name: str) -> Any:
        raise AssertionError(f"atomic message facade must not use table writes: {name}")


def _message() -> dict[str, Any]:
    return {
        "id": 91,
        "seller_id": 2,
        "customer_id": 14,
        "direction": "incoming",
        "content": "test",
        "message_type": "text",
        "media_url": None,
        "was_auto_replied": False,
        "ai_confidence": None,
        "provider": "whatsapp",
        "provider_message_id": "wamid.test",
    }


def test_save_message_uses_one_atomic_rpc(monkeypatch) -> None:
    client = _Client({"status": "success", "message": _message()})
    monkeypatch.setattr(message_db, "get_supabase", lambda: client)

    result = message_db.save_message(
        seller_id=2,
        customer_id=14,
        direction="incoming",
        content="test",
        provider="whatsapp",
        provider_message_id="wamid.test",
    )

    assert result == {"durum": "başarılı", "message": _message()}
    assert client.calls == [
        (
            "persist_message_with_customer_metrics",
            {
                "target_seller_id": 2,
                "target_customer_id": 14,
                "direction_value": "incoming",
                "content_value": "test",
                "message_type_value": "text",
                "media_url_value": None,
                "was_auto_replied_value": False,
                "ai_confidence_value": None,
                "provider_value": "whatsapp",
                "provider_message_id_value": "wamid.test",
            },
        )
    ]


def test_save_message_maps_database_duplicate_without_second_write(monkeypatch) -> None:
    client = _Client({"status": "duplicate", "message": _message()})
    monkeypatch.setattr(message_db, "get_supabase", lambda: client)

    result = message_db.save_message(2, 14, "incoming", "test", provider="whatsapp")

    assert result["durum"] == "duplicate"
    assert result["message"]["id"] == 91
    assert len(client.calls) == 1


def test_save_message_rejects_invalid_identity_before_rpc(monkeypatch) -> None:
    def _unexpected() -> Any:
        raise AssertionError("database must not be called")

    monkeypatch.setattr(message_db, "get_supabase", _unexpected)

    assert message_db.save_message(0, 14, "incoming", "x")["durum"] == "doğrulama_hatası"
    assert message_db.save_message(2, 0, "incoming", "x")["durum"] == "doğrulama_hatası"


def test_save_message_fails_closed_on_tenant_mismatch_response(monkeypatch) -> None:
    message = _message()
    message["seller_id"] = 99
    client = _Client({"status": "success", "message": message})
    monkeypatch.setattr(message_db, "get_supabase", lambda: client)

    assert message_db.save_message(2, 14, "incoming", "x")["durum"] == "hata"


def test_legacy_increment_helper_reconciles_from_durable_messages(monkeypatch) -> None:
    customer = {"id": 14, "seller_id": 2, "total_messages": 7}
    client = _Client({"status": "success", "customer": customer})
    monkeypatch.setattr(message_db, "get_supabase", lambda: client)

    result = message_db.increment_customer_message_count(14)

    assert result == {"durum": "başarılı", "customer": customer}
    assert client.calls == [
        ("reconcile_customer_message_metrics", {"target_customer_id": 14})
    ]


def test_migration_054_is_rollout_safe_and_transactional() -> None:
    sql = Path("migrations/054_atomically_maintain_customer_message_count.sql").read_text(
        encoding="utf-8"
    ).lower()

    assert sql.index("lock table public.messages") < sql.index("lock table public.customers")
    assert "create or replace function public.persist_message_with_customer_metrics" in sql
    assert "insert into public.messages" in sql
    assert "set total_messages = c.total_messages + 1" in sql
    assert "where c.id = target_customer_id" in sql
    assert "and c.seller_id = target_seller_id" in sql
    assert "using errcode = '23503'" in sql
    assert "when unique_violation" in sql
    assert "create trigger" not in sql
    assert "create or replace function public.reconcile_customer_message_metrics" in sql
    assert "count(m.id)" in sql
    assert "m.direction = 'incoming'" in sql
    assert "customers_total_messages_nonnegative" in sql
    assert "security invoker" in sql
    assert "set search_path = pg_catalog, public" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql
    assert "'054'" in sql
    assert "'atomically_maintain_customer_message_count_v2'" in sql

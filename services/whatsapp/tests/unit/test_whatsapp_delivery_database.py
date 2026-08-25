from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import database.whatsapp_delivery as delivery_db


@dataclass
class _Result:
    data: Any


class _Query:
    def __init__(self, data: Any, calls: list[tuple[Any, ...]], label: str) -> None:
        self._data = data
        self._calls = calls
        self._label = label

    def select(self, fields: str) -> "_Query":
        self._calls.append((self._label, "select", fields))
        return self

    def eq(self, field: str, value: Any) -> "_Query":
        self._calls.append((self._label, "eq", field, value))
        return self

    def limit(self, value: int) -> "_Query":
        self._calls.append((self._label, "limit", value))
        return self

    def execute(self) -> _Result:
        self._calls.append((self._label, "execute"))
        return _Result(self._data)


class _Client:
    def __init__(
        self,
        *,
        table_data: dict[str, Any] | None = None,
        rpc_data: dict[str, Any] | None = None,
    ) -> None:
        self.table_data = table_data or {}
        self.rpc_data = rpc_data or {}
        self.calls: list[tuple[Any, ...]] = []

    def table(self, name: str) -> _Query:
        self.calls.append(("table", name))
        return _Query(self.table_data.get(name, []), self.calls, f"table:{name}")

    def rpc(self, name: str, params: dict[str, Any]) -> _Query:
        self.calls.append(("rpc", name, params))
        return _Query(self.rpc_data.get(name), self.calls, f"rpc:{name}")


def test_resolve_channel_is_phone_number_owned_and_active(monkeypatch) -> None:
    client = _Client(
        table_data={
            "whatsapp_channels": [
                {
                    "id": 7,
                    "seller_id": 42,
                    "phone_number_id": "123456789",
                    "is_active": True,
                }
            ]
        }
    )
    monkeypatch.setattr(delivery_db, "get_supabase", lambda: client)

    result = delivery_db.resolve_whatsapp_channel(" 123456789 ")

    assert result == {
        "durum": "başarılı",
        "channel": {
            "id": 7,
            "seller_id": 42,
            "phone_number_id": "123456789",
        },
    }
    assert ("table:whatsapp_channels", "eq", "phone_number_id", "123456789") in client.calls
    assert ("table:whatsapp_channels", "eq", "is_active", True) in client.calls


def test_resolve_channel_rejects_missing_mapping(monkeypatch) -> None:
    client = _Client(table_data={"whatsapp_channels": []})
    monkeypatch.setattr(delivery_db, "get_supabase", lambda: client)

    result = delivery_db.resolve_whatsapp_channel("phone-1")

    assert result["durum"] == "bulunamadı"


def test_invalid_channel_id_fails_before_database_access(monkeypatch) -> None:
    def _unexpected() -> Any:
        raise AssertionError("database must not be called")

    monkeypatch.setattr(delivery_db, "get_supabase", _unexpected)

    result = delivery_db.resolve_whatsapp_channel("   ")

    assert result["durum"] == "doğrulama_hatası"


def test_ensure_outbox_uses_exact_tenant_and_message_identity(monkeypatch) -> None:
    client = _Client(
        rpc_data={
            "ensure_whatsapp_delivery_outbox": {
                "status": "success",
                "created": True,
                "outbox": {"id": 91, "status": "PENDING"},
            }
        }
    )
    monkeypatch.setattr(delivery_db, "get_supabase", lambda: client)

    result = delivery_db.ensure_whatsapp_delivery_outbox(
        channel_id=7,
        seller_id=42,
        customer_id=51,
        source_message_id=1001,
        message_id=1002,
        recipient_id="905551112233",
    )

    assert result["durum"] == "başarılı"
    assert result["created"] is True
    assert result["outbox"]["id"] == 91
    assert (
        "rpc",
        "ensure_whatsapp_delivery_outbox",
        {
            "target_channel_id": 7,
            "target_seller_id": 42,
            "target_customer_id": 51,
            "target_source_message_id": 1001,
            "target_message_id": 1002,
            "recipient_value": "905551112233",
        },
    ) in client.calls


def test_claim_and_sent_mapping_preserve_provider_wamid(monkeypatch) -> None:
    client = _Client(
        rpc_data={
            "claim_whatsapp_delivery_outbox": {
                "status": "success",
                "claimed": True,
                "outbox": {"id": 91, "status": "SENDING"},
            },
            "mark_whatsapp_delivery_sent": {
                "status": "success",
                "changed": True,
                "outbox": {
                    "id": 91,
                    "status": "SENT",
                    "provider_message_id": "wamid.out-1",
                },
            },
        }
    )
    monkeypatch.setattr(delivery_db, "get_supabase", lambda: client)

    claimed = delivery_db.claim_whatsapp_delivery_outbox(91)
    sent = delivery_db.mark_whatsapp_delivery_sent(91, " wamid.out-1 ")

    assert claimed["claimed"] is True
    assert sent["outbox"]["provider_message_id"] == "wamid.out-1"
    assert (
        "rpc",
        "mark_whatsapp_delivery_sent",
        {
            "target_outbox_id": 91,
            "provider_message_id_value": "wamid.out-1",
        },
    ) in client.calls


def test_status_callback_allowlist_fails_closed_before_rpc(monkeypatch) -> None:
    client = _Client()
    monkeypatch.setattr(delivery_db, "get_supabase", lambda: client)

    result = delivery_db.apply_whatsapp_delivery_status(
        phone_number_id="phone-1",
        provider_message_id="wamid.out-1",
        status="deleted",
    )

    assert result["durum"] == "doğrulama_hatası"
    assert not any(call[0] == "rpc" for call in client.calls)


def test_status_callback_uses_phone_number_id_and_wamid(monkeypatch) -> None:
    client = _Client(
        rpc_data={
            "apply_whatsapp_delivery_status": {
                "status": "success",
                "changed": True,
                "outbox": {"id": 91, "status": "DELIVERED"},
            }
        }
    )
    monkeypatch.setattr(delivery_db, "get_supabase", lambda: client)

    result = delivery_db.apply_whatsapp_delivery_status(
        phone_number_id="phone-1",
        provider_message_id="wamid.out-1",
        status="delivered",
    )

    assert result["durum"] == "başarılı"
    assert result["changed"] is True
    assert (
        "rpc",
        "apply_whatsapp_delivery_status",
        {
            "phone_number_id_value": "phone-1",
            "provider_message_id_value": "wamid.out-1",
            "status_value": "delivered",
            "error_code_value": None,
        },
    ) in client.calls


def test_delivery_context_rejects_cross_tenant_mismatch(monkeypatch) -> None:
    client = _Client(
        table_data={
            "whatsapp_delivery_outbox": [
                {
                    "id": 91,
                    "channel_id": 7,
                    "seller_id": 42,
                    "customer_id": 51,
                    "source_message_id": 1001,
                    "message_id": 1002,
                    "recipient_id": "905551112233",
                    "status": "SENDING",
                    "provider_message_id": None,
                    "attempt_count": 1,
                    "next_attempt_at": None,
                }
            ],
            "whatsapp_channels": [
                {
                    "id": 7,
                    "seller_id": 999,
                    "phone_number_id": "phone-1",
                    "is_active": True,
                }
            ],
            "messages": [
                {
                    "id": 1002,
                    "seller_id": 42,
                    "customer_id": 51,
                    "direction": "outgoing",
                    "content": "Merhaba",
                    "message_type": "text",
                    "reply_to_message_id": 1001,
                }
            ],
        }
    )
    monkeypatch.setattr(delivery_db, "get_supabase", lambda: client)

    result = delivery_db.get_whatsapp_delivery_context(91)

    assert result["durum"] == "çakışma"

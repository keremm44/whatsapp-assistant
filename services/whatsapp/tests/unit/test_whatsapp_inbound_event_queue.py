from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import database.whatsapp_event_queue as queue_db
from whatsapp_webhook.inbox import MAX_EVENTS_PER_WEBHOOK, enqueue_webhook_events
from whatsapp_webhook.models import InboundMessageEvent, MessageStatusEvent


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "migrations/038_add_whatsapp_inbound_event_queue.sql"
)


def _inbound() -> InboundMessageEvent:
    return InboundMessageEvent(
        phone_number_id="12345",
        message_id="wamid.inbound-1",
        sender_id="905551112233",
        timestamp="1786981000",
        message_type="text",
        text="Merhaba",
        contact_name="Müşteri",
        media_id=None,
    )


def _status(status: str = "delivered") -> MessageStatusEvent:
    return MessageStatusEvent(
        phone_number_id="12345",
        message_id="wamid.outgoing-1",
        status=status,
        timestamp="1786981001",
        recipient_id="905551112233",
        error_codes=(),
    )


def test_inbound_event_queue_migration_has_durable_idempotent_security_contract() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")

    assert "CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_events" in sql
    assert "UNIQUE (event_key)" in sql
    assert "status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'UNKNOWN')" in sql
    assert "idx_whatsapp_inbound_events_pending" in sql
    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "FROM PUBLIC, anon, authenticated" in sql
    assert "SET search_path = pg_catalog, public" in sql
    assert "enqueue_whatsapp_inbound_event" in sql
    assert "ON CONFLICT (event_key) DO NOTHING" in sql
    assert "'038'" in sql


def test_enqueue_database_helper_passes_normalized_event_to_rpc(monkeypatch) -> None:
    calls: list[tuple[str, dict[str, Any]]] = []

    class _Rpc:
        def execute(self) -> Any:
            return SimpleNamespace(
                data={"status": "success", "created": True, "event": {"id": 9}}
            )

    class _Client:
        def rpc(self, name: str, params: dict[str, Any]) -> _Rpc:
            calls.append((name, params))
            return _Rpc()

    monkeypatch.setattr(queue_db, "get_supabase", lambda: _Client())

    result = queue_db.enqueue_whatsapp_event(
        event_type="inbound_message",
        event_key="inbound:12345:wamid.inbound-1",
        phone_number_id="12345",
        payload={"message_id": "wamid.inbound-1"},
    )

    assert result == {"durum": "başarılı", "created": True, "event": {"id": 9}}
    assert calls == [
        (
            "enqueue_whatsapp_inbound_event",
            {
                "event_type_value": "inbound_message",
                "event_key_value": "inbound:12345:wamid.inbound-1",
                "phone_number_id_value": "12345",
                "payload_value": {"message_id": "wamid.inbound-1"},
            },
        )
    ]


def test_inbox_uses_stable_inbound_key_and_keeps_sensitive_content_in_payload(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        "whatsapp_webhook.inbox.enqueue_whatsapp_event",
        lambda **kwargs: calls.append(kwargs)
        or {"durum": "başarılı", "created": True, "event": {"id": 1}},
    )

    result = enqueue_webhook_events([_inbound()])

    assert result == {"durum": "başarılı", "queued": 1, "duplicates": 0}
    assert calls[0]["event_key"] == "inbound:12345:wamid.inbound-1"
    assert calls[0]["payload"]["text"] == "Merhaba"
    assert calls[0]["payload"]["sender_id"] == "905551112233"


def test_status_keys_distinguish_delivery_state_but_dedupe_same_state(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    results = iter((True, False, True))
    monkeypatch.setattr(
        "whatsapp_webhook.inbox.enqueue_whatsapp_event",
        lambda **kwargs: calls.append(kwargs)
        or {"durum": "başarılı", "created": next(results), "event": {"id": 1}},
    )

    result = enqueue_webhook_events([_status("delivered"), _status("delivered"), _status("read")])

    assert result == {"durum": "başarılı", "queued": 2, "duplicates": 1}
    assert [call["event_key"] for call in calls] == [
        "status:12345:wamid.outgoing-1:delivered",
        "status:12345:wamid.outgoing-1:delivered",
        "status:12345:wamid.outgoing-1:read",
    ]


def test_inbox_rejects_oversized_event_batch_without_persistence(monkeypatch) -> None:
    monkeypatch.setattr(
        "whatsapp_webhook.inbox.enqueue_whatsapp_event",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("must not persist")),
    )

    result = enqueue_webhook_events([_inbound()] * (MAX_EVENTS_PER_WEBHOOK + 1))

    assert result == {
        "durum": "doğrulama_hatası",
        "reason_code": "whatsapp_webhook_event_limit_exceeded",
    }

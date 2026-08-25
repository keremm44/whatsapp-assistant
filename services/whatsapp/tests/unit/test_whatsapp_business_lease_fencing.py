from __future__ import annotations

from contextlib import nullcontext
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chat_service.dependencies as deps
import chat_service.transport_context as transport
import database.whatsapp_event_queue as queue_db
import whatsapp_webhook.runtime as runtime
from whatsapp_webhook.models import InboundMessageEvent, MessageStatusEvent


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


def _claim_scope():
    return transport.transport_scope(
        transport.WHATSAPP_PENDING_OUTGOING_PROVIDER,
        worker_event_id=17,
        worker_id="worker-a",
        claim_version=3,
    )


def _inbound_event() -> InboundMessageEvent:
    return InboundMessageEvent(
        phone_number_id="phone-123",
        message_id="wamid.in-1",
        sender_id="905551112233",
        timestamp="1",
        message_type="text",
        text="Merhaba",
        contact_name=None,
        media_id=None,
    )


def _status_event() -> MessageStatusEvent:
    return MessageStatusEvent(
        phone_number_id="phone-123",
        message_id="wamid.out-1",
        status="delivered",
        timestamp="1",
        recipient_id="905551112233",
        error_codes=(),
    )


def test_migration_055_adds_backend_only_exact_claim_renewal() -> None:
    sql = Path("migrations/055_renew_whatsapp_worker_claim.sql").read_text(
        encoding="utf-8"
    ).lower()

    assert "create or replace function public.renew_whatsapp_inbound_event_claim" in sql
    assert "e.status = 'processing'" in sql
    assert "e.claimed_by = normalized_worker" in sql
    assert "e.claim_version = claim_version_value" in sql
    assert "set claimed_at = now()" in sql
    assert "security invoker" in sql
    assert "set search_path = pg_catalog, public" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql
    assert "'055'" in sql
    assert "'renew_whatsapp_worker_claim_v1'" in sql


def test_queue_claim_renewal_uses_exact_fence(monkeypatch) -> None:
    client = _Client({"status": "success", "event_id": 17, "claim_version": 3})
    monkeypatch.setattr(queue_db, "get_supabase", lambda: client)

    result = queue_db.renew_whatsapp_event_claim(
        17,
        worker_id=" worker-a ",
        claim_version=3,
    )

    assert result == {"durum": "başarılı"}
    assert client.calls == [
        (
            "renew_whatsapp_inbound_event_claim",
            {
                "event_id_value": 17,
                "worker_id_value": "worker-a",
                "claim_version_value": 3,
            },
        )
    ]


def test_queue_claim_renewal_maps_stale_owner_to_conflict(monkeypatch) -> None:
    client = _Client({"status": "conflict", "reason": "claim_lost"})
    monkeypatch.setattr(queue_db, "get_supabase", lambda: client)

    result = queue_db.renew_whatsapp_event_claim(17, worker_id="worker-a", claim_version=3)

    assert result == {"durum": "çakışma", "reason_code": "claim_lost"}


def test_transport_claim_context_is_request_local_and_resets() -> None:
    assert transport.current_whatsapp_claim() is None
    with _claim_scope():
        assert transport.current_whatsapp_claim() == transport.WhatsAppClaimContext(
            17, "worker-a", 3
        )
    assert transport.current_whatsapp_claim() is None


def test_transport_rejects_partial_claim_context() -> None:
    try:
        with transport.transport_scope(
            transport.WHATSAPP_PENDING_OUTGOING_PROVIDER,
            worker_event_id=17,
            worker_id="worker-a",
        ):
            raise AssertionError("scope must not open")
    except ValueError:
        pass
    else:
        raise AssertionError("partial claim must fail closed")


def test_chat_mutation_renews_lease_before_underlying_write(monkeypatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        deps,
        "renew_whatsapp_event_claim",
        lambda event_id, **kwargs: calls.append("renew") or {"durum": "başarılı"},
    )
    monkeypatch.setattr(
        deps,
        "_database_get_or_create_customer",
        lambda *args, **kwargs: calls.append("write")
        or {"durum": "mevcut", "customer": {"id": 4}},
    )

    with _claim_scope():
        result = deps.get_or_create_customer(2, "905551112233")

    assert result["durum"] == "mevcut"
    assert calls == ["renew", "write"]


def test_stale_chat_claim_blocks_business_write(monkeypatch) -> None:
    writes: list[str] = []
    monkeypatch.setattr(
        deps,
        "renew_whatsapp_event_claim",
        lambda event_id, **kwargs: {"durum": "çakışma", "reason_code": "claim_lost"},
    )
    monkeypatch.setattr(
        deps,
        "_database_transition_state",
        lambda *args, **kwargs: writes.append("write") or {"durum": "başarılı"},
    )

    with _claim_scope():
        result = deps.transition_state(2, 4, "NORMAL", "test")

    assert result["durum"] == "hata"
    assert result["reason_code"] == "whatsapp_claim_lost"
    assert writes == []


def test_non_worker_chat_path_does_not_require_lease(monkeypatch) -> None:
    monkeypatch.setattr(
        deps,
        "renew_whatsapp_event_claim",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("renew must not run")),
    )
    monkeypatch.setattr(
        deps,
        "_database_create_seller_notification",
        lambda *args, **kwargs: {"durum": "başarılı"},
    )

    with nullcontext():
        result = deps.create_seller_notification(2, "test", "message")

    assert result == {"durum": "başarılı"}


def test_runtime_stale_claim_blocks_outcome_write(monkeypatch) -> None:
    monkeypatch.setattr(
        runtime,
        "resolve_whatsapp_channel",
        lambda phone_number_id: {
            "durum": "başarılı",
            "channel": {"id": 7, "seller_id": 42},
        },
    )
    monkeypatch.setattr(
        runtime.chat_service,
        "sohbet_isle",
        lambda **kwargs: {
            "durum": "otomatik_yanıt_yok",
            "customer_id": 51,
            "incoming_message_id": 1001,
            "reason_code": "stored_test",
        },
    )
    monkeypatch.setattr(
        runtime,
        "renew_whatsapp_event_claim",
        lambda *args, **kwargs: {"durum": "çakışma", "reason_code": "claim_lost"},
    )
    monkeypatch.setattr(
        runtime,
        "ensure_whatsapp_inbound_outcome",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("stale write must not run")),
    )

    result = runtime.process_inbound_message(
        _inbound_event(),
        worker_event_id=17,
        worker_id="worker-a",
        claim_version=3,
    )

    assert result == {"durum": "hata", "reason_code": "whatsapp_claim_lost"}


def test_runtime_stale_claim_blocks_delivery_status_write(monkeypatch) -> None:
    monkeypatch.setattr(
        runtime,
        "resolve_whatsapp_channel",
        lambda phone_number_id: {
            "durum": "başarılı",
            "channel": {"id": 7, "seller_id": 42},
        },
    )
    monkeypatch.setattr(
        runtime,
        "renew_whatsapp_event_claim",
        lambda *args, **kwargs: {"durum": "çakışma", "reason_code": "claim_lost"},
    )
    monkeypatch.setattr(
        runtime,
        "apply_whatsapp_delivery_status",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("stale status must not write")),
    )

    result = runtime.process_status_event(
        _status_event(),
        worker_event_id=17,
        worker_id="worker-a",
        claim_version=3,
    )

    assert result == {"durum": "hata", "reason_code": "whatsapp_claim_lost"}

from __future__ import annotations

import hashlib
import hmac
import json
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

import whatsapp_webhook.routes as routes
import whatsapp_webhook.runtime as runtime
from settings import get_settings
from whatsapp_webhook.models import InboundMessageEvent, MessageStatusEvent


VERIFY_TOKEN = "verify-token-runtime-tests"
APP_SECRET = "app-secret-runtime-tests"


def _settings(*, runtime_enabled: bool) -> Any:
    return SimpleNamespace(
        whatsapp_verify_token=VERIFY_TOKEN,
        whatsapp_app_secret=APP_SECRET,
        whatsapp_runtime_enabled=runtime_enabled,
    )


def _app(*, runtime_enabled: bool) -> FastAPI:
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[get_settings] = lambda: _settings(
        runtime_enabled=runtime_enabled
    )
    return app


def _signed_post(client: TestClient, payload: Any) -> Any:
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    signature = "sha256=" + hmac.new(
        APP_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return client.post(
        "/webhooks/whatsapp",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": signature,
        },
    )


def _text_payload() -> dict[str, Any]:
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "waba-1",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"phone_number_id": "phone-123"},
                            "contacts": [
                                {
                                    "wa_id": "905551112233",
                                    "profile": {"name": "Müşteri"},
                                }
                            ],
                            "messages": [
                                {
                                    "from": "905551112233",
                                    "id": "wamid.in-1",
                                    "timestamp": "1786981000",
                                    "type": "text",
                                    "text": {"body": "Merhaba"},
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }


def _inbound_event(*, message_type: str = "text") -> InboundMessageEvent:
    return InboundMessageEvent(
        phone_number_id="phone-123",
        message_id="wamid.in-1",
        sender_id="905551112233",
        timestamp="1786981000",
        message_type=message_type,
        text="Merhaba" if message_type == "text" else None,
        contact_name="Müşteri",
        media_id="media-1" if message_type != "text" else None,
    )


def _status_event(status_value: str = "delivered") -> MessageStatusEvent:
    return MessageStatusEvent(
        phone_number_id="phone-123",
        message_id="wamid.out-1",
        status=status_value,
        timestamp="1786981001",
        recipient_id="905551112233",
        error_codes=(),
    )


def test_route_keeps_actionable_events_disabled_by_default(monkeypatch) -> None:
    def unexpected(events: Any) -> dict[str, Any]:
        raise AssertionError("runtime must not run while disabled")

    monkeypatch.setattr(routes, "process_webhook_events", unexpected)
    client = TestClient(_app(runtime_enabled=False))

    response = _signed_post(client, _text_payload())

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "whatsapp_runtime_not_ready"


def test_enabled_route_dispatches_only_after_signature_and_parse(monkeypatch) -> None:
    calls: list[Any] = []

    def fake_process(events: Any) -> dict[str, Any]:
        events = list(events)
        calls.append(events)
        return {"durum": "başarılı", "processed": len(events)}

    monkeypatch.setattr(routes, "process_webhook_events", fake_process)
    client = TestClient(_app(runtime_enabled=True))

    response = _signed_post(client, _text_payload())

    assert response.status_code == 200
    assert response.json() == {"received": True, "events": 1}
    assert len(calls) == 1
    assert isinstance(calls[0][0], InboundMessageEvent)


def test_invalid_signature_never_reaches_runtime(monkeypatch) -> None:
    def unexpected(events: Any) -> dict[str, Any]:
        raise AssertionError("runtime must not run before signature verification")

    monkeypatch.setattr(routes, "process_webhook_events", unexpected)
    client = TestClient(_app(runtime_enabled=True))

    response = client.post(
        "/webhooks/whatsapp",
        content=b"{}",
        headers={"X-Hub-Signature-256": "sha256=bad"},
    )

    assert response.status_code == 401


def test_runtime_failure_maps_to_safe_503_reason(monkeypatch) -> None:
    monkeypatch.setattr(
        routes,
        "process_webhook_events",
        lambda events: {
            "durum": "hata",
            "reason_code": "whatsapp_channel_unavailable",
            "internal": "must-not-leak",
        },
    )
    client = TestClient(_app(runtime_enabled=True))

    response = _signed_post(client, _text_payload())

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail == {
        "code": "whatsapp_channel_unavailable",
        "message": "WhatsApp event güvenli biçimde tamamlanamadı.",
    }
    assert "must-not-leak" not in response.text


def test_runtime_reply_persists_outcome_before_outbox(monkeypatch) -> None:
    calls: list[tuple[Any, ...]] = []
    monkeypatch.setattr(
        runtime,
        "resolve_whatsapp_channel",
        lambda phone_number_id: {
            "durum": "başarılı",
            "channel": {"id": 7, "seller_id": 42, "phone_number_id": phone_number_id},
        },
    )
    monkeypatch.setattr(
        runtime.chat_service,
        "sohbet_isle",
        lambda **kwargs: {
            "durum": "başarılı",
            "customer_id": 51,
            "incoming_message_id": 1001,
            "outgoing_message_id": 1002,
            "cevap": "Merhaba",
        },
    )

    def fake_outcome(**kwargs: Any) -> dict[str, Any]:
        calls.append(("outcome", kwargs))
        return {"durum": "başarılı", "created": True, "outcome": {"id": 70}}

    def fake_outbox(**kwargs: Any) -> dict[str, Any]:
        calls.append(("outbox", kwargs))
        return {"durum": "başarılı", "created": True, "outbox": {"id": 80}}

    monkeypatch.setattr(runtime, "ensure_whatsapp_inbound_outcome", fake_outcome)
    monkeypatch.setattr(runtime, "ensure_whatsapp_delivery_outbox", fake_outbox)

    result = runtime.process_inbound_message(_inbound_event())

    assert result == {
        "durum": "başarılı",
        "event": "inbound",
        "outcome": "REPLY",
        "incoming_message_id": 1001,
        "outgoing_message_id": 1002,
        "outbox_id": 80,
    }
    assert [call[0] for call in calls] == ["outcome", "outbox"]
    assert calls[0][1]["outcome"] == "REPLY"
    assert calls[1][1]["recipient_id"] == "905551112233"


def test_runtime_no_reply_persists_terminal_outcome_without_outbox(monkeypatch) -> None:
    outcome_calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        runtime,
        "resolve_whatsapp_channel",
        lambda phone_number_id: {
            "durum": "başarılı",
            "channel": {"id": 7, "seller_id": 42, "phone_number_id": phone_number_id},
        },
    )
    monkeypatch.setattr(
        runtime.chat_service,
        "sohbet_isle",
        lambda **kwargs: {
            "durum": "otomatik_yanıt_yok",
            "customer_id": 51,
            "incoming_message_id": 1001,
            "reason_code": "stored_customer_muted",
        },
    )
    monkeypatch.setattr(
        runtime,
        "ensure_whatsapp_inbound_outcome",
        lambda **kwargs: (
            outcome_calls.append(kwargs)
            or {"durum": "başarılı", "created": True, "outcome": {"id": 70}}
        ),
    )
    monkeypatch.setattr(
        runtime,
        "ensure_whatsapp_delivery_outbox",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("outbox must not run")),
    )

    result = runtime.process_inbound_message(_inbound_event())

    assert result["durum"] == "başarılı"
    assert result["outcome"] == "NO_REPLY"
    assert outcome_calls[0]["outcome"] == "NO_REPLY"
    assert outcome_calls[0]["reason_code"] == "stored_customer_muted"


def test_duplicate_with_no_outcome_and_no_reply_fails_closed(monkeypatch) -> None:
    monkeypatch.setattr(
        runtime,
        "resolve_whatsapp_channel",
        lambda phone_number_id: {
            "durum": "başarılı",
            "channel": {"id": 7, "seller_id": 42, "phone_number_id": phone_number_id},
        },
    )
    monkeypatch.setattr(
        runtime.chat_service,
        "sohbet_isle",
        lambda **kwargs: {
            "durum": "duplicate",
            "customer_id": 51,
            "incoming_message_id": 1001,
        },
    )
    monkeypatch.setattr(
        runtime,
        "get_whatsapp_inbound_outcome",
        lambda **kwargs: {"durum": "bulunamadı", "outcome": None},
    )
    monkeypatch.setattr(
        runtime,
        "get_outgoing_reply_for_source_message",
        lambda **kwargs: {"durum": "bulunamadı", "message": None},
    )

    result = runtime.process_inbound_message(_inbound_event())

    assert result == {
        "durum": "hata",
        "reason_code": "whatsapp_duplicate_outcome_unavailable",
    }


def test_duplicate_reply_outcome_recovers_outbox_without_rerunning_reply_logic(monkeypatch) -> None:
    monkeypatch.setattr(
        runtime,
        "resolve_whatsapp_channel",
        lambda phone_number_id: {
            "durum": "başarılı",
            "channel": {"id": 7, "seller_id": 42, "phone_number_id": phone_number_id},
        },
    )
    monkeypatch.setattr(
        runtime.chat_service,
        "sohbet_isle",
        lambda **kwargs: {
            "durum": "duplicate",
            "customer_id": 51,
            "incoming_message_id": 1001,
        },
    )
    monkeypatch.setattr(
        runtime,
        "get_whatsapp_inbound_outcome",
        lambda **kwargs: {
            "durum": "başarılı",
            "outcome": {
                "channel_id": 7,
                "seller_id": 42,
                "customer_id": 51,
                "incoming_message_id": 1001,
                "outcome": "REPLY",
                "outgoing_message_id": 1002,
            },
        },
    )
    monkeypatch.setattr(
        runtime,
        "ensure_whatsapp_inbound_outcome",
        lambda **kwargs: {"durum": "başarılı", "created": False, "outcome": {"id": 70}},
    )
    monkeypatch.setattr(
        runtime,
        "ensure_whatsapp_delivery_outbox",
        lambda **kwargs: {"durum": "başarılı", "created": False, "outbox": {"id": 80}},
    )

    result = runtime.process_inbound_message(_inbound_event())

    assert result["durum"] == "başarılı"
    assert result["duplicate"] is True
    assert result["outgoing_message_id"] == 1002
    assert result["outbox_id"] == 80


def test_duplicate_correlated_reply_rebuilds_missing_outcome(monkeypatch) -> None:
    outcome_calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        runtime,
        "resolve_whatsapp_channel",
        lambda phone_number_id: {
            "durum": "başarılı",
            "channel": {"id": 7, "seller_id": 42, "phone_number_id": phone_number_id},
        },
    )
    monkeypatch.setattr(
        runtime.chat_service,
        "sohbet_isle",
        lambda **kwargs: {
            "durum": "duplicate",
            "customer_id": 51,
            "incoming_message_id": 1001,
        },
    )
    monkeypatch.setattr(
        runtime,
        "get_whatsapp_inbound_outcome",
        lambda **kwargs: {"durum": "bulunamadı", "outcome": None},
    )
    monkeypatch.setattr(
        runtime,
        "get_outgoing_reply_for_source_message",
        lambda **kwargs: {
            "durum": "başarılı",
            "message": {
                "id": 1002,
                "seller_id": 42,
                "customer_id": 51,
                "reply_to_message_id": 1001,
            },
        },
    )
    monkeypatch.setattr(
        runtime,
        "ensure_whatsapp_inbound_outcome",
        lambda **kwargs: (
            outcome_calls.append(kwargs)
            or {"durum": "başarılı", "created": True, "outcome": {"id": 70}}
        ),
    )
    monkeypatch.setattr(
        runtime,
        "ensure_whatsapp_delivery_outbox",
        lambda **kwargs: {"durum": "başarılı", "created": True, "outbox": {"id": 80}},
    )

    result = runtime.process_inbound_message(_inbound_event())

    assert result["durum"] == "başarılı"
    assert result["duplicate"] is True
    assert result["outcome_recovered"] is True
    assert outcome_calls[0]["outcome"] == "REPLY"
    assert outcome_calls[0]["outgoing_message_id"] == 1002


def test_unknown_channel_fails_before_chat(monkeypatch) -> None:
    monkeypatch.setattr(
        runtime,
        "resolve_whatsapp_channel",
        lambda phone_number_id: {"durum": "bulunamadı"},
    )
    monkeypatch.setattr(
        runtime.chat_service,
        "sohbet_isle",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("chat must not run")),
    )

    assert runtime.process_inbound_message(_inbound_event()) == {
        "durum": "hata",
        "reason_code": "whatsapp_channel_unavailable",
    }


def test_media_message_fails_before_tenant_or_chat(monkeypatch) -> None:
    monkeypatch.setattr(
        runtime,
        "resolve_whatsapp_channel",
        lambda phone_number_id: (_ for _ in ()).throw(AssertionError("channel must not run")),
    )

    assert runtime.process_inbound_message(_inbound_event(message_type="image")) == {
        "durum": "hata",
        "reason_code": "whatsapp_message_type_not_ready",
    }


def test_status_event_is_tenant_resolved_then_persisted(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        runtime,
        "resolve_whatsapp_channel",
        lambda phone_number_id: {
            "durum": "başarılı",
            "channel": {"id": 7, "seller_id": 42, "phone_number_id": phone_number_id},
        },
    )
    monkeypatch.setattr(
        runtime,
        "apply_whatsapp_delivery_status",
        lambda **kwargs: (
            calls.append(kwargs)
            or {"durum": "başarılı", "changed": True, "outbox": {"id": 80}}
        ),
    )

    result = runtime.process_status_event(_status_event())

    assert result == {"durum": "başarılı", "event": "status", "status": "delivered"}
    assert calls == [
        {
            "phone_number_id": "phone-123",
            "provider_message_id": "wamid.out-1",
            "status": "delivered",
            "error_code": None,
        }
    ]


def test_event_batch_stops_on_first_failure(monkeypatch) -> None:
    calls: list[str] = []

    def fake_inbound(event: InboundMessageEvent) -> dict[str, Any]:
        calls.append("inbound")
        return {"durum": "hata", "reason_code": "whatsapp_test_failure"}

    def fake_status(event: MessageStatusEvent) -> dict[str, Any]:
        calls.append("status")
        return {"durum": "başarılı"}

    monkeypatch.setattr(runtime, "process_inbound_message", fake_inbound)
    monkeypatch.setattr(runtime, "process_status_event", fake_status)

    result = runtime.process_webhook_events([_inbound_event(), _status_event()])

    assert result == {"durum": "hata", "reason_code": "whatsapp_test_failure"}
    assert calls == ["inbound"]

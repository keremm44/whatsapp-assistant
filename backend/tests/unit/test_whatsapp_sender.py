from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import httpx

import whatsapp_sender as sender


ACCESS_TOKEN = "test-access-token-value-long-enough"


def _settings(*, enabled: bool = True) -> Any:
    return SimpleNamespace(
        whatsapp_send_enabled=enabled,
        whatsapp_access_token=ACCESS_TOKEN if enabled else None,
        whatsapp_graph_api_version="v99.0" if enabled else None,
    )


def _context(*, status: str = "PENDING") -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "outbox": {
            "id": 80,
            "channel_id": 7,
            "seller_id": 42,
            "customer_id": 51,
            "source_message_id": 1001,
            "message_id": 1002,
            "recipient_id": "905551112233",
            "status": status,
            "provider_message_id": None,
            "attempt_count": 0,
            "next_attempt_at": None,
        },
        "channel": {
            "id": 7,
            "seller_id": 42,
            "phone_number_id": "123456789012345",
            "is_active": True,
        },
        "message": {
            "id": 1002,
            "seller_id": 42,
            "customer_id": 51,
            "direction": "outgoing",
            "content": "Merhaba, nasıl yardımcı olabilirim?",
            "message_type": "text",
            "provider": "whatsapp_cloud_pending",
            "provider_message_id": None,
            "reply_to_message_id": 1001,
        },
    }


class _Client:
    def __init__(self, response: httpx.Response | Exception) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def post(self, url: str, **kwargs: Any) -> httpx.Response:
        self.calls.append({"url": url, **kwargs})
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def _claim_success() -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "claimed": True,
        "outbox": {"id": 80, "status": "SENDING"},
    }


def test_send_disabled_touches_neither_database_nor_network(monkeypatch) -> None:
    monkeypatch.setattr(
        sender,
        "get_whatsapp_delivery_context",
        lambda outbox_id: (_ for _ in ()).throw(AssertionError("DB must not run")),
    )

    result = sender.dispatch_whatsapp_outbox(
        80,
        current_settings=_settings(enabled=False),
        http_client=_Client(httpx.Response(200)),
    )

    assert result == {
        "durum": "devre_dışı",
        "reason_code": "whatsapp_send_disabled",
    }


def test_success_claims_posts_fixed_graph_url_and_persists_wamid(monkeypatch) -> None:
    calls: list[tuple[Any, ...]] = []
    monkeypatch.setattr(sender, "get_whatsapp_delivery_context", lambda outbox_id: _context())
    monkeypatch.setattr(sender, "claim_whatsapp_delivery_outbox", lambda outbox_id: _claim_success())

    def fake_sent(outbox_id: int, provider_message_id: str) -> dict[str, Any]:
        calls.append(("sent", outbox_id, provider_message_id))
        return {"durum": "başarılı", "changed": True}

    monkeypatch.setattr(sender, "mark_whatsapp_delivery_sent", fake_sent)
    client = _Client(
        httpx.Response(
            200,
            json={
                "messaging_product": "whatsapp",
                "contacts": [{"input": "905551112233", "wa_id": "905551112233"}],
                "messages": [{"id": "wamid.out-1"}],
            },
        )
    )

    result = sender.dispatch_whatsapp_outbox(
        80,
        current_settings=_settings(),
        http_client=client,
    )

    assert result == {
        "durum": "başarılı",
        "delivery_state": "SENT",
        "provider_message_id": "wamid.out-1",
    }
    assert calls == [("sent", 80, "wamid.out-1")]
    assert len(client.calls) == 1
    call = client.calls[0]
    assert call["url"] == "https://graph.facebook.com/v99.0/123456789012345/messages"
    assert call["headers"]["Authorization"] == f"Bearer {ACCESS_TOKEN}"
    assert call["json"] == {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": "905551112233",
        "type": "text",
        "text": {
            "preview_url": False,
            "body": "Merhaba, nasıl yardımcı olabilirim?",
        },
    }


def test_rate_limit_schedules_one_bounded_retry(monkeypatch) -> None:
    retry_calls: list[dict[str, Any]] = []
    monkeypatch.setattr(sender, "get_whatsapp_delivery_context", lambda outbox_id: _context())
    monkeypatch.setattr(sender, "claim_whatsapp_delivery_outbox", lambda outbox_id: _claim_success())
    monkeypatch.setattr(
        sender,
        "schedule_whatsapp_delivery_retry",
        lambda outbox_id, retry_at, error_code=None: (
            retry_calls.append(
                {"outbox_id": outbox_id, "retry_at": retry_at, "error_code": error_code}
            )
            or {"durum": "başarılı", "changed": True}
        ),
    )
    monkeypatch.setattr(
        sender,
        "mark_whatsapp_delivery_unknown",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("UNKNOWN must not run for 429")),
    )
    client = _Client(
        httpx.Response(
            429,
            headers={"Retry-After": "120"},
            json={"error": {"code": 130429, "message": "rate limited"}},
        )
    )

    result = sender.dispatch_whatsapp_outbox(
        80,
        current_settings=_settings(),
        http_client=client,
    )

    assert result["durum"] == "başarılı"
    assert result["delivery_state"] == "PENDING"
    assert result["retry_scheduled"] is True
    assert result["retry_after_seconds"] == 120
    assert retry_calls[0]["error_code"] == "meta_130429"


def test_client_rejection_marks_failed_without_leaking_error_message(monkeypatch) -> None:
    failed_calls: list[tuple[int, str | None]] = []
    monkeypatch.setattr(sender, "get_whatsapp_delivery_context", lambda outbox_id: _context())
    monkeypatch.setattr(sender, "claim_whatsapp_delivery_outbox", lambda outbox_id: _claim_success())
    monkeypatch.setattr(
        sender,
        "mark_whatsapp_delivery_failed",
        lambda outbox_id, error_code=None: (
            failed_calls.append((outbox_id, error_code))
            or {"durum": "başarılı", "changed": True}
        ),
    )
    client = _Client(
        httpx.Response(
            400,
            json={"error": {"code": 100, "message": "sensitive provider diagnostic"}},
        )
    )

    result = sender.dispatch_whatsapp_outbox(
        80,
        current_settings=_settings(),
        http_client=client,
    )

    assert result == {
        "durum": "başarılı",
        "delivery_state": "FAILED",
        "error_code": "meta_100",
    }
    assert failed_calls == [(80, "meta_100")]
    assert "sensitive provider diagnostic" not in str(result)


def test_server_error_becomes_unknown_and_is_not_retried(monkeypatch) -> None:
    unknown_calls: list[tuple[int, str | None]] = []
    monkeypatch.setattr(sender, "get_whatsapp_delivery_context", lambda outbox_id: _context())
    monkeypatch.setattr(sender, "claim_whatsapp_delivery_outbox", lambda outbox_id: _claim_success())
    monkeypatch.setattr(
        sender,
        "mark_whatsapp_delivery_unknown",
        lambda outbox_id, error_code=None: (
            unknown_calls.append((outbox_id, error_code))
            or {"durum": "başarılı", "changed": True}
        ),
    )
    monkeypatch.setattr(
        sender,
        "schedule_whatsapp_delivery_retry",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("blind retry is forbidden")),
    )

    result = sender.dispatch_whatsapp_outbox(
        80,
        current_settings=_settings(),
        http_client=_Client(httpx.Response(503, json={"error": {"code": 2}})),
    )

    assert result["delivery_state"] == "UNKNOWN"
    assert result["manual_review_required"] is True
    assert unknown_calls == [(80, "meta_2")]


def test_network_timeout_becomes_unknown_without_second_send(monkeypatch) -> None:
    unknown_calls: list[tuple[int, str | None]] = []
    monkeypatch.setattr(sender, "get_whatsapp_delivery_context", lambda outbox_id: _context())
    monkeypatch.setattr(sender, "claim_whatsapp_delivery_outbox", lambda outbox_id: _claim_success())
    monkeypatch.setattr(
        sender,
        "mark_whatsapp_delivery_unknown",
        lambda outbox_id, error_code=None: (
            unknown_calls.append((outbox_id, error_code))
            or {"durum": "başarılı", "changed": True}
        ),
    )
    request = httpx.Request("POST", "https://graph.facebook.com/v99.0/123/messages")
    client = _Client(httpx.ConnectTimeout("timeout", request=request))

    result = sender.dispatch_whatsapp_outbox(
        80,
        current_settings=_settings(),
        http_client=client,
    )

    assert result["delivery_state"] == "UNKNOWN"
    assert unknown_calls == [(80, "transport_request_error")]
    assert len(client.calls) == 1


def test_success_without_valid_wamid_is_ambiguous(monkeypatch) -> None:
    unknown_calls: list[tuple[int, str | None]] = []
    monkeypatch.setattr(sender, "get_whatsapp_delivery_context", lambda outbox_id: _context())
    monkeypatch.setattr(sender, "claim_whatsapp_delivery_outbox", lambda outbox_id: _claim_success())
    monkeypatch.setattr(
        sender,
        "mark_whatsapp_delivery_unknown",
        lambda outbox_id, error_code=None: (
            unknown_calls.append((outbox_id, error_code))
            or {"durum": "başarılı", "changed": True}
        ),
    )

    result = sender.dispatch_whatsapp_outbox(
        80,
        current_settings=_settings(),
        http_client=_Client(httpx.Response(200, json={"messages": [{"id": "not-a-wamid"}]})),
    )

    assert result["delivery_state"] == "UNKNOWN"
    assert unknown_calls == [(80, "success_response_without_wamid")]


def test_non_pending_outbox_is_never_claimed_or_sent(monkeypatch) -> None:
    monkeypatch.setattr(
        sender,
        "get_whatsapp_delivery_context",
        lambda outbox_id: _context(status="UNKNOWN"),
    )
    monkeypatch.setattr(
        sender,
        "claim_whatsapp_delivery_outbox",
        lambda outbox_id: (_ for _ in ()).throw(AssertionError("claim must not run")),
    )

    result = sender.dispatch_whatsapp_outbox(
        80,
        current_settings=_settings(),
        http_client=_Client(httpx.Response(200)),
    )

    assert result == {
        "durum": "atlandı",
        "reason_code": "whatsapp_outbox_not_pending",
        "delivery_state": "UNKNOWN",
    }


def test_invalid_delivery_payload_is_failed_after_claim_without_network(monkeypatch) -> None:
    context = _context()
    context["channel"]["phone_number_id"] = "not-a-meta-id"
    failed_calls: list[tuple[int, str | None]] = []
    monkeypatch.setattr(sender, "get_whatsapp_delivery_context", lambda outbox_id: context)
    monkeypatch.setattr(sender, "claim_whatsapp_delivery_outbox", lambda outbox_id: _claim_success())
    monkeypatch.setattr(
        sender,
        "mark_whatsapp_delivery_failed",
        lambda outbox_id, error_code=None: (
            failed_calls.append((outbox_id, error_code))
            or {"durum": "başarılı", "changed": True}
        ),
    )
    client = _Client(httpx.Response(200))

    result = sender.dispatch_whatsapp_outbox(
        80,
        current_settings=_settings(),
        http_client=client,
    )

    assert result["delivery_state"] == "FAILED"
    assert failed_calls == [(80, "invalid_delivery_payload")]
    assert client.calls == []

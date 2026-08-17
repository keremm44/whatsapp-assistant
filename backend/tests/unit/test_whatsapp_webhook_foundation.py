from __future__ import annotations

import hashlib
import hmac
import json
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from settings import get_settings
from whatsapp_webhook.models import InboundMessageEvent, MessageStatusEvent
from whatsapp_webhook.parser import parse_whatsapp_webhook
from whatsapp_webhook.routes import MAX_WEBHOOK_BODY_BYTES, router
from whatsapp_webhook.security import verify_meta_signature


VERIFY_TOKEN = "verify-token-for-tests"
APP_SECRET = "meta-app-secret-for-tests"


def _settings(
    *,
    verify_token: str | None = VERIFY_TOKEN,
    app_secret: str | None = APP_SECRET,
) -> Any:
    return SimpleNamespace(
        whatsapp_verify_token=verify_token,
        whatsapp_app_secret=app_secret,
    )


@pytest.fixture
def app() -> FastAPI:
    current = FastAPI()
    current.include_router(router)
    current.dependency_overrides[get_settings] = lambda: _settings()
    yield current
    current.dependency_overrides.clear()


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


def _signed_body(payload: Any, *, secret: str = APP_SECRET) -> tuple[bytes, str]:
    body = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    signature = "sha256=" + hmac.new(
        secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return body, signature


def _post_signed(client: TestClient, payload: Any) -> Any:
    body, signature = _signed_body(payload)
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
                            "metadata": {
                                "display_phone_number": "15551234567",
                                "phone_number_id": "phone-123",
                            },
                            "contacts": [
                                {
                                    "wa_id": "905551112233",
                                    "profile": {"name": "Müşteri"},
                                }
                            ],
                            "messages": [
                                {
                                    "from": "905551112233",
                                    "id": "wamid.incoming-1",
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


def _status_payload() -> dict[str, Any]:
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
                            "statuses": [
                                {
                                    "id": "wamid.outgoing-1",
                                    "status": "failed",
                                    "timestamp": "1786981001",
                                    "recipient_id": "905551112233",
                                    "errors": [{"code": 131000}],
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }


def test_verification_returns_exact_challenge(client: TestClient) -> None:
    response = client.get(
        "/webhooks/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": VERIFY_TOKEN,
            "hub.challenge": "1158201444",
        },
    )

    assert response.status_code == 200
    assert response.text == "1158201444"


def test_verification_rejects_wrong_token(client: TestClient) -> None:
    response = client.get(
        "/webhooks/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong-token",
            "hub.challenge": "123",
        },
    )

    assert response.status_code == 403


def test_verification_fails_closed_when_unconfigured(
    app: FastAPI,
    client: TestClient,
) -> None:
    app.dependency_overrides[get_settings] = lambda: _settings(verify_token=None)

    response = client.get(
        "/webhooks/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": VERIFY_TOKEN,
            "hub.challenge": "123",
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "whatsapp_verify_token_unconfigured"


def test_signature_is_bound_to_exact_raw_body() -> None:
    body = b'{"object":"whatsapp_business_account","entry":[]}'
    signature = "sha256=" + hmac.new(
        APP_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()

    assert verify_meta_signature(APP_SECRET, body, signature) is True
    assert verify_meta_signature(APP_SECRET, body + b"\n", signature) is False
    assert verify_meta_signature(APP_SECRET, body, None) is False
    assert verify_meta_signature(APP_SECRET, body, "sha1=deadbeef") is False


def test_post_rejects_invalid_signature(client: TestClient) -> None:
    body, _ = _signed_body({"object": "whatsapp_business_account", "entry": []})

    response = client.post(
        "/webhooks/whatsapp",
        content=body,
        headers={"X-Hub-Signature-256": "sha256=bad"},
    )

    assert response.status_code == 401


def test_post_fails_closed_when_app_secret_is_unconfigured(
    app: FastAPI,
    client: TestClient,
) -> None:
    app.dependency_overrides[get_settings] = lambda: _settings(app_secret=None)

    response = client.post("/webhooks/whatsapp", content=b"{}")

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "whatsapp_app_secret_unconfigured"


def test_signed_non_actionable_payload_is_acknowledged(client: TestClient) -> None:
    response = _post_signed(
        client,
        {"object": "whatsapp_business_account", "entry": []},
    )

    assert response.status_code == 200
    assert response.json() == {"received": True, "events": 0}


def test_text_message_is_normalized_without_business_side_effects() -> None:
    events = parse_whatsapp_webhook(_text_payload())

    assert len(events) == 1
    event = events[0]
    assert isinstance(event, InboundMessageEvent)
    assert event.phone_number_id == "phone-123"
    assert event.message_id == "wamid.incoming-1"
    assert event.sender_id == "905551112233"
    assert event.message_type == "text"
    assert event.text == "Merhaba"
    assert event.contact_name == "Müşteri"
    assert event.media_id is None


def test_status_event_is_normalized_without_assuming_delivery_order() -> None:
    events = parse_whatsapp_webhook(_status_payload())

    assert len(events) == 1
    event = events[0]
    assert isinstance(event, MessageStatusEvent)
    assert event.phone_number_id == "phone-123"
    assert event.message_id == "wamid.outgoing-1"
    assert event.status == "failed"
    assert event.recipient_id == "905551112233"
    assert event.error_codes == ("131000",)


def test_image_message_keeps_only_provider_media_reference() -> None:
    payload = _text_payload()
    value = payload["entry"][0]["changes"][0]["value"]
    value["messages"] = [
        {
            "from": "905551112233",
            "id": "wamid.image-1",
            "timestamp": "1786981000",
            "type": "image",
            "image": {"id": "media-42", "mime_type": "image/jpeg"},
        }
    ]

    events = parse_whatsapp_webhook(payload)

    event = events[0]
    assert isinstance(event, InboundMessageEvent)
    assert event.message_type == "image"
    assert event.text is None
    assert event.media_id == "media-42"


def test_actionable_events_are_not_acknowledged_before_runtime_bridge(
    client: TestClient,
) -> None:
    response = _post_signed(client, _text_payload())

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "whatsapp_runtime_not_ready"


def test_signed_malformed_json_returns_400(client: TestClient) -> None:
    body = b"{not-json"
    signature = "sha256=" + hmac.new(
        APP_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()

    response = client.post(
        "/webhooks/whatsapp",
        content=body,
        headers={"X-Hub-Signature-256": signature},
    )

    assert response.status_code == 400


def test_actionable_payload_without_phone_number_id_fails_closed(
    client: TestClient,
) -> None:
    payload = _text_payload()
    del payload["entry"][0]["changes"][0]["value"]["metadata"]["phone_number_id"]

    response = _post_signed(client, payload)

    assert response.status_code == 400


def test_webhook_body_is_bounded_before_json_parsing(client: TestClient) -> None:
    response = client.post(
        "/webhooks/whatsapp",
        content=b"x" * (MAX_WEBHOOK_BODY_BYTES + 1),
        headers={"X-Hub-Signature-256": "sha256=irrelevant"},
    )

    assert response.status_code == 413


def test_settings_trim_optional_whatsapp_secrets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", "  verify-value  ")
    monkeypatch.setenv("WHATSAPP_APP_SECRET", "  secret-value  ")
    get_settings.cache_clear()

    try:
        current = get_settings()
        assert current.whatsapp_verify_token == "verify-value"
        assert current.whatsapp_app_secret == "secret-value"
    finally:
        get_settings.cache_clear()

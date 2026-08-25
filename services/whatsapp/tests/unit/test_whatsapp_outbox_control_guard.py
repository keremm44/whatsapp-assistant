from __future__ import annotations

from typing import Any

import whatsapp_sender


class _Settings:
    whatsapp_send_enabled = True
    whatsapp_access_token = "secret"
    whatsapp_graph_api_version = "v23.0"


def _context() -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "outbox": {
            "id": 71,
            "channel_id": 4,
            "seller_id": 11,
            "customer_id": 22,
            "source_message_id": 101,
            "message_id": 202,
            "recipient_id": "905551112244",
            "status": "PENDING",
            "provider_message_id": None,
            "attempt_count": 0,
            "next_attempt_at": None,
        },
        "channel": {
            "id": 4,
            "seller_id": 11,
            "phone_number_id": "123456789",
            "is_active": True,
        },
        "message": {
            "id": 202,
            "seller_id": 11,
            "customer_id": 22,
            "direction": "outgoing",
            "content": "Merhaba",
            "message_type": "text",
            "provider": "whatsapp_cloud_pending",
            "provider_message_id": None,
            "reply_to_message_id": 101,
        },
    }


def test_dispatch_never_posts_when_claim_suppresses_after_control_change(monkeypatch) -> None:
    monkeypatch.setattr(whatsapp_sender, "get_whatsapp_delivery_context", lambda _id: _context())
    monkeypatch.setattr(
        whatsapp_sender,
        "claim_whatsapp_delivery_outbox",
        lambda _id: {
            "durum": "başarılı",
            "claimed": False,
            "changed": True,
            "outbox": {**_context()["outbox"], "status": "SUPPRESSED"},
        },
    )
    monkeypatch.setattr(
        whatsapp_sender,
        "_post_message",
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError("HTTP send must not start")),
    )

    result = whatsapp_sender.dispatch_whatsapp_outbox(
        71,
        current_settings=_Settings(),  # type: ignore[arg-type]
    )

    assert result == {
        "durum": "atlandı",
        "reason_code": "whatsapp_outbox_not_claimed",
        "delivery_state": "SUPPRESSED",
    }


def test_dispatch_never_posts_when_takeover_already_suppressed_outbox(monkeypatch) -> None:
    context = _context()
    context["outbox"] = {**context["outbox"], "status": "SUPPRESSED"}
    monkeypatch.setattr(whatsapp_sender, "get_whatsapp_delivery_context", lambda _id: context)
    monkeypatch.setattr(
        whatsapp_sender,
        "claim_whatsapp_delivery_outbox",
        lambda _id: (_ for _ in ()).throw(AssertionError("suppressed rows must not be claimed")),
    )
    monkeypatch.setattr(
        whatsapp_sender,
        "_post_message",
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError("HTTP send must not start")),
    )

    result = whatsapp_sender.dispatch_whatsapp_outbox(
        71,
        current_settings=_Settings(),  # type: ignore[arg-type]
    )

    assert result == {
        "durum": "atlandı",
        "reason_code": "whatsapp_outbox_not_pending",
        "delivery_state": "SUPPRESSED",
    }

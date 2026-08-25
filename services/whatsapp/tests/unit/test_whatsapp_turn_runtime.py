from __future__ import annotations

from typing import Any

import whatsapp_webhook.runtime as runtime
from whatsapp_webhook.models import InboundMessageEvent


def _event() -> InboundMessageEvent:
    return InboundMessageEvent(
        "phone-1",
        "wamid.1",
        "905551112233",
        "1",
        "text",
        "45892 sipariş numaram",
        None,
        None,
    )


def test_runtime_propagates_turn_suppression_to_chat_scope(monkeypatch) -> None:
    chat_calls: list[dict[str, Any]] = []
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
        lambda **kwargs: chat_calls.append(kwargs)
        or {
            "durum": "otomatik_yanıt_yok",
            "customer_id": 51,
            "incoming_message_id": 1001,
            "reason_code": "turn_buffer_intermediate_message",
        },
    )
    monkeypatch.setattr(
        runtime,
        "ensure_whatsapp_inbound_outcome",
        lambda **kwargs: {"durum": "başarılı", "created": True},
    )

    result = runtime.process_inbound_message(_event(), suppress_outgoing=True)

    assert result["durum"] == "başarılı"
    assert result["outcome"] == "NO_REPLY"
    assert chat_calls[0]["suppress_outgoing"] is True


def test_runtime_rejects_non_boolean_turn_suppression() -> None:
    result = runtime.process_inbound_message(_event(), suppress_outgoing=1)  # type: ignore[arg-type]
    assert result == {
        "durum": "hata",
        "reason_code": "whatsapp_turn_suppression_invalid",
    }

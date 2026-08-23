from __future__ import annotations

from typing import Any

import whatsapp_webhook.inbox as inbox
from whatsapp_webhook.models import InboundMessageEvent, MessageStatusEvent


def _inbound(message_id: str, text: str) -> InboundMessageEvent:
    return InboundMessageEvent(
        "phone-1",
        message_id,
        "905551112233",
        "1",
        "text",
        text,
        None,
        None,
    )


def test_inbox_marks_plain_information_for_debounce(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        inbox,
        "enqueue_whatsapp_event",
        lambda **kwargs: calls.append(kwargs)
        or {"durum": "başarılı", "created": True, "event": {"id": 1}},
    )

    result = inbox.enqueue_webhook_events([_inbound("wamid.1", "45892 sipariş numaram")])

    assert result["durum"] == "başarılı"
    payload = calls[0]["payload"]
    assert payload["_turn_debounce_seconds"] == 4
    assert payload["_turn_max_seconds"] == 12


def test_inbox_marks_direct_question_for_immediate_processing(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        inbox,
        "enqueue_whatsapp_event",
        lambda **kwargs: calls.append(kwargs)
        or {"durum": "başarılı", "created": True, "event": {"id": 1}},
    )

    inbox.enqueue_webhook_events([_inbound("wamid.2", "Sipariş numaramı nereden bulurum?")])

    assert calls[0]["payload"]["_turn_debounce_seconds"] == 0
    assert calls[0]["payload"]["_turn_max_seconds"] == 12


def test_status_events_do_not_receive_turn_metadata(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        inbox,
        "enqueue_whatsapp_event",
        lambda **kwargs: calls.append(kwargs)
        or {"durum": "başarılı", "created": True, "event": {"id": 1}},
    )
    status = MessageStatusEvent(
        "phone-1",
        "wamid.out-1",
        "delivered",
        "2",
        "905551112233",
        (),
    )

    inbox.enqueue_webhook_events([status])

    assert "_turn_debounce_seconds" not in calls[0]["payload"]
    assert "_turn_max_seconds" not in calls[0]["payload"]

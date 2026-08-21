from __future__ import annotations

from typing import Any, Iterable

from database.whatsapp_event_queue import enqueue_whatsapp_event

from .models import InboundMessageEvent, MessageStatusEvent, WhatsAppEvent


MAX_EVENTS_PER_WEBHOOK = 50


def _inbound_payload(event: InboundMessageEvent) -> dict[str, Any]:
    return {
        "message_id": event.message_id,
        "sender_id": event.sender_id,
        "timestamp": event.timestamp,
        "message_type": event.message_type,
        "text": event.text,
        "contact_name": event.contact_name,
        "media_id": event.media_id,
    }


def _status_payload(event: MessageStatusEvent) -> dict[str, Any]:
    return {
        "message_id": event.message_id,
        "status": event.status,
        "timestamp": event.timestamp,
        "recipient_id": event.recipient_id,
        "error_codes": list(event.error_codes),
    }


def _event_record(event: WhatsAppEvent) -> tuple[str, str, str, dict[str, Any]] | None:
    if isinstance(event, InboundMessageEvent):
        return (
            "inbound_message",
            f"inbound:{event.phone_number_id}:{event.message_id}",
            event.phone_number_id,
            _inbound_payload(event),
        )
    if isinstance(event, MessageStatusEvent):
        # A provider can legitimately emit delivered and read for the same
        # message. The status is therefore part of this event's idempotency key.
        return (
            "message_status",
            f"status:{event.phone_number_id}:{event.message_id}:{event.status}",
            event.phone_number_id,
            _status_payload(event),
        )
    return None


def enqueue_webhook_events(events: Iterable[WhatsAppEvent]) -> dict[str, Any]:
    """Persist a bounded batch before acknowledging Meta's webhook request."""
    event_list = list(events)
    if len(event_list) > MAX_EVENTS_PER_WEBHOOK:
        return {
            "durum": "doğrulama_hatası",
            "reason_code": "whatsapp_webhook_event_limit_exceeded",
        }

    queued = 0
    duplicates = 0
    for event in event_list:
        record = _event_record(event)
        if record is None:
            return {
                "durum": "hata",
                "reason_code": "whatsapp_webhook_event_type_unknown",
            }
        event_type, event_key, phone_number_id, payload = record
        result = enqueue_whatsapp_event(
            event_type=event_type,
            event_key=event_key,
            phone_number_id=phone_number_id,
            payload=payload,
        )
        if result.get("durum") != "başarılı":
            return {
                "durum": "hata",
                "reason_code": "whatsapp_inbox_enqueue_failed",
            }
        if result.get("created") is True:
            queued += 1
        else:
            duplicates += 1

    return {"durum": "başarılı", "queued": queued, "duplicates": duplicates}

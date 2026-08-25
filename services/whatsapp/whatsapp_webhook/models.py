from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class InboundMessageEvent:
    phone_number_id: str
    message_id: str
    sender_id: str
    timestamp: str | None
    message_type: str
    text: str | None
    contact_name: str | None
    media_id: str | None


@dataclass(frozen=True, slots=True)
class MessageStatusEvent:
    phone_number_id: str
    message_id: str
    status: str
    timestamp: str | None
    recipient_id: str | None
    error_codes: tuple[str, ...]


WhatsAppEvent = InboundMessageEvent | MessageStatusEvent

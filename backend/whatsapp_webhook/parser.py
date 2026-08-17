from __future__ import annotations

from typing import Any

from .models import InboundMessageEvent, MessageStatusEvent, WhatsAppEvent


class WebhookPayloadError(ValueError):
    """Signed webhook payload is structurally unsafe to process."""


def _dict(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _non_empty_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _contact_names(value: dict[str, Any]) -> dict[str, str]:
    names: dict[str, str] = {}
    for raw_contact in _list(value.get("contacts")):
        contact = _dict(raw_contact)
        if contact is None:
            continue
        wa_id = _non_empty_string(contact.get("wa_id"))
        profile = _dict(contact.get("profile"))
        name = _non_empty_string(profile.get("name")) if profile else None
        if wa_id and name:
            names[wa_id] = name
    return names


def _phone_number_id(value: dict[str, Any]) -> str:
    metadata = _dict(value.get("metadata"))
    phone_number_id = (
        _non_empty_string(metadata.get("phone_number_id"))
        if metadata
        else None
    )
    if phone_number_id is None:
        raise WebhookPayloadError(
            "WhatsApp messages değişikliği phone_number_id içermiyor."
        )
    return phone_number_id


def _parse_messages(
    value: dict[str, Any],
    *,
    phone_number_id: str,
) -> list[InboundMessageEvent]:
    contacts = _contact_names(value)
    events: list[InboundMessageEvent] = []

    for raw_message in _list(value.get("messages")):
        message = _dict(raw_message)
        if message is None:
            raise WebhookPayloadError("WhatsApp message kaydı nesne olmalıdır.")

        message_id = _non_empty_string(message.get("id"))
        sender_id = _non_empty_string(message.get("from"))
        message_type = _non_empty_string(message.get("type"))
        if message_id is None or sender_id is None or message_type is None:
            raise WebhookPayloadError(
                "WhatsApp message id, from ve type alanları zorunludur."
            )

        timestamp = _non_empty_string(message.get("timestamp"))
        text: str | None = None
        media_id: str | None = None

        if message_type == "text":
            text_payload = _dict(message.get("text"))
            if text_payload is not None:
                raw_body = text_payload.get("body")
                if isinstance(raw_body, str):
                    text = raw_body
        else:
            typed_payload = _dict(message.get(message_type))
            if typed_payload is not None:
                media_id = _non_empty_string(typed_payload.get("id"))

        events.append(
            InboundMessageEvent(
                phone_number_id=phone_number_id,
                message_id=message_id,
                sender_id=sender_id,
                timestamp=timestamp,
                message_type=message_type,
                text=text,
                contact_name=contacts.get(sender_id),
                media_id=media_id,
            )
        )

    return events


def _parse_statuses(
    value: dict[str, Any],
    *,
    phone_number_id: str,
) -> list[MessageStatusEvent]:
    events: list[MessageStatusEvent] = []

    for raw_status in _list(value.get("statuses")):
        status_item = _dict(raw_status)
        if status_item is None:
            raise WebhookPayloadError("WhatsApp status kaydı nesne olmalıdır.")

        message_id = _non_empty_string(status_item.get("id"))
        status_value = _non_empty_string(status_item.get("status"))
        if message_id is None or status_value is None:
            raise WebhookPayloadError(
                "WhatsApp status id ve status alanları zorunludur."
            )

        error_codes: list[str] = []
        for raw_error in _list(status_item.get("errors")):
            error = _dict(raw_error)
            if error is None:
                continue
            code = error.get("code")
            if isinstance(code, (str, int)) and not isinstance(code, bool):
                error_codes.append(str(code))

        events.append(
            MessageStatusEvent(
                phone_number_id=phone_number_id,
                message_id=message_id,
                status=status_value,
                timestamp=_non_empty_string(status_item.get("timestamp")),
                recipient_id=_non_empty_string(status_item.get("recipient_id")),
                error_codes=tuple(error_codes),
            )
        )

    return events


def parse_whatsapp_webhook(payload: Any) -> list[WhatsAppEvent]:
    """Normalize signed Meta WhatsApp webhook payloads without business side effects."""
    if not isinstance(payload, dict):
        raise WebhookPayloadError("Webhook gövdesi JSON nesnesi olmalıdır.")

    if payload.get("object") != "whatsapp_business_account":
        return []

    events: list[WhatsAppEvent] = []
    for raw_entry in _list(payload.get("entry")):
        entry = _dict(raw_entry)
        if entry is None:
            raise WebhookPayloadError("WhatsApp entry kaydı nesne olmalıdır.")

        for raw_change in _list(entry.get("changes")):
            change = _dict(raw_change)
            if change is None:
                raise WebhookPayloadError("WhatsApp change kaydı nesne olmalıdır.")
            if change.get("field") != "messages":
                continue

            value = _dict(change.get("value"))
            if value is None:
                raise WebhookPayloadError(
                    "WhatsApp messages değişikliği value nesnesi içermelidir."
                )

            has_messages = bool(_list(value.get("messages")))
            has_statuses = bool(_list(value.get("statuses")))
            if not has_messages and not has_statuses:
                continue

            phone_number_id = _phone_number_id(value)
            events.extend(
                _parse_messages(value, phone_number_id=phone_number_id)
            )
            events.extend(
                _parse_statuses(value, phone_number_id=phone_number_id)
            )

    return events

from __future__ import annotations

import logging
from typing import Any, Iterable

import chat_service
import database
from database.whatsapp_delivery import (
    apply_whatsapp_delivery_status,
    ensure_whatsapp_delivery_outbox,
    resolve_whatsapp_channel,
)
from database.whatsapp_inbound import (
    ensure_whatsapp_inbound_outcome,
    get_whatsapp_inbound_outcome,
)
from database.whatsapp_message_bridge import get_outgoing_reply_for_source_message

from .models import InboundMessageEvent, MessageStatusEvent


logger = logging.getLogger(__name__)


def _positive_int(value: Any) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool) and value > 0:
        return value
    return None


def _failure(reason_code: str) -> dict[str, Any]:
    return {"durum": "hata", "reason_code": reason_code}


def _resolve_duplicate_identity(
    *,
    event: InboundMessageEvent,
    seller_id: int,
    chat_result: dict[str, Any],
) -> tuple[int, int] | None:
    customer_id = _positive_int(chat_result.get("customer_id"))
    incoming_message_id = _positive_int(chat_result.get("incoming_message_id"))
    if customer_id is not None and incoming_message_id is not None:
        return customer_id, incoming_message_id

    duplicate = database.check_message_duplicate(
        provider="whatsapp_cloud",
        provider_message_id=event.message_id,
    )
    if duplicate.get("durum") != "başarılı" or duplicate.get("duplicate") is not True:
        return None
    message = duplicate.get("message")
    if not isinstance(message, dict):
        return None
    if (
        message.get("seller_id") != seller_id
        or message.get("direction") != "incoming"
        or message.get("provider") != "whatsapp_cloud"
        or message.get("provider_message_id") != event.message_id
    ):
        return None

    customer_id = _positive_int(message.get("customer_id"))
    incoming_message_id = _positive_int(message.get("id"))
    if customer_id is None or incoming_message_id is None:
        return None
    return customer_id, incoming_message_id


def _ensure_reply_delivery(
    *,
    channel_id: int,
    seller_id: int,
    customer_id: int,
    incoming_message_id: int,
    outgoing_message_id: int,
    recipient_id: str,
) -> dict[str, Any]:
    outcome_result = ensure_whatsapp_inbound_outcome(
        channel_id=channel_id,
        seller_id=seller_id,
        customer_id=customer_id,
        incoming_message_id=incoming_message_id,
        outcome="REPLY",
        outgoing_message_id=outgoing_message_id,
    )
    if outcome_result.get("durum") != "başarılı":
        return _failure("whatsapp_reply_outcome_persist_failed")

    outbox_result = ensure_whatsapp_delivery_outbox(
        channel_id=channel_id,
        seller_id=seller_id,
        customer_id=customer_id,
        source_message_id=incoming_message_id,
        message_id=outgoing_message_id,
        recipient_id=recipient_id,
    )
    if outbox_result.get("durum") != "başarılı":
        return _failure("whatsapp_outbox_persist_failed")

    outbox = outbox_result.get("outbox")
    outbox_id = _positive_int(outbox.get("id")) if isinstance(outbox, dict) else None
    if outbox_id is None:
        return _failure("whatsapp_outbox_identity_unavailable")

    return {
        "durum": "başarılı",
        "event": "inbound",
        "outcome": "REPLY",
        "incoming_message_id": incoming_message_id,
        "outgoing_message_id": outgoing_message_id,
        "outbox_id": outbox_id,
    }


def _recover_duplicate_inbound(
    *,
    event: InboundMessageEvent,
    channel_id: int,
    seller_id: int,
    chat_result: dict[str, Any],
) -> dict[str, Any]:
    identity = _resolve_duplicate_identity(
        event=event,
        seller_id=seller_id,
        chat_result=chat_result,
    )
    if identity is None:
        return _failure("whatsapp_duplicate_identity_unavailable")
    customer_id, incoming_message_id = identity

    outcome_result = get_whatsapp_inbound_outcome(
        seller_id=seller_id,
        customer_id=customer_id,
        incoming_message_id=incoming_message_id,
    )
    if outcome_result.get("durum") == "başarılı":
        outcome = outcome_result.get("outcome")
        if not isinstance(outcome, dict) or outcome.get("channel_id") != channel_id:
            return _failure("whatsapp_duplicate_outcome_tenant_mismatch")
        if outcome.get("outcome") == "NO_REPLY":
            return {
                "durum": "başarılı",
                "event": "inbound",
                "duplicate": True,
                "outcome": "NO_REPLY",
                "incoming_message_id": incoming_message_id,
            }
        if outcome.get("outcome") == "REPLY":
            outgoing_message_id = _positive_int(outcome.get("outgoing_message_id"))
            if outgoing_message_id is None:
                return _failure("whatsapp_duplicate_reply_identity_unavailable")
            recovered = _ensure_reply_delivery(
                channel_id=channel_id,
                seller_id=seller_id,
                customer_id=customer_id,
                incoming_message_id=incoming_message_id,
                outgoing_message_id=outgoing_message_id,
                recipient_id=event.sender_id,
            )
            if recovered.get("durum") == "başarılı":
                recovered["duplicate"] = True
            return recovered
        return _failure("whatsapp_duplicate_outcome_invalid")

    if outcome_result.get("durum") != "bulunamadı":
        return _failure("whatsapp_duplicate_outcome_read_failed")

    # A correlated outgoing row is safe evidence that chat processing reached
    # the reply-persist boundary before a crash. Rebuild the missing outcome.
    reply_result = get_outgoing_reply_for_source_message(
        seller_id=seller_id,
        customer_id=customer_id,
        source_message_id=incoming_message_id,
    )
    if reply_result.get("durum") == "başarılı":
        message = reply_result.get("message")
        outgoing_message_id = (
            _positive_int(message.get("id")) if isinstance(message, dict) else None
        )
        if outgoing_message_id is None:
            return _failure("whatsapp_duplicate_reply_identity_unavailable")
        recovered = _ensure_reply_delivery(
            channel_id=channel_id,
            seller_id=seller_id,
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            outgoing_message_id=outgoing_message_id,
            recipient_id=event.sender_id,
        )
        if recovered.get("durum") == "başarılı":
            recovered["duplicate"] = True
            recovered["outcome_recovered"] = True
        return recovered

    if reply_result.get("durum") == "bulunamadı":
        # Do not rerun business orchestration: we cannot distinguish a legitimate
        # NO_REPLY from a crash before processing completed.
        return _failure("whatsapp_duplicate_outcome_unavailable")
    return _failure("whatsapp_duplicate_reply_read_failed")


def process_inbound_message(event: InboundMessageEvent) -> dict[str, Any]:
    if event.message_type != "text" or not isinstance(event.text, str):
        return _failure("whatsapp_message_type_not_ready")

    channel_result = resolve_whatsapp_channel(event.phone_number_id)
    if channel_result.get("durum") != "başarılı":
        return _failure("whatsapp_channel_unavailable")
    channel = channel_result.get("channel")
    if not isinstance(channel, dict):
        return _failure("whatsapp_channel_invalid")
    channel_id = _positive_int(channel.get("id"))
    seller_id = _positive_int(channel.get("seller_id"))
    if channel_id is None or seller_id is None:
        return _failure("whatsapp_channel_invalid")

    chat_result = chat_service.sohbet_isle(
        seller_id=seller_id,
        whatsapp_number=event.sender_id,
        kullanici_mesaji=event.text,
        customer_name=event.contact_name,
        provider="whatsapp_cloud",
        provider_message_id=event.message_id,
        message_type="text",
        outgoing_provider="whatsapp_cloud_pending",
    )
    if not isinstance(chat_result, dict):
        return _failure("whatsapp_chat_invalid_result")

    chat_status = chat_result.get("durum")
    if chat_status == "duplicate":
        return _recover_duplicate_inbound(
            event=event,
            channel_id=channel_id,
            seller_id=seller_id,
            chat_result=chat_result,
        )

    customer_id = _positive_int(chat_result.get("customer_id"))
    incoming_message_id = _positive_int(chat_result.get("incoming_message_id"))
    if customer_id is None or incoming_message_id is None:
        return _failure("whatsapp_chat_identity_unavailable")

    if chat_status == "otomatik_yanıt_yok":
        outcome_result = ensure_whatsapp_inbound_outcome(
            channel_id=channel_id,
            seller_id=seller_id,
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            outcome="NO_REPLY",
            reason_code=(
                str(chat_result.get("reason_code"))[:64]
                if chat_result.get("reason_code")
                else None
            ),
        )
        if outcome_result.get("durum") != "başarılı":
            return _failure("whatsapp_no_reply_outcome_persist_failed")
        return {
            "durum": "başarılı",
            "event": "inbound",
            "outcome": "NO_REPLY",
            "incoming_message_id": incoming_message_id,
        }

    if chat_status != "başarılı":
        return _failure("whatsapp_chat_processing_failed")

    outgoing_message_id = _positive_int(chat_result.get("outgoing_message_id"))
    if outgoing_message_id is None:
        return _failure("whatsapp_outgoing_identity_unavailable")

    return _ensure_reply_delivery(
        channel_id=channel_id,
        seller_id=seller_id,
        customer_id=customer_id,
        incoming_message_id=incoming_message_id,
        outgoing_message_id=outgoing_message_id,
        recipient_id=event.sender_id,
    )


def process_status_event(event: MessageStatusEvent) -> dict[str, Any]:
    channel_result = resolve_whatsapp_channel(event.phone_number_id)
    if channel_result.get("durum") != "başarılı":
        return _failure("whatsapp_status_channel_unavailable")

    error_code = event.error_codes[0] if event.error_codes else None
    result = apply_whatsapp_delivery_status(
        phone_number_id=event.phone_number_id,
        provider_message_id=event.message_id,
        status=event.status,
        error_code=error_code,
    )
    if result.get("durum") != "başarılı":
        return _failure("whatsapp_status_persist_failed")
    return {
        "durum": "başarılı",
        "event": "status",
        "status": event.status,
    }


def process_webhook_events(
    events: Iterable[InboundMessageEvent | MessageStatusEvent],
) -> dict[str, Any]:
    processed = 0
    for event in events:
        if isinstance(event, InboundMessageEvent):
            result = process_inbound_message(event)
        elif isinstance(event, MessageStatusEvent):
            result = process_status_event(event)
        else:
            return _failure("whatsapp_event_type_unknown")
        if result.get("durum") != "başarılı":
            logger.warning(
                "WhatsApp webhook event fail-closed: reason_code=%s",
                result.get("reason_code", "unknown"),
            )
            return result
        processed += 1
    return {"durum": "başarılı", "processed": processed}

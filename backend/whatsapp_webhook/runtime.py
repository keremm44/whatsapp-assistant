from __future__ import annotations

import logging
from typing import Any, Iterable, NamedTuple

import chat_service
import database
from database.whatsapp_delivery import (
    apply_whatsapp_delivery_status,
    ensure_whatsapp_delivery_outbox,
    resolve_whatsapp_channel,
)
from database.whatsapp_event_queue import renew_whatsapp_event_claim
from database.whatsapp_inbound import (
    ensure_whatsapp_inbound_outcome,
    get_whatsapp_inbound_outcome,
)
from database.whatsapp_message_bridge import get_outgoing_reply_for_source_message

from .models import InboundMessageEvent, MessageStatusEvent


logger = logging.getLogger(__name__)
_MAX_WORKER_ID_LENGTH = 120


class _WorkerClaim(NamedTuple):
    event_id: int
    worker_id: str
    claim_version: int


def _positive_int(value: Any) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool) and value > 0:
        return value
    return None


def _failure(reason_code: str) -> dict[str, Any]:
    return {"durum": "hata", "reason_code": reason_code}


def _worker_claim(
    *,
    worker_event_id: int | None,
    worker_id: str | None,
    claim_version: int | None,
) -> _WorkerClaim | None:
    supplied = (
        worker_event_id is not None,
        worker_id is not None,
        claim_version is not None,
    )
    if not any(supplied):
        return None
    if not all(supplied):
        return None
    normalized_worker = worker_id.strip() if isinstance(worker_id, str) else ""
    event_id = _positive_int(worker_event_id)
    version = _positive_int(claim_version)
    if (
        event_id is None
        or version is None
        or not normalized_worker
        or len(normalized_worker) > _MAX_WORKER_ID_LENGTH
    ):
        return None
    return _WorkerClaim(event_id, normalized_worker, version)


def _claim_args_complete(
    *,
    worker_event_id: int | None,
    worker_id: str | None,
    claim_version: int | None,
) -> bool:
    supplied = (
        worker_event_id is not None,
        worker_id is not None,
        claim_version is not None,
    )
    return not any(supplied) or all(supplied)


def _renew_runtime_claim(claim: _WorkerClaim | None) -> dict[str, Any] | None:
    if claim is None:
        return None
    result = renew_whatsapp_event_claim(
        claim.event_id,
        worker_id=claim.worker_id,
        claim_version=claim.claim_version,
    )
    if result.get("durum") == "başarılı":
        return None
    if result.get("durum") == "çakışma":
        return _failure("whatsapp_claim_lost")
    return _failure(str(result.get("reason_code") or "whatsapp_claim_verification_failed"))


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
    worker_claim: _WorkerClaim | None = None,
) -> dict[str, Any]:
    blocked = _renew_runtime_claim(worker_claim)
    if blocked is not None:
        return blocked
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

    blocked = _renew_runtime_claim(worker_claim)
    if blocked is not None:
        return blocked
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
    worker_claim: _WorkerClaim | None = None,
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
                worker_claim=worker_claim,
            )
            if recovered.get("durum") == "başarılı":
                recovered["duplicate"] = True
            return recovered
        return _failure("whatsapp_duplicate_outcome_invalid")

    if outcome_result.get("durum") != "bulunamadı":
        return _failure("whatsapp_duplicate_outcome_read_failed")

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
            worker_claim=worker_claim,
        )
        if recovered.get("durum") == "başarılı":
            recovered["duplicate"] = True
            recovered["outcome_recovered"] = True
        return recovered

    if reply_result.get("durum") == "bulunamadı":
        return _failure("whatsapp_duplicate_outcome_unavailable")
    return _failure("whatsapp_duplicate_reply_read_failed")


def process_inbound_message(
    event: InboundMessageEvent,
    *,
    worker_event_id: int | None = None,
    worker_id: str | None = None,
    claim_version: int | None = None,
) -> dict[str, Any]:
    if not _claim_args_complete(
        worker_event_id=worker_event_id,
        worker_id=worker_id,
        claim_version=claim_version,
    ):
        return _failure("whatsapp_claim_context_invalid")
    worker_claim = _worker_claim(
        worker_event_id=worker_event_id,
        worker_id=worker_id,
        claim_version=claim_version,
    )
    if worker_event_id is not None and worker_claim is None:
        return _failure("whatsapp_claim_context_invalid")

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
        worker_event_id=worker_claim.event_id if worker_claim is not None else None,
        worker_id=worker_claim.worker_id if worker_claim is not None else None,
        claim_version=worker_claim.claim_version if worker_claim is not None else None,
    )
    if not isinstance(chat_result, dict):
        return _failure("whatsapp_chat_invalid_result")

    chat_status = chat_result.get("durum")
    if chat_result.get("reason_code") == "whatsapp_claim_lost":
        return _failure("whatsapp_claim_lost")
    if chat_status == "duplicate":
        return _recover_duplicate_inbound(
            event=event,
            channel_id=channel_id,
            seller_id=seller_id,
            chat_result=chat_result,
            worker_claim=worker_claim,
        )

    customer_id = _positive_int(chat_result.get("customer_id"))
    incoming_message_id = _positive_int(chat_result.get("incoming_message_id"))
    if customer_id is None or incoming_message_id is None:
        return _failure("whatsapp_chat_identity_unavailable")

    if chat_status == "otomatik_yanıt_yok":
        blocked = _renew_runtime_claim(worker_claim)
        if blocked is not None:
            return blocked
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
        worker_claim=worker_claim,
    )


def process_status_event(
    event: MessageStatusEvent,
    *,
    worker_event_id: int | None = None,
    worker_id: str | None = None,
    claim_version: int | None = None,
) -> dict[str, Any]:
    if not _claim_args_complete(
        worker_event_id=worker_event_id,
        worker_id=worker_id,
        claim_version=claim_version,
    ):
        return _failure("whatsapp_claim_context_invalid")
    worker_claim = _worker_claim(
        worker_event_id=worker_event_id,
        worker_id=worker_id,
        claim_version=claim_version,
    )
    if worker_event_id is not None and worker_claim is None:
        return _failure("whatsapp_claim_context_invalid")

    channel_result = resolve_whatsapp_channel(event.phone_number_id)
    if channel_result.get("durum") != "başarılı":
        return _failure("whatsapp_status_channel_unavailable")

    blocked = _renew_runtime_claim(worker_claim)
    if blocked is not None:
        return blocked
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

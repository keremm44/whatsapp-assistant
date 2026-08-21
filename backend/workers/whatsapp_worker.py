from __future__ import annotations

import logging
import os
import socket
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from database.whatsapp_delivery import get_next_whatsapp_delivery_outbox_id
from database.whatsapp_event_queue import claim_next_whatsapp_event, complete_whatsapp_event
from settings import get_settings
from whatsapp_sender import dispatch_whatsapp_outbox
from whatsapp_webhook.models import InboundMessageEvent, MessageStatusEvent
from whatsapp_webhook.runtime import process_inbound_message, process_status_event

logger = logging.getLogger(__name__)
_RETRY_SECONDS = 60


def _event_from_row(row: dict[str, Any]) -> InboundMessageEvent | MessageStatusEvent | None:
    payload = row.get("payload")
    phone_number_id = row.get("phone_number_id")
    if not isinstance(payload, dict) or not isinstance(phone_number_id, str):
        return None
    if row.get("event_type") == "inbound_message":
        required = ("message_id", "sender_id", "message_type")
        if not all(isinstance(payload.get(key), str) and payload[key] for key in required): return None
        return InboundMessageEvent(phone_number_id, payload["message_id"], payload["sender_id"], payload.get("timestamp"), payload["message_type"], payload.get("text"), payload.get("contact_name"), payload.get("media_id"))
    if row.get("event_type") == "message_status":
        if not isinstance(payload.get("message_id"), str) or not isinstance(payload.get("status"), str): return None
        codes = payload.get("error_codes", [])
        if not isinstance(codes, list) or not all(isinstance(code, str) for code in codes): return None
        return MessageStatusEvent(phone_number_id, payload["message_id"], payload["status"], payload.get("timestamp"), payload.get("recipient_id"), tuple(codes))
    return None


def process_one(worker_id: str) -> bool:
    claimed = claim_next_whatsapp_event(worker_id)
    if claimed.get("durum") == "boş": return False
    if claimed.get("durum") != "başarılı" or not isinstance(claimed.get("event"), dict):
        logger.error("WhatsApp inbox claim başarısız")
        return False
    row = claimed["event"]
    event_id = row.get("id")
    event = _event_from_row(row)
    if not isinstance(event_id, int) or event is None:
        if isinstance(event_id, int): complete_whatsapp_event(event_id, outcome="FAILED", error_code="invalid_queued_event")
        return True
    result = process_inbound_message(event) if isinstance(event, InboundMessageEvent) else process_status_event(event)
    if result.get("durum") == "başarılı": complete_whatsapp_event(event_id, outcome="PROCESSED")
    else:
        retry_at = (datetime.now(timezone.utc) + timedelta(seconds=_RETRY_SECONDS)).isoformat()
        complete_whatsapp_event(event_id, outcome="RETRY", error_code=str(result.get("reason_code") or "processing_failed")[:64], retry_at=retry_at)
    return True


def process_one_outbound() -> bool:
    """Discover one due outbox row; sender performs the authoritative claim."""
    settings = get_settings()
    if not settings.whatsapp_send_enabled:
        return False

    candidate = get_next_whatsapp_delivery_outbox_id()
    if candidate.get("durum") == "boş":
        return False
    outbox_id = candidate.get("outbox_id")
    if candidate.get("durum") != "başarılı" or not isinstance(outbox_id, int):
        logger.error("WhatsApp outbox discovery başarısız")
        return False

    result = dispatch_whatsapp_outbox(outbox_id, current_settings=settings)
    if result.get("durum") == "hata":
        logger.error("WhatsApp outbox dispatch başarısız: reason_code=%s", result.get("reason_code"))
    return True


def main() -> None:
    worker_id = os.getenv("WHATSAPP_WORKER_ID", f"{socket.gethostname()}-{os.getpid()}")
    while True:
        inbound_worked = process_one(worker_id)
        outbound_worked = process_one_outbound()
        if not inbound_worked and not outbound_worked:
            time.sleep(1)

if __name__ == "__main__": main()

from __future__ import annotations

import logging
import os
import socket
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from database.operational_health import record_whatsapp_worker_heartbeat
from database.whatsapp_event_queue import claim_next_whatsapp_event, complete_whatsapp_event
from database.whatsapp_outbox_poll import (
    poll_whatsapp_delivery_outbox as get_next_whatsapp_delivery_outbox_id,
)
from observability import configure_logging, emit_operational_alert, init_sentry
from operational_health import report_whatsapp_operational_health
from settings import get_settings
from whatsapp_sender import dispatch_whatsapp_outbox
from whatsapp_webhook.models import InboundMessageEvent, MessageStatusEvent
from whatsapp_webhook.runtime import process_inbound_message, process_status_event

logger = logging.getLogger(__name__)
_RETRY_SECONDS = 60
_WORKER_HEARTBEAT_INTERVAL_SECONDS = 30.0
_OPERATIONAL_HEALTH_INTERVAL_SECONDS = 60.0


def _event_from_row(row: dict[str, Any]) -> InboundMessageEvent | MessageStatusEvent | None:
    payload = row.get("payload")
    phone_number_id = row.get("phone_number_id")
    if not isinstance(payload, dict) or not isinstance(phone_number_id, str):
        return None
    if row.get("event_type") == "inbound_message":
        required = ("message_id", "sender_id", "message_type")
        if not all(isinstance(payload.get(key), str) and payload[key] for key in required):
            return None
        return InboundMessageEvent(
            phone_number_id,
            payload["message_id"],
            payload["sender_id"],
            payload.get("timestamp"),
            payload["message_type"],
            payload.get("text"),
            payload.get("contact_name"),
            payload.get("media_id"),
        )
    if row.get("event_type") == "message_status":
        if not isinstance(payload.get("message_id"), str) or not isinstance(payload.get("status"), str):
            return None
        codes = payload.get("error_codes", [])
        if not isinstance(codes, list) or not all(isinstance(code, str) for code in codes):
            return None
        return MessageStatusEvent(
            phone_number_id,
            payload["message_id"],
            payload["status"],
            payload.get("timestamp"),
            payload.get("recipient_id"),
            tuple(codes),
        )
    return None


def _complete_claim(
    *,
    event_id: int,
    worker_id: str,
    claim_version: int,
    outcome: str,
    error_code: str | None = None,
    retry_at: str | None = None,
) -> dict[str, Any]:
    result = complete_whatsapp_event(
        event_id,
        worker_id=worker_id,
        claim_version=claim_version,
        outcome=outcome,
        error_code=error_code,
        retry_at=retry_at,
    )
    if result.get("durum") == "çakışma":
        reason = str(result.get("reason_code") or "claim_conflict")
        logger.warning(
            "WhatsApp inbox completion stale lease nedeniyle bastırıldı: event_id=%s reason=%s",
            event_id,
            reason,
        )
        emit_operational_alert(
            "worker_claim_lost",
            severity="warning",
            message="WhatsApp worker completion sırasında queue lease kaybetti.",
            details={"event_id": event_id, "reason_code": reason},
        )
    elif result.get("durum") != "başarılı":
        logger.error("WhatsApp inbox completion başarısız: event_id=%s", event_id)
        emit_operational_alert(
            "worker_completion_failed",
            severity="error",
            message="WhatsApp worker queue completion kaydını tamamlayamadı.",
            details={"event_id": event_id},
        )
    return result


def process_one(worker_id: str) -> bool:
    claimed = claim_next_whatsapp_event(worker_id)
    if claimed.get("durum") == "boş":
        return False
    if claimed.get("durum") != "başarılı" or not isinstance(claimed.get("event"), dict):
        logger.error("WhatsApp inbox claim başarısız")
        emit_operational_alert(
            "worker_claim_failed",
            severity="error",
            message="WhatsApp worker inbound event claim edemedi.",
        )
        return False

    row = claimed["event"]
    event_id = row.get("id")
    claim_version = row.get("claim_version")
    if (
        not isinstance(event_id, int)
        or isinstance(event_id, bool)
        or event_id <= 0
        or not isinstance(claim_version, int)
        or isinstance(claim_version, bool)
        or claim_version <= 0
    ):
        logger.error("WhatsApp inbox claim fencing bilgisi geçersiz")
        emit_operational_alert(
            "worker_claim_fencing_invalid",
            severity="error",
            message="WhatsApp worker geçersiz claim fencing bilgisi aldı.",
        )
        return True

    event = _event_from_row(row)
    if event is None:
        emit_operational_alert(
            "worker_invalid_queued_event",
            severity="warning",
            message="WhatsApp worker geçersiz queue payload aldı.",
            details={"event_id": event_id},
        )
        _complete_claim(
            event_id=event_id,
            worker_id=worker_id,
            claim_version=claim_version,
            outcome="FAILED",
            error_code="invalid_queued_event",
        )
        return True

    runtime_kwargs = {
        "worker_event_id": event_id,
        "worker_id": worker_id,
        "claim_version": claim_version,
    }
    result = (
        process_inbound_message(event, **runtime_kwargs)
        if isinstance(event, InboundMessageEvent)
        else process_status_event(event, **runtime_kwargs)
    )
    if result.get("durum") == "başarılı":
        _complete_claim(
            event_id=event_id,
            worker_id=worker_id,
            claim_version=claim_version,
            outcome="PROCESSED",
        )
    else:
        reason = str(result.get("reason_code") or "processing_failed")[:64]
        emit_operational_alert(
            "worker_processing_retry",
            severity="warning",
            message="WhatsApp worker event işlemesini retry'a bıraktı.",
            details={"event_id": event_id, "reason_code": reason},
        )
        retry_at = (
            datetime.now(timezone.utc) + timedelta(seconds=_RETRY_SECONDS)
        ).isoformat()
        _complete_claim(
            event_id=event_id,
            worker_id=worker_id,
            claim_version=claim_version,
            outcome="RETRY",
            error_code=reason,
            retry_at=retry_at,
        )
    return True


def process_one_outbound() -> bool:
    """Recover stale sends and discover one due outbox row in one DB poll."""
    settings = get_settings()
    if not settings.whatsapp_send_enabled:
        return False

    candidate = get_next_whatsapp_delivery_outbox_id()
    recovered_count = candidate.get("recovered_stale_count", 0)
    if (
        not isinstance(recovered_count, int)
        or isinstance(recovered_count, bool)
        or recovered_count < 0
    ):
        logger.error("WhatsApp stale outbox recovery sayacı geçersiz")
        emit_operational_alert(
            "outbox_recovery_invalid",
            severity="error",
            message="WhatsApp stale outbox recovery geçersiz sayaç döndürdü.",
        )
        return False
    if recovered_count > 0:
        logger.warning(
            "WhatsApp stale SENDING kayıtları UNKNOWN durumuna alındı: count=%s",
            recovered_count,
        )
        emit_operational_alert(
            "outbox_stale_recovered",
            severity="warning",
            message="WhatsApp stale SENDING kayıtları UNKNOWN durumuna alındı.",
            details={"recovered_count": recovered_count},
        )

    if candidate.get("durum") == "boş":
        return recovered_count > 0
    outbox_id = candidate.get("outbox_id")
    if candidate.get("durum") != "başarılı" or not isinstance(outbox_id, int):
        logger.error("WhatsApp outbox discovery başarısız")
        emit_operational_alert(
            "outbox_discovery_failed",
            severity="error",
            message="WhatsApp worker outbound outbox adayı bulamadı.",
        )
        return False

    result = dispatch_whatsapp_outbox(outbox_id, current_settings=settings)
    if result.get("durum") == "hata":
        reason = str(result.get("reason_code") or "dispatch_failed")[:128]
        logger.error(
            "WhatsApp outbox dispatch başarısız: reason_code=%s",
            reason,
        )
        emit_operational_alert(
            "outbox_dispatch_failed",
            severity="error",
            message="WhatsApp outbound dispatch başarısız oldu.",
            details={"outbox_id": outbox_id, "reason_code": reason},
        )
    elif result.get("delivery_state") == "UNKNOWN":
        emit_operational_alert(
            "outbox_delivery_unknown",
            severity="warning",
            message="WhatsApp outbound teslimat sonucu belirsiz; manuel inceleme gerekli.",
            details={"outbox_id": outbox_id},
        )
    elif result.get("retry_scheduled") is True:
        emit_operational_alert(
            "outbox_retry_scheduled",
            severity="warning",
            message="WhatsApp outbound gönderimi retry'a alındı.",
            details={"outbox_id": outbox_id},
        )
    return True


def _record_heartbeat(worker_id: str) -> bool:
    result = record_whatsapp_worker_heartbeat(worker_id)
    if result.get("durum") == "başarılı":
        return True
    emit_operational_alert(
        "worker_heartbeat_write_failed",
        severity="error",
        message="WhatsApp worker heartbeat kaydını yazamadı.",
    )
    return False


def main() -> None:
    settings = get_settings()
    configure_logging(settings)
    init_sentry(settings)
    worker_id = os.getenv("WHATSAPP_WORKER_ID", f"{socket.gethostname()}-{os.getpid()}")
    last_heartbeat = 0.0
    last_health_check = 0.0
    logger.info("WhatsApp worker başladı: worker_id=%s", worker_id)

    while True:
        now = time.monotonic()
        if now - last_heartbeat >= _WORKER_HEARTBEAT_INTERVAL_SECONDS:
            _record_heartbeat(worker_id)
            last_heartbeat = now
        if now - last_health_check >= _OPERATIONAL_HEALTH_INTERVAL_SECONDS:
            report_whatsapp_operational_health(require_worker_heartbeat=True)
            last_health_check = now

        inbound_worked = process_one(worker_id)
        outbound_worked = process_one_outbound()
        if not inbound_worked and not outbound_worked:
            time.sleep(1)


if __name__ == "__main__":
    main()

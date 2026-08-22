from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from database.operational_health import get_whatsapp_operational_health


@dataclass(frozen=True)
class OperationalAlert:
    code: str
    severity: str
    message: str
    details: dict[str, int]


_QUEUE_PENDING_WARN_SECONDS = 120
_QUEUE_PENDING_WARN_COUNT = 25
_PROCESSING_WARN_SECONDS = 240
_PROCESSING_CRITICAL_SECONDS = 360
_OUTBOX_PENDING_WARN_SECONDS = 120
_OUTBOX_PENDING_WARN_COUNT = 25
_SENDING_WARN_SECONDS = 45
_SENDING_CRITICAL_SECONDS = 75
_RECLAIM_WARN_COUNT = 3


def _alert(
    code: str,
    severity: str,
    message: str,
    **details: int,
) -> OperationalAlert:
    return OperationalAlert(code, severity, message, details)


def classify_whatsapp_operational_health(
    snapshot: dict[str, Any],
) -> list[OperationalAlert]:
    if snapshot.get("durum") != "başarılı":
        return [
            _alert(
                "ops_health_unavailable",
                "error",
                "WhatsApp operasyon sağlık snapshot'ı okunamadı.",
            )
        ]

    inbound = snapshot.get("inbound")
    outbox = snapshot.get("outbox")
    if not isinstance(inbound, dict) or not isinstance(outbox, dict):
        return [
            _alert(
                "ops_health_invalid",
                "error",
                "WhatsApp operasyon sağlık snapshot'ı geçersiz.",
            )
        ]

    alerts: list[OperationalAlert] = []
    pending_count = inbound["due_pending_count"]
    pending_age = inbound["oldest_due_pending_seconds"]
    if pending_count >= _QUEUE_PENDING_WARN_COUNT or pending_age >= _QUEUE_PENDING_WARN_SECONDS:
        alerts.append(
            _alert(
                "inbound_backlog",
                "warning",
                "WhatsApp inbound kuyruğunda backlog oluştu.",
                due_pending_count=pending_count,
                oldest_due_pending_seconds=pending_age,
            )
        )

    processing_age = inbound["oldest_processing_seconds"]
    if processing_age >= _PROCESSING_CRITICAL_SECONDS:
        alerts.append(
            _alert(
                "inbound_processing_stuck",
                "error",
                "WhatsApp inbound PROCESSING kaydı reclaim eşiğini aştı.",
                processing_count=inbound["processing_count"],
                oldest_processing_seconds=processing_age,
            )
        )
    elif processing_age >= _PROCESSING_WARN_SECONDS:
        alerts.append(
            _alert(
                "inbound_processing_slow",
                "warning",
                "WhatsApp inbound PROCESSING kaydı lease eşiğine yaklaşıyor.",
                processing_count=inbound["processing_count"],
                oldest_processing_seconds=processing_age,
            )
        )

    if inbound["failed_recent_15m"] > 0:
        alerts.append(
            _alert(
                "inbound_failures_recent",
                "warning",
                "Son 15 dakikada WhatsApp inbound FAILED kayıtları oluştu.",
                failed_recent_15m=inbound["failed_recent_15m"],
            )
        )
    if inbound["reclaimed_recent_15m"] >= _RECLAIM_WARN_COUNT:
        alerts.append(
            _alert(
                "inbound_reclaims_high",
                "warning",
                "WhatsApp inbound reclaim sayısı yükseldi.",
                reclaimed_recent_15m=inbound["reclaimed_recent_15m"],
            )
        )

    outbox_pending_count = outbox["due_pending_count"]
    outbox_pending_age = outbox["oldest_due_pending_seconds"]
    if (
        outbox_pending_count >= _OUTBOX_PENDING_WARN_COUNT
        or outbox_pending_age >= _OUTBOX_PENDING_WARN_SECONDS
    ):
        alerts.append(
            _alert(
                "outbox_backlog",
                "warning",
                "WhatsApp outbound outbox backlog oluştu.",
                due_pending_count=outbox_pending_count,
                oldest_due_pending_seconds=outbox_pending_age,
            )
        )

    sending_age = outbox["oldest_sending_seconds"]
    if sending_age >= _SENDING_CRITICAL_SECONDS:
        alerts.append(
            _alert(
                "outbox_sending_stuck",
                "error",
                "WhatsApp outbound SENDING kaydı stale recovery eşiğini aştı.",
                sending_count=outbox["sending_count"],
                oldest_sending_seconds=sending_age,
            )
        )
    elif sending_age >= _SENDING_WARN_SECONDS:
        alerts.append(
            _alert(
                "outbox_sending_slow",
                "warning",
                "WhatsApp outbound SENDING kaydı stale eşiğine yaklaşıyor.",
                sending_count=outbox["sending_count"],
                oldest_sending_seconds=sending_age,
            )
        )

    if outbox["failed_recent_15m"] > 0:
        alerts.append(
            _alert(
                "outbox_failures_recent",
                "warning",
                "Son 15 dakikada WhatsApp outbound FAILED kayıtları oluştu.",
                failed_recent_15m=outbox["failed_recent_15m"],
            )
        )
    if outbox["unknown_recent_15m"] > 0:
        alerts.append(
            _alert(
                "outbox_unknown_recent",
                "warning",
                "WhatsApp outbound UNKNOWN teslimatlar manuel inceleme gerektiriyor.",
                unknown_recent_15m=outbox["unknown_recent_15m"],
                unknown_total=outbox["unknown_total"],
            )
        )

    return alerts


def check_whatsapp_operational_health() -> dict[str, Any]:
    snapshot = get_whatsapp_operational_health()
    alerts = classify_whatsapp_operational_health(snapshot)
    severity_rank = {"warning": 1, "error": 2}
    worst = max((severity_rank.get(item.severity, 0) for item in alerts), default=0)
    status = "critical" if worst >= 2 else "degraded" if worst == 1 else "healthy"
    return {
        "durum": "başarılı" if snapshot.get("durum") == "başarılı" else "hata",
        "status": status,
        "snapshot": snapshot,
        "alerts": alerts,
    }

from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload


def get_supabase():
    import database

    return database.get_supabase()


def get_whatsapp_operational_health() -> dict[str, Any]:
    """Read the aggregate WhatsApp queue/outbox health snapshot."""
    try:
        result = get_supabase().rpc(
            "get_whatsapp_operational_health",
            {},
        ).execute()
    except Exception:
        return {"durum": "hata", "reason_code": "ops_health_rpc_failed"}

    payload = _extract_rpc_payload(result.data)
    if payload is None or payload.get("status") != "success":
        return {"durum": "hata", "reason_code": "ops_health_invalid_response"}

    inbound = payload.get("inbound")
    outbox = payload.get("outbox")
    if not isinstance(inbound, dict) or not isinstance(outbox, dict):
        return {"durum": "hata", "reason_code": "ops_health_invalid_response"}

    metric_names = (
        "due_pending_count",
        "oldest_due_pending_seconds",
    )
    inbound_names = metric_names + (
        "processing_count",
        "oldest_processing_seconds",
        "failed_recent_15m",
        "reclaimed_recent_15m",
    )
    outbox_names = metric_names + (
        "sending_count",
        "oldest_sending_seconds",
        "failed_recent_15m",
        "unknown_total",
        "unknown_recent_15m",
        "suppressed_recent_15m",
    )
    for section, names in ((inbound, inbound_names), (outbox, outbox_names)):
        for name in names:
            value = section.get(name)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                return {"durum": "hata", "reason_code": "ops_health_invalid_metric"}

    return {
        "durum": "başarılı",
        "generated_at": payload.get("generated_at"),
        "inbound": inbound,
        "outbox": outbox,
    }

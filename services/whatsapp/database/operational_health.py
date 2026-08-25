from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload


def get_supabase():
    import database

    return database.get_supabase()


def record_whatsapp_worker_heartbeat(worker_id: str) -> dict[str, Any]:
    normalized = worker_id.strip() if isinstance(worker_id, str) else ""
    if not normalized or len(normalized) > 120:
        return {"durum": "doğrulama_hatası", "reason_code": "invalid_worker_id"}
    try:
        result = get_supabase().rpc(
            "record_whatsapp_worker_heartbeat",
            {"worker_id_value": normalized},
        ).execute()
    except Exception:
        return {"durum": "hata", "reason_code": "worker_heartbeat_rpc_failed"}

    payload = _extract_rpc_payload(result.data)
    if (
        payload is None
        or payload.get("status") != "success"
        or payload.get("worker_id") != normalized
    ):
        return {"durum": "hata", "reason_code": "worker_heartbeat_invalid_response"}
    return {
        "durum": "başarılı",
        "worker_id": normalized,
        "last_seen_at": payload.get("last_seen_at"),
    }


def get_whatsapp_operational_health() -> dict[str, Any]:
    """Read aggregate WhatsApp queue/outbox/worker health metrics."""
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
    worker = payload.get("worker")
    if (
        not isinstance(inbound, dict)
        or not isinstance(outbox, dict)
        or not isinstance(worker, dict)
    ):
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
    worker_names = (
        "recent_heartbeat_count",
        "last_heartbeat_age_seconds",
    )
    for section, names in (
        (inbound, inbound_names),
        (outbox, outbox_names),
        (worker, worker_names),
    ):
        for name in names:
            value = section.get(name)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                return {"durum": "hata", "reason_code": "ops_health_invalid_metric"}

    return {
        "durum": "başarılı",
        "generated_at": payload.get("generated_at"),
        "inbound": inbound,
        "outbox": outbox,
        "worker": worker,
    }

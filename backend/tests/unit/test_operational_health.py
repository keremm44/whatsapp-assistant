from __future__ import annotations

from typing import Any

import operational_health as ops


def _snapshot(**overrides: Any) -> dict[str, Any]:
    inbound = {
        "due_pending_count": 0,
        "oldest_due_pending_seconds": 0,
        "processing_count": 0,
        "oldest_processing_seconds": 0,
        "failed_recent_15m": 0,
        "reclaimed_recent_15m": 0,
    }
    outbox = {
        "due_pending_count": 0,
        "oldest_due_pending_seconds": 0,
        "sending_count": 0,
        "oldest_sending_seconds": 0,
        "failed_recent_15m": 0,
        "unknown_total": 0,
        "unknown_recent_15m": 0,
        "suppressed_recent_15m": 0,
    }
    worker = {
        "recent_heartbeat_count": 1,
        "last_heartbeat_age_seconds": 10,
    }
    inbound.update(overrides.pop("inbound", {}))
    outbox.update(overrides.pop("outbox", {}))
    worker.update(overrides.pop("worker", {}))
    return {
        "durum": "başarılı",
        "inbound": inbound,
        "outbox": outbox,
        "worker": worker,
        **overrides,
    }


def test_healthy_snapshot_has_no_alerts() -> None:
    assert ops.classify_whatsapp_operational_health(_snapshot()) == []


def test_missing_required_worker_heartbeat_is_critical() -> None:
    alerts = ops.classify_whatsapp_operational_health(
        _snapshot(worker={"recent_heartbeat_count": 0, "last_heartbeat_age_seconds": 181}),
        require_worker_heartbeat=True,
    )
    assert [alert.code for alert in alerts] == ["worker_heartbeat_missing"]
    assert alerts[0].severity == "error"


def test_missing_heartbeat_is_ignored_when_runtime_not_required() -> None:
    alerts = ops.classify_whatsapp_operational_health(
        _snapshot(worker={"recent_heartbeat_count": 0, "last_heartbeat_age_seconds": 0}),
        require_worker_heartbeat=False,
    )
    assert alerts == []


def test_processing_over_reclaim_window_is_critical() -> None:
    alerts = ops.classify_whatsapp_operational_health(
        _snapshot(inbound={"processing_count": 2, "oldest_processing_seconds": 361})
    )
    assert [alert.code for alert in alerts] == ["inbound_processing_stuck"]
    assert alerts[0].severity == "error"


def test_outbox_unknown_and_recent_failure_are_visible() -> None:
    alerts = ops.classify_whatsapp_operational_health(
        _snapshot(
            outbox={
                "failed_recent_15m": 2,
                "unknown_recent_15m": 1,
                "unknown_total": 3,
            }
        )
    )
    assert {alert.code for alert in alerts} == {
        "outbox_failures_recent",
        "outbox_unknown_outstanding",
    }


def test_old_unknown_remains_visible_until_manually_resolved() -> None:
    alerts = ops.classify_whatsapp_operational_health(
        _snapshot(outbox={"unknown_recent_15m": 0, "unknown_total": 1})
    )
    assert [alert.code for alert in alerts] == ["outbox_unknown_outstanding"]


def test_health_reader_failure_is_critical(monkeypatch) -> None:
    monkeypatch.setattr(
        ops,
        "get_whatsapp_operational_health",
        lambda: {"durum": "hata", "reason_code": "ops_health_rpc_failed"},
    )
    result = ops.check_whatsapp_operational_health()
    assert result["status"] == "critical"
    assert result["durum"] == "hata"
    assert result["alerts"][0].code == "ops_health_unavailable"


def test_report_emits_only_classified_alerts(monkeypatch) -> None:
    calls: list[tuple[str, str, dict[str, int]]] = []
    monkeypatch.setattr(
        ops,
        "get_whatsapp_operational_health",
        lambda: _snapshot(inbound={"failed_recent_15m": 2}),
    )
    monkeypatch.setattr(
        ops,
        "emit_operational_alert",
        lambda code, *, severity, message, details: calls.append(
            (code, severity, details)
        ),
    )

    result = ops.report_whatsapp_operational_health()

    assert result["status"] == "degraded"
    assert calls == [("inbound_failures_recent", "warning", {"failed_recent_15m": 2})]

from pathlib import Path

import workers.whatsapp_worker as worker


def test_worker_heartbeat_success_is_silent(monkeypatch) -> None:
    alerts: list[str] = []
    monkeypatch.setattr(
        worker,
        "record_whatsapp_worker_heartbeat",
        lambda worker_id: {"durum": "başarılı", "worker_id": worker_id},
    )
    monkeypatch.setattr(
        worker,
        "emit_operational_alert",
        lambda code, **kwargs: alerts.append(code),
    )

    assert worker._record_heartbeat("worker-a") is True
    assert alerts == []


def test_worker_heartbeat_failure_emits_error(monkeypatch) -> None:
    alerts: list[tuple[str, str]] = []
    monkeypatch.setattr(
        worker,
        "record_whatsapp_worker_heartbeat",
        lambda worker_id: {"durum": "hata"},
    )
    monkeypatch.setattr(
        worker,
        "emit_operational_alert",
        lambda code, *, severity, message, **kwargs: alerts.append((code, severity)),
    )

    assert worker._record_heartbeat("worker-a") is False
    assert alerts == [("worker_heartbeat_write_failed", "error")]


def test_worker_main_wires_sentry_heartbeat_and_health_loop() -> None:
    source = Path("workers/whatsapp_worker.py").read_text(encoding="utf-8")
    assert "init_sentry(settings)" in source
    assert "_WORKER_HEARTBEAT_INTERVAL_SECONDS = 30.0" in source
    assert "_OPERATIONAL_HEALTH_INTERVAL_SECONDS = 60.0" in source
    assert "_record_heartbeat(worker_id)" in source
    assert "report_whatsapp_operational_health(require_worker_heartbeat=True)" in source

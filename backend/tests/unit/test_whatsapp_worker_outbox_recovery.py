from __future__ import annotations

import logging

import workers.whatsapp_worker as worker


def _settings() -> object:
    return type("Settings", (), {"whatsapp_send_enabled": True})()


def test_outbound_worker_recovers_before_discovery_and_dispatch(monkeypatch) -> None:
    calls: list[object] = []
    settings = _settings()
    monkeypatch.setattr(worker, "get_settings", lambda: settings)
    monkeypatch.setattr(
        worker,
        "recover_stale_whatsapp_delivery_outbox",
        lambda: calls.append("recover") or {"durum": "başarılı", "recovered_count": 0},
    )
    monkeypatch.setattr(
        worker,
        "get_next_whatsapp_delivery_outbox_id",
        lambda: calls.append("discover") or {"durum": "başarılı", "outbox_id": 91},
    )
    monkeypatch.setattr(
        worker,
        "dispatch_whatsapp_outbox",
        lambda outbox_id, current_settings: calls.append(
            ("dispatch", outbox_id, current_settings)
        )
        or {"durum": "başarılı", "delivery_state": "SENT"},
    )

    assert worker.process_one_outbound() is True
    assert calls == ["recover", "discover", ("dispatch", 91, settings)]


def test_outbound_worker_fails_closed_when_recovery_fails(monkeypatch) -> None:
    monkeypatch.setattr(worker, "get_settings", _settings)
    monkeypatch.setattr(
        worker,
        "recover_stale_whatsapp_delivery_outbox",
        lambda: {"durum": "hata"},
    )
    monkeypatch.setattr(
        worker,
        "get_next_whatsapp_delivery_outbox_id",
        lambda: (_ for _ in ()).throw(AssertionError("discovery must not run")),
    )
    monkeypatch.setattr(
        worker,
        "dispatch_whatsapp_outbox",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("dispatch must not run")
        ),
    )

    assert worker.process_one_outbound() is False


def test_outbound_worker_reports_recovery_work_even_when_pending_queue_empty(
    monkeypatch,
    caplog,
) -> None:
    monkeypatch.setattr(worker, "get_settings", _settings)
    monkeypatch.setattr(
        worker,
        "recover_stale_whatsapp_delivery_outbox",
        lambda: {"durum": "başarılı", "recovered_count": 2},
    )
    monkeypatch.setattr(
        worker,
        "get_next_whatsapp_delivery_outbox_id",
        lambda: {"durum": "boş"},
    )

    with caplog.at_level(logging.WARNING):
        assert worker.process_one_outbound() is True

    assert "UNKNOWN" in caplog.text
    assert "count=2" in caplog.text


def test_outbound_worker_does_not_recover_when_sending_disabled(monkeypatch) -> None:
    monkeypatch.setattr(
        worker,
        "get_settings",
        lambda: type("Settings", (), {"whatsapp_send_enabled": False})(),
    )
    monkeypatch.setattr(
        worker,
        "recover_stale_whatsapp_delivery_outbox",
        lambda: (_ for _ in ()).throw(AssertionError("recovery must not run")),
    )

    assert worker.process_one_outbound() is False

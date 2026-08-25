from __future__ import annotations

import logging

import workers.whatsapp_worker as worker


def _settings() -> object:
    return type("Settings", (), {"whatsapp_send_enabled": True})()


def test_outbound_worker_uses_one_combined_poll_before_dispatch(monkeypatch) -> None:
    calls: list[object] = []
    settings = _settings()
    monkeypatch.setattr(worker, "get_settings", lambda: settings)
    monkeypatch.setattr(
        worker,
        "get_next_whatsapp_delivery_outbox_id",
        lambda: calls.append("poll")
        or {
            "durum": "başarılı",
            "outbox_id": 91,
            "recovered_stale_count": 0,
        },
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
    assert calls == ["poll", ("dispatch", 91, settings)]


def test_outbound_worker_fails_closed_when_combined_poll_fails(monkeypatch) -> None:
    monkeypatch.setattr(worker, "get_settings", _settings)
    monkeypatch.setattr(
        worker,
        "get_next_whatsapp_delivery_outbox_id",
        lambda: {"durum": "hata"},
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
        "get_next_whatsapp_delivery_outbox_id",
        lambda: {"durum": "boş", "recovered_stale_count": 2},
    )

    with caplog.at_level(logging.WARNING):
        assert worker.process_one_outbound() is True

    assert "UNKNOWN" in caplog.text
    assert "count=2" in caplog.text


def test_outbound_worker_rejects_invalid_recovery_count(monkeypatch) -> None:
    monkeypatch.setattr(worker, "get_settings", _settings)
    monkeypatch.setattr(
        worker,
        "get_next_whatsapp_delivery_outbox_id",
        lambda: {
            "durum": "başarılı",
            "outbox_id": 91,
            "recovered_stale_count": -1,
        },
    )
    monkeypatch.setattr(
        worker,
        "dispatch_whatsapp_outbox",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("dispatch must not run")
        ),
    )

    assert worker.process_one_outbound() is False


def test_outbound_worker_does_not_poll_when_sending_disabled(monkeypatch) -> None:
    monkeypatch.setattr(
        worker,
        "get_settings",
        lambda: type("Settings", (), {"whatsapp_send_enabled": False})(),
    )
    monkeypatch.setattr(
        worker,
        "get_next_whatsapp_delivery_outbox_id",
        lambda: (_ for _ in ()).throw(AssertionError("poll must not run")),
    )

    assert worker.process_one_outbound() is False

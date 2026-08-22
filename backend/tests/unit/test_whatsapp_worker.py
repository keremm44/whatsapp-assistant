from __future__ import annotations

import logging
from typing import Any

import workers.whatsapp_worker as worker


def _row(event_type: str = "inbound_message") -> dict[str, Any]:
    return {
        "id": 17,
        "event_type": event_type,
        "phone_number_id": "12345",
        "claim_version": 3,
        "claimed_by": "worker-a",
        "payload": {
            "message_id": "wamid.1",
            "sender_id": "905551112233",
            "message_type": "text",
            "text": "Merhaba",
            "timestamp": "1",
            "contact_name": None,
            "media_id": None,
        },
    }


def test_worker_claim_migration_uses_skip_locked_and_recovers_stale_claims() -> None:
    from pathlib import Path

    sql = Path("migrations/039_add_whatsapp_inbound_worker_claims.sql").read_text(
        encoding="utf-8"
    )
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "INTERVAL '5 minutes'" in sql
    assert "claim_next_whatsapp_inbound_event" in sql
    assert "complete_whatsapp_inbound_event" in sql
    assert "SET search_path = pg_catalog, public" in sql
    assert "FROM PUBLIC, anon, authenticated" in sql


def test_outbound_poll_migration_only_returns_due_pending_rows() -> None:
    from pathlib import Path

    sql = Path("migrations/040_add_whatsapp_outbound_dispatch_poll.sql").read_text(
        encoding="utf-8"
    )
    assert "next_whatsapp_delivery_outbox_id" in sql
    assert "o.status = 'PENDING'" in sql
    assert "o.next_attempt_at <= NOW()" in sql
    assert "SET search_path = pg_catalog, public" in sql
    assert "FROM PUBLIC, anon, authenticated" in sql


def test_worker_claims_processes_and_completes_successfully(monkeypatch) -> None:
    calls: list[tuple[str, Any]] = []
    runtime_calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        worker,
        "claim_next_whatsapp_event",
        lambda worker_id: {"durum": "başarılı", "event": _row()},
    )

    def _process(event: Any, **kwargs: Any) -> dict[str, Any]:
        runtime_calls.append(kwargs)
        return {"durum": "başarılı"}

    monkeypatch.setattr(worker, "process_inbound_message", _process)
    monkeypatch.setattr(
        worker,
        "complete_whatsapp_event",
        lambda event_id, **kwargs: calls.append(("complete", event_id, kwargs))
        or {"durum": "başarılı"},
    )

    assert worker.process_one("worker-a") is True
    assert runtime_calls == [
        {"worker_event_id": 17, "worker_id": "worker-a", "claim_version": 3}
    ]
    assert calls == [
        (
            "complete",
            17,
            {
                "worker_id": "worker-a",
                "claim_version": 3,
                "outcome": "PROCESSED",
                "error_code": None,
                "retry_at": None,
            },
        )
    ]


def test_worker_schedules_retry_for_safe_inbound_processing_failure(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        worker,
        "claim_next_whatsapp_event",
        lambda worker_id: {"durum": "başarılı", "event": _row()},
    )
    monkeypatch.setattr(
        worker,
        "process_inbound_message",
        lambda event, **kwargs: {"durum": "hata", "reason_code": "whatsapp_database_unavailable"},
    )
    monkeypatch.setattr(
        worker,
        "complete_whatsapp_event",
        lambda event_id, **kwargs: calls.append(kwargs) or {"durum": "başarılı"},
    )

    assert worker.process_one("worker-a") is True
    assert calls[0]["worker_id"] == "worker-a"
    assert calls[0]["claim_version"] == 3
    assert calls[0]["outcome"] == "RETRY"
    assert calls[0]["error_code"] == "whatsapp_database_unavailable"
    assert isinstance(calls[0]["retry_at"], str)


def test_worker_marks_invalid_queued_payload_failed_with_same_lease(monkeypatch) -> None:
    row = _row()
    row["payload"] = {"message_id": "wamid.1"}
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        worker,
        "claim_next_whatsapp_event",
        lambda worker_id: {"durum": "başarılı", "event": row},
    )
    monkeypatch.setattr(
        worker,
        "process_inbound_message",
        lambda event, **kwargs: (_ for _ in ()).throw(AssertionError("must not run")),
    )
    monkeypatch.setattr(
        worker,
        "complete_whatsapp_event",
        lambda event_id, **kwargs: calls.append(kwargs) or {"durum": "başarılı"},
    )

    assert worker.process_one("worker-a") is True
    assert calls == [
        {
            "worker_id": "worker-a",
            "claim_version": 3,
            "outcome": "FAILED",
            "error_code": "invalid_queued_event",
            "retry_at": None,
        }
    ]


def test_worker_refuses_claim_without_fencing_token(monkeypatch) -> None:
    row = _row()
    row.pop("claim_version")
    monkeypatch.setattr(
        worker,
        "claim_next_whatsapp_event",
        lambda worker_id: {"durum": "başarılı", "event": row},
    )
    monkeypatch.setattr(
        worker,
        "process_inbound_message",
        lambda event, **kwargs: (_ for _ in ()).throw(AssertionError("must not run")),
    )
    monkeypatch.setattr(
        worker,
        "complete_whatsapp_event",
        lambda event_id, **kwargs: (_ for _ in ()).throw(AssertionError("must not complete")),
    )

    assert worker.process_one("worker-a") is True


def test_worker_logs_stale_completion_without_retrying_completion(monkeypatch, caplog) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        worker,
        "claim_next_whatsapp_event",
        lambda worker_id: {"durum": "başarılı", "event": _row()},
    )
    monkeypatch.setattr(
        worker,
        "process_inbound_message",
        lambda event, **kwargs: {"durum": "başarılı"},
    )

    def _complete(event_id: int, **kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs)
        return {"durum": "çakışma", "reason_code": "claim_lost"}

    monkeypatch.setattr(worker, "complete_whatsapp_event", _complete)

    with caplog.at_level(logging.WARNING):
        assert worker.process_one("worker-a") is True

    assert len(calls) == 1
    assert "stale lease" in caplog.text
    assert "claim_lost" in caplog.text


def test_outbound_worker_is_idle_when_sending_is_disabled(monkeypatch) -> None:
    monkeypatch.setattr(
        worker,
        "get_settings",
        lambda: type("Settings", (), {"whatsapp_send_enabled": False})(),
    )
    monkeypatch.setattr(
        worker,
        "get_next_whatsapp_delivery_outbox_id",
        lambda: (_ for _ in ()).throw(AssertionError("DB must not run")),
    )

    assert worker.process_one_outbound() is False


def test_outbound_worker_discovers_then_uses_existing_atomic_dispatch(monkeypatch) -> None:
    settings = type("Settings", (), {"whatsapp_send_enabled": True})()
    calls: list[tuple[int, object]] = []
    monkeypatch.setattr(worker, "get_settings", lambda: settings)
    monkeypatch.setattr(
        worker,
        "get_next_whatsapp_delivery_outbox_id",
        lambda: {"durum": "başarılı", "outbox_id": 91},
    )
    monkeypatch.setattr(
        worker,
        "dispatch_whatsapp_outbox",
        lambda outbox_id, current_settings: calls.append((outbox_id, current_settings))
        or {"durum": "başarılı", "delivery_state": "SENT"},
    )

    assert worker.process_one_outbound() is True
    assert calls == [(91, settings)]


def test_worker_stops_cleanly_when_queue_is_empty(monkeypatch) -> None:
    monkeypatch.setattr(
        worker,
        "claim_next_whatsapp_event",
        lambda worker_id: {"durum": "boş"},
    )
    assert worker.process_one("worker-a") is False

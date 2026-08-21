from __future__ import annotations

from typing import Any

import workers.whatsapp_worker as worker


def _row(event_type: str = "inbound_message") -> dict[str, Any]:
    return {
        "id": 17,
        "event_type": event_type,
        "phone_number_id": "12345",
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


def test_worker_claims_processes_and_completes_successfully(monkeypatch) -> None:
    calls: list[tuple[str, Any]] = []
    monkeypatch.setattr(worker, "claim_next_whatsapp_event", lambda worker_id: {"durum": "başarılı", "event": _row()})
    monkeypatch.setattr(worker, "process_inbound_message", lambda event: {"durum": "başarılı"})
    monkeypatch.setattr(worker, "complete_whatsapp_event", lambda event_id, **kwargs: calls.append(("complete", event_id, kwargs)) or {"durum": "başarılı"})

    assert worker.process_one("worker-a") is True
    assert calls == [("complete", 17, {"outcome": "PROCESSED"})]


def test_worker_schedules_retry_for_safe_inbound_processing_failure(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(worker, "claim_next_whatsapp_event", lambda worker_id: {"durum": "başarılı", "event": _row()})
    monkeypatch.setattr(worker, "process_inbound_message", lambda event: {"durum": "hata", "reason_code": "whatsapp_database_unavailable"})
    monkeypatch.setattr(worker, "complete_whatsapp_event", lambda event_id, **kwargs: calls.append(kwargs) or {"durum": "başarılı"})

    assert worker.process_one("worker-a") is True
    assert calls[0]["outcome"] == "RETRY"
    assert calls[0]["error_code"] == "whatsapp_database_unavailable"
    assert isinstance(calls[0]["retry_at"], str)


def test_worker_marks_invalid_queued_payload_failed_without_runtime(monkeypatch) -> None:
    row = _row()
    row["payload"] = {"message_id": "wamid.1"}
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(worker, "claim_next_whatsapp_event", lambda worker_id: {"durum": "başarılı", "event": row})
    monkeypatch.setattr(worker, "process_inbound_message", lambda event: (_ for _ in ()).throw(AssertionError("must not run")))
    monkeypatch.setattr(worker, "complete_whatsapp_event", lambda event_id, **kwargs: calls.append(kwargs) or {"durum": "başarılı"})

    assert worker.process_one("worker-a") is True
    assert calls == [{"outcome": "FAILED", "error_code": "invalid_queued_event"}]


def test_worker_stops_cleanly_when_queue_is_empty(monkeypatch) -> None:
    monkeypatch.setattr(worker, "claim_next_whatsapp_event", lambda worker_id: {"durum": "boş"})
    assert worker.process_one("worker-a") is False

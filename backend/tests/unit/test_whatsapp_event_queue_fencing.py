from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import database.whatsapp_event_queue as queue_db


@dataclass
class _Result:
    data: Any


class _RpcQuery:
    def __init__(self, data: Any) -> None:
        self._data = data

    def execute(self) -> _Result:
        return _Result(self._data)


class _Client:
    def __init__(self, responses: list[Any]) -> None:
        self.responses = list(responses)
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _RpcQuery:
        self.calls.append((name, params))
        if not self.responses:
            raise AssertionError("unexpected rpc call")
        return _RpcQuery(self.responses.pop(0))


def _claimed_event(*, claim_version: int = 4, claimed_by: str = "worker-a") -> dict[str, Any]:
    return {
        "id": 17,
        "event_type": "inbound_message",
        "event_key": "message:wamid.1",
        "phone_number_id": "12345",
        "payload": {"sender_id": "905551112233"},
        "status": "PROCESSING",
        "claim_version": claim_version,
        "claimed_by": claimed_by,
    }


def test_claim_requires_positive_version_and_same_worker(monkeypatch) -> None:
    client = _Client(
        [
            {"status": "success", "event": _claimed_event()},
            {"status": "success", "event": _claimed_event(claim_version=0)},
            {"status": "success", "event": _claimed_event(claimed_by="worker-b")},
        ]
    )
    monkeypatch.setattr(queue_db, "get_supabase", lambda: client)

    success = queue_db.claim_next_whatsapp_event("worker-a")
    invalid_version = queue_db.claim_next_whatsapp_event("worker-a")
    wrong_worker = queue_db.claim_next_whatsapp_event("worker-a")

    assert success["durum"] == "başarılı"
    assert success["event"]["claim_version"] == 4
    assert invalid_version == {"durum": "hata"}
    assert wrong_worker == {"durum": "hata"}


def test_complete_sends_worker_and_claim_version(monkeypatch) -> None:
    client = _Client([{"status": "success", "event": {"id": 17}}])
    monkeypatch.setattr(queue_db, "get_supabase", lambda: client)

    result = queue_db.complete_whatsapp_event(
        17,
        worker_id="worker-a",
        claim_version=4,
        outcome="PROCESSED",
    )

    assert result == {"durum": "başarılı"}
    assert client.calls == [
        (
            "complete_whatsapp_inbound_event",
            {
                "event_id_value": 17,
                "worker_id_value": "worker-a",
                "claim_version_value": 4,
                "outcome_value": "PROCESSED",
                "error_code_value": None,
                "retry_at_value": None,
            },
        )
    ]


def test_complete_maps_lost_lease_to_conflict(monkeypatch) -> None:
    client = _Client([{"status": "conflict", "reason": "claim_lost"}])
    monkeypatch.setattr(queue_db, "get_supabase", lambda: client)

    result = queue_db.complete_whatsapp_event(
        17,
        worker_id="worker-a",
        claim_version=3,
        outcome="PROCESSED",
    )

    assert result == {"durum": "çakışma", "reason_code": "claim_lost"}


def test_complete_rejects_invalid_fencing_without_rpc(monkeypatch) -> None:
    def _unexpected() -> Any:
        raise AssertionError("database must not be called")

    monkeypatch.setattr(queue_db, "get_supabase", _unexpected)

    assert queue_db.complete_whatsapp_event(
        17,
        worker_id="worker-a",
        claim_version=0,
        outcome="PROCESSED",
    ) == {"durum": "doğrulama_hatası"}

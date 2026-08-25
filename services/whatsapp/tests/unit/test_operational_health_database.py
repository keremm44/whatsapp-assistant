from __future__ import annotations

from typing import Any

import database.operational_health as db_ops


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _Rpc:
    def __init__(self, data: Any) -> None:
        self._data = data

    def execute(self) -> _Result:
        return _Result(self._data)


class _Client:
    def __init__(self, responses: dict[str, Any]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _Rpc:
        self.calls.append((name, params))
        return _Rpc(self.responses[name])


def _health_payload() -> dict[str, Any]:
    return {
        "status": "success",
        "generated_at": "2026-08-22T15:00:00+00:00",
        "inbound": {
            "due_pending_count": 0,
            "oldest_due_pending_seconds": 0,
            "processing_count": 0,
            "oldest_processing_seconds": 0,
            "failed_recent_15m": 0,
            "reclaimed_recent_15m": 0,
        },
        "outbox": {
            "due_pending_count": 0,
            "oldest_due_pending_seconds": 0,
            "sending_count": 0,
            "oldest_sending_seconds": 0,
            "failed_recent_15m": 0,
            "unknown_total": 0,
            "unknown_recent_15m": 0,
            "suppressed_recent_15m": 0,
        },
        "worker": {
            "recent_heartbeat_count": 1,
            "last_heartbeat_age_seconds": 12,
        },
    }


def test_health_adapter_validates_all_sections(monkeypatch) -> None:
    client = _Client({"get_whatsapp_operational_health": _health_payload()})
    monkeypatch.setattr(db_ops, "get_supabase", lambda: client)

    result = db_ops.get_whatsapp_operational_health()

    assert result["durum"] == "başarılı"
    assert result["worker"]["recent_heartbeat_count"] == 1
    assert client.calls == [("get_whatsapp_operational_health", {})]


def test_health_adapter_fails_closed_on_invalid_metric(monkeypatch) -> None:
    payload = _health_payload()
    payload["outbox"]["unknown_total"] = -1
    client = _Client({"get_whatsapp_operational_health": payload})
    monkeypatch.setattr(db_ops, "get_supabase", lambda: client)

    assert db_ops.get_whatsapp_operational_health() == {
        "durum": "hata",
        "reason_code": "ops_health_invalid_metric",
    }


def test_heartbeat_adapter_binds_exact_worker_id(monkeypatch) -> None:
    client = _Client(
        {
            "record_whatsapp_worker_heartbeat": {
                "status": "success",
                "worker_id": "worker-a",
                "last_seen_at": "2026-08-22T15:00:00+00:00",
            }
        }
    )
    monkeypatch.setattr(db_ops, "get_supabase", lambda: client)

    result = db_ops.record_whatsapp_worker_heartbeat(" worker-a ")

    assert result["durum"] == "başarılı"
    assert result["worker_id"] == "worker-a"
    assert client.calls == [
        ("record_whatsapp_worker_heartbeat", {"worker_id_value": "worker-a"})
    ]


def test_heartbeat_adapter_rejects_identity_mismatch(monkeypatch) -> None:
    client = _Client(
        {
            "record_whatsapp_worker_heartbeat": {
                "status": "success",
                "worker_id": "worker-b",
                "last_seen_at": "2026-08-22T15:00:00+00:00",
            }
        }
    )
    monkeypatch.setattr(db_ops, "get_supabase", lambda: client)

    assert db_ops.record_whatsapp_worker_heartbeat("worker-a") == {
        "durum": "hata",
        "reason_code": "worker_heartbeat_invalid_response",
    }

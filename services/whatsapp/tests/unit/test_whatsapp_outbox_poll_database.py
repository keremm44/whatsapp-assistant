from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import database.whatsapp_outbox_poll as poll_db


@dataclass
class _Result:
    data: Any


class _Rpc:
    def __init__(self, data: Any, calls: list[tuple[Any, ...]]) -> None:
        self._data = data
        self._calls = calls

    def execute(self) -> _Result:
        self._calls.append(("execute",))
        return _Result(self._data)


class _Client:
    def __init__(self, data: Any) -> None:
        self._data = data
        self.calls: list[tuple[Any, ...]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _Rpc:
        self.calls.append(("rpc", name, params))
        return _Rpc(self._data, self.calls)


def test_combined_poll_returns_candidate_and_recovery_count(monkeypatch) -> None:
    client = _Client(
        {
            "status": "success",
            "outbox_id": 91,
            "recovered_stale_count": 2,
        }
    )
    monkeypatch.setattr(poll_db, "get_supabase", lambda: client)

    result = poll_db.poll_whatsapp_delivery_outbox()

    assert result == {
        "durum": "başarılı",
        "outbox_id": 91,
        "recovered_stale_count": 2,
    }
    assert ("rpc", "next_whatsapp_delivery_outbox_id", {}) in client.calls


def test_combined_poll_preserves_recovery_count_when_queue_empty(monkeypatch) -> None:
    client = _Client(
        {
            "status": "success",
            "outbox_id": None,
            "recovered_stale_count": 3,
        }
    )
    monkeypatch.setattr(poll_db, "get_supabase", lambda: client)

    result = poll_db.poll_whatsapp_delivery_outbox()

    assert result == {"durum": "boş", "recovered_stale_count": 3}


def test_combined_poll_rejects_invalid_recovery_count(monkeypatch) -> None:
    client = _Client(
        {
            "status": "success",
            "outbox_id": 91,
            "recovered_stale_count": -1,
        }
    )
    monkeypatch.setattr(poll_db, "get_supabase", lambda: client)

    assert poll_db.poll_whatsapp_delivery_outbox()["durum"] == "hata"


def test_combined_poll_fails_closed_on_rpc_error(monkeypatch) -> None:
    def _raise() -> Any:
        raise RuntimeError("db unavailable")

    monkeypatch.setattr(poll_db, "get_supabase", _raise)

    assert poll_db.poll_whatsapp_delivery_outbox()["durum"] == "hata"

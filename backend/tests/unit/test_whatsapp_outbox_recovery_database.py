from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import database.whatsapp_outbox_recovery as recovery_db


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


def test_recovery_adapter_calls_backend_rpc_and_returns_count(monkeypatch) -> None:
    client = _Client({"status": "success", "recovered_count": 3})
    monkeypatch.setattr(recovery_db, "get_supabase", lambda: client)

    result = recovery_db.recover_stale_whatsapp_delivery_outbox()

    assert result == {"durum": "başarılı", "recovered_count": 3}
    assert ("rpc", "recover_stale_whatsapp_delivery_outbox", {}) in client.calls


def test_recovery_adapter_accepts_zero_count(monkeypatch) -> None:
    client = _Client({"status": "success", "recovered_count": 0})
    monkeypatch.setattr(recovery_db, "get_supabase", lambda: client)

    assert recovery_db.recover_stale_whatsapp_delivery_outbox() == {
        "durum": "başarılı",
        "recovered_count": 0,
    }


def test_recovery_adapter_rejects_invalid_count(monkeypatch) -> None:
    client = _Client({"status": "success", "recovered_count": -1})
    monkeypatch.setattr(recovery_db, "get_supabase", lambda: client)

    result = recovery_db.recover_stale_whatsapp_delivery_outbox()

    assert result["durum"] == "hata"


def test_recovery_adapter_fails_closed_on_rpc_error(monkeypatch) -> None:
    def _raise() -> Any:
        raise RuntimeError("db unavailable")

    monkeypatch.setattr(recovery_db, "get_supabase", _raise)

    result = recovery_db.recover_stale_whatsapp_delivery_outbox()

    assert result["durum"] == "hata"

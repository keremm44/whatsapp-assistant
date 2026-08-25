from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import database.atomic_conversation_state as atomic_state


@dataclass
class _Result:
    data: Any


class _RpcQuery:
    def __init__(self, data: Any) -> None:
        self._data = data

    def execute(self) -> _Result:
        return _Result(self._data)


class _Client:
    def __init__(self, payload: Any) -> None:
        self.payload = payload
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _RpcQuery:
        self.calls.append((name, params))
        return _RpcQuery(self.payload)


def _state_payload() -> dict[str, Any]:
    return {
        "seller_id": 11,
        "customer_id": 22,
        "current_state": "AWAITING_ORDER_NUMBER",
        "state_type": "soft_lock",
        "state_data": {"order_id": 44},
        "expires_at": "2026-08-23T12:00:00+00:00",
        "state_version": 8,
        "state_last_message_id": 101,
    }


def test_transition_state_uses_atomic_rpc_and_preserves_public_shape(monkeypatch) -> None:
    client = _Client(
        {
            "status": "success",
            "changed": True,
            "state": _state_payload(),
            "transition": {
                "id": 77,
                "previous_state_version": 7,
                "new_state_version": 8,
            },
        }
    )
    monkeypatch.setattr(atomic_state, "get_supabase", lambda: client)
    monkeypatch.setattr(
        atomic_state,
        "utc_now",
        lambda: datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc),
    )

    result = atomic_state.transition_state(
        seller_id=11,
        customer_id=22,
        to_state="AWAITING_ORDER_NUMBER",
        reason_code="user_action",
        trigger_message_id=101,
        state_data={"order_id": 44},
        expires_in_hours=24,
    )

    assert result["durum"] == "başarılı"
    assert result["state"] == {
        "seller_id": 11,
        "customer_id": 22,
        "current_state": "AWAITING_ORDER_NUMBER",
        "state_type": "soft_lock",
        "state_data": {"order_id": 44},
        "expires_at": "2026-08-23T12:00:00+00:00",
    }
    assert client.calls == [
        (
            "transition_conversation_state",
            {
                "target_seller_id": 11,
                "target_customer_id": 22,
                "target_state": "AWAITING_ORDER_NUMBER",
                "transition_reason_code": "user_action",
                "transition_trigger_message_id": 101,
                "target_state_data": {"order_id": 44},
                "target_expires_at": "2026-08-23T12:00:00+00:00",
                "transition_metadata": {},
                "expected_state_version": None,
            },
        )
    ]


def test_older_source_message_is_fail_closed(monkeypatch) -> None:
    client = _Client({"status": "stale", "reason": "older_source_message"})
    monkeypatch.setattr(atomic_state, "get_supabase", lambda: client)

    result = atomic_state.transition_state(
        seller_id=11,
        customer_id=22,
        to_state="NORMAL",
        reason_code="user_action",
        trigger_message_id=100,
    )

    assert result["durum"] == "çakışma"
    assert result["error_code"] == "stale_state_message"


def test_version_conflict_is_fail_closed(monkeypatch) -> None:
    client = _Client({"status": "conflict", "reason": "state_version_conflict"})
    monkeypatch.setattr(atomic_state, "get_supabase", lambda: client)

    result = atomic_state.transition_state(
        seller_id=11,
        customer_id=22,
        to_state="NORMAL",
        reason_code="system",
        expected_version=3,
    )

    assert result["durum"] == "çakışma"
    assert result["error_code"] == "state_version_conflict"


def test_expired_state_resets_through_atomic_transition(monkeypatch) -> None:
    monkeypatch.setattr(
        atomic_state,
        "_fetch_state_record",
        lambda *_args: {
            "seller_id": 11,
            "customer_id": 22,
            "current_state": "AWAITING_ORDER_NUMBER",
            "state_type": "soft_lock",
            "state_data": {"order_id": 44},
            "expires_at": "2026-08-22T10:00:00+00:00",
            "state_version": 7,
            "state_last_message_id": 101,
        },
    )
    monkeypatch.setattr(
        atomic_state,
        "utc_now",
        lambda: datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc),
    )
    calls: list[dict[str, Any]] = []

    def _transition(**kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs)
        return {
            "durum": "başarılı",
            "state": {
                "seller_id": 11,
                "customer_id": 22,
                "current_state": "NORMAL",
                "state_type": "no_lock",
                "state_data": {},
                "expires_at": None,
            },
        }

    monkeypatch.setattr(atomic_state, "transition_state", _transition)

    result = atomic_state.get_state(11, 22)

    assert result["durum"] == "başarılı"
    assert result["expired"] is True
    assert calls == [
        {
            "seller_id": 11,
            "customer_id": 22,
            "to_state": "NORMAL",
            "reason_code": "timeout",
            "state_data": {},
            "metadata": {"expired_state": "AWAITING_ORDER_NUMBER"},
        }
    ]

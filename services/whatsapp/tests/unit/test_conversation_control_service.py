from __future__ import annotations

from typing import Any

import pytest

import conversation_control_service as service


def control(state: str = "ASSISTANT_ACTIVE", version: int = 3) -> dict[str, Any]:
    return {
        "state": state,
        "changed_at": "2026-08-06T12:00:00+00:00",
        "changed_by_profile_id": 2,
        "reason_code": "manual_resume",
        "reason_note": None,
        "resume_after_message_id": 91,
        "version": version,
    }


def test_read_presents_display_name_and_capabilities(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        service,
        "get_conversation_control",
        lambda seller_id, customer_id: {
            "durum": "başarılı",
            "control": control("SELLER_TAKEN_OVER"),
        },
    )

    result = service.read_conversation_control(42, 22)

    assert result["control"]["display_name"] == "Siz ilgileniyorsunuz"
    assert result["capabilities"] == {
        "can_take_over": False,
        "can_resume_assistant": True,
        "can_pause_assistant": False,
        "can_activate_assistant": True,
    }


@pytest.mark.parametrize(
    ("action", "expected_function", "expected_reason", "expected_state"),
    [
        ("take_over", "transition", "manual_takeover", "SELLER_TAKEN_OVER"),
        ("pause_assistant", "transition", "manual_pause", "ASSISTANT_PAUSED"),
        ("resume_assistant", "resume", "manual_resume", None),
        ("activate_assistant", "resume", "manual_resume", None),
    ],
)
def test_actions_use_expected_atomic_operation(
    monkeypatch: pytest.MonkeyPatch,
    action: str,
    expected_function: str,
    expected_reason: str,
    expected_state: str | None,
) -> None:
    calls: list[tuple[str, dict[str, Any]]] = []
    monkeypatch.setattr(
        service,
        "get_conversation_control",
        lambda *_args: {"durum": "başarılı", "control": control()},
    )

    def operation(name: str, **kwargs: Any) -> dict[str, Any]:
        calls.append((name, kwargs))
        target = kwargs.get("to_control_state", "ASSISTANT_ACTIVE")
        return {"durum": "başarılı", "changed": True, "control": control(target, 4)}

    monkeypatch.setattr(
        service,
        "transition_conversation_control",
        lambda **kwargs: operation("transition", **kwargs),
    )
    monkeypatch.setattr(
        service,
        "resume_conversation_assistant",
        lambda **kwargs: operation("resume", **kwargs),
    )

    result = service.mutate_conversation_control(
        seller_id=42,
        customer_id=22,
        actor_profile_id=2,
        action=service.ConversationControlAction(action),
        expected_version=3,
        reason_note=None,
    )

    assert result["ok"] is True
    assert calls[0][0] == expected_function
    assert calls[0][1]["reason_code"] == expected_reason
    assert calls[0][1]["changed_by_profile_id"] == 2
    assert calls[0][1]["expected_version"] == 3
    assert calls[0][1].get("to_control_state") == expected_state


@pytest.mark.parametrize("state", ["SELLER_TAKEN_OVER", "RETURN_REVIEW"])
def test_pause_rejects_states_with_stronger_existing_meaning(
    monkeypatch: pytest.MonkeyPatch,
    state: str,
) -> None:
    monkeypatch.setattr(
        service,
        "get_conversation_control",
        lambda *_args: {"durum": "başarılı", "control": control(state)},
    )
    monkeypatch.setattr(
        service,
        "transition_conversation_control",
        lambda **_kwargs: pytest.fail("RPC çağrılmamalı"),
    )

    result = service.mutate_conversation_control(
        seller_id=42,
        customer_id=22,
        actor_profile_id=2,
        action=service.ConversationControlAction.PAUSE_ASSISTANT,
        expected_version=3,
        reason_note=None,
    )

    assert result["error"]["code"] == "invalid_control_transition"
    assert result["kind"] == "conflict"


def test_local_version_conflict_does_not_call_rpc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        service,
        "get_conversation_control",
        lambda *_args: {"durum": "başarılı", "control": control(version=4)},
    )
    monkeypatch.setattr(
        service,
        "transition_conversation_control",
        lambda **_kwargs: pytest.fail("RPC çağrılmamalı"),
    )

    result = service.mutate_conversation_control(
        seller_id=42,
        customer_id=22,
        actor_profile_id=2,
        action=service.ConversationControlAction.TAKE_OVER,
        expected_version=3,
        reason_note=None,
    )

    assert result["error"]["code"] == "control_version_conflict"


@pytest.mark.parametrize("action", ["resume_assistant", "activate_assistant"])
def test_active_resume_actions_preserve_atomic_rpc_no_op(
    monkeypatch: pytest.MonkeyPatch,
    action: str,
) -> None:
    current = control(version=3)
    monkeypatch.setattr(
        service,
        "get_conversation_control",
        lambda *_args: {"durum": "başarılı", "control": current},
    )
    monkeypatch.setattr(
        service,
        "resume_conversation_assistant",
        lambda **_kwargs: {
            "durum": "başarılı",
            "changed": False,
            "control": current,
        },
    )

    result = service.mutate_conversation_control(
        seller_id=42,
        customer_id=22,
        actor_profile_id=2,
        action=service.ConversationControlAction(action),
        expected_version=3,
        reason_note=None,
    )

    assert result["changed"] is False
    assert result["control"]["version"] == 3
    assert result["control"]["resume_after_message_id"] == 91


def test_history_verifies_tenant_scoped_conversation_first(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[int, int, int]] = []
    monkeypatch.setattr(
        service,
        "get_conversation_control",
        lambda *_args: {"durum": "bulunamadı"},
    )
    monkeypatch.setattr(
        service,
        "get_conversation_control_history",
        lambda *args: calls.append(args) or {"durum": "başarılı", "history": []},
    )

    result = service.read_conversation_control_history(42, 22, 20)

    assert result["kind"] == "not_found"
    assert calls == []
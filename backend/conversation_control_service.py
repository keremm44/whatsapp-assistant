from __future__ import annotations

from enum import StrEnum
from typing import Any, Callable

from database import (
    CONTROL_STATE_ASSISTANT_ACTIVE,
    CONTROL_STATE_ASSISTANT_PAUSED,
    CONTROL_STATE_RETURN_REVIEW,
    CONTROL_STATE_SELLER_TAKEN_OVER,
    get_conversation_control,
    get_conversation_control_history,
    resume_conversation_assistant,
    transition_conversation_control,
)


class ConversationControlAction(StrEnum):
    TAKE_OVER = "take_over"
    RESUME_ASSISTANT = "resume_assistant"
    PAUSE_ASSISTANT = "pause_assistant"
    ACTIVATE_ASSISTANT = "activate_assistant"


CONTROL_DISPLAY_NAMES = {
    CONTROL_STATE_ASSISTANT_ACTIVE: "Asistan aktif",
    CONTROL_STATE_SELLER_TAKEN_OVER: "Siz ilgileniyorsunuz",
    CONTROL_STATE_RETURN_REVIEW: "İade incelemesi",
    CONTROL_STATE_ASSISTANT_PAUSED: "Yanıtlar durduruldu",
}

_CAPABILITIES = {
    CONTROL_STATE_ASSISTANT_ACTIVE: {
        "can_take_over": True,
        "can_resume_assistant": False,
        "can_pause_assistant": True,
        "can_activate_assistant": False,
    },
    CONTROL_STATE_SELLER_TAKEN_OVER: {
        "can_take_over": False,
        "can_resume_assistant": True,
        "can_pause_assistant": False,
        "can_activate_assistant": True,
    },
    CONTROL_STATE_RETURN_REVIEW: {
        "can_take_over": True,
        "can_resume_assistant": True,
        "can_pause_assistant": False,
        "can_activate_assistant": True,
    },
    CONTROL_STATE_ASSISTANT_PAUSED: {
        "can_take_over": True,
        "can_resume_assistant": True,
        "can_pause_assistant": False,
        "can_activate_assistant": True,
    },
}

_INVALID_PAUSE_SOURCE_STATES = {
    CONTROL_STATE_SELLER_TAKEN_OVER,
    CONTROL_STATE_RETURN_REVIEW,
}


def _failure(code: str, message: str, *, kind: str) -> dict[str, Any]:
    return {
        "ok": False,
        "error": {"code": code, "message": message},
        "kind": kind,
    }


def _map_database_failure(result: dict[str, Any]) -> dict[str, Any]:
    durum = result.get("durum")
    if durum in {"bulunamadı", "reddedildi"}:
        return _failure(
            "conversation_control_not_found",
            "Konuşma kontrol kaydı bulunamadı.",
            kind="not_found",
        )
    if durum == "çakışma":
        return _failure(
            "control_version_conflict",
            "Konuşmanın durumu değişti. Güncel bilgileri yenileyip tekrar deneyin.",
            kind="conflict",
        )
    return _failure(
        "conversation_control_unavailable",
        "Konuşma kontrol bilgisine şu anda erişilemiyor.",
        kind="unavailable",
    )


def _present_control(customer_id: int, control: dict[str, Any]) -> dict[str, Any]:
    state = control.get("state")
    display_name = CONTROL_DISPLAY_NAMES.get(state)
    capabilities = _CAPABILITIES.get(state)
    if display_name is None or capabilities is None:
        return _failure(
            "conversation_control_unavailable",
            "Konuşma kontrol bilgisine şu anda erişilemiyor.",
            kind="unavailable",
        )

    return {
        "ok": True,
        "customer_id": customer_id,
        "control": {
            **control,
            "display_name": display_name,
        },
        "capabilities": dict(capabilities),
    }


def read_conversation_control(
    seller_id: int,
    customer_id: int,
) -> dict[str, Any]:
    result = get_conversation_control(seller_id, customer_id)
    if result.get("durum") != "başarılı":
        return _map_database_failure(result)
    return _present_control(customer_id, result["control"])


def mutate_conversation_control(
    *,
    seller_id: int,
    customer_id: int,
    actor_profile_id: int,
    action: ConversationControlAction,
    expected_version: int,
    reason_note: str | None,
) -> dict[str, Any]:
    current_result = get_conversation_control(seller_id, customer_id)
    if current_result.get("durum") != "başarılı":
        return _map_database_failure(current_result)

    current = current_result["control"]
    if current["version"] != expected_version:
        return _failure(
            "control_version_conflict",
            "Konuşmanın durumu değişti. Güncel bilgileri yenileyip tekrar deneyin.",
            kind="conflict",
        )

    if (
        action == ConversationControlAction.PAUSE_ASSISTANT
        and current["state"] in _INVALID_PAUSE_SOURCE_STATES
    ):
        return _failure(
            "invalid_control_transition",
            "Bu konuşma mevcut durumundayken yanıtlar durdurulamaz.",
            kind="conflict",
        )

    operation: Callable[..., dict[str, Any]]
    kwargs: dict[str, Any] = {
        "seller_id": seller_id,
        "customer_id": customer_id,
        "reason_note": reason_note,
        "changed_by_profile_id": actor_profile_id,
        "expected_version": expected_version,
    }

    if action == ConversationControlAction.TAKE_OVER:
        operation = transition_conversation_control
        kwargs.update(
            to_control_state=CONTROL_STATE_SELLER_TAKEN_OVER,
            reason_code="manual_takeover",
        )
    elif action == ConversationControlAction.PAUSE_ASSISTANT:
        operation = transition_conversation_control
        kwargs.update(
            to_control_state=CONTROL_STATE_ASSISTANT_PAUSED,
            reason_code="manual_pause",
        )
    else:
        operation = resume_conversation_assistant
        kwargs.update(reason_code="manual_resume")

    result = operation(**kwargs)
    if result.get("durum") != "başarılı":
        return _map_database_failure(result)

    response = _present_control(customer_id, result["control"])
    if not response.get("ok"):
        return response
    response.update(action=action.value, changed=result.get("changed") is True)
    return response


def read_conversation_control_history(
    seller_id: int,
    customer_id: int,
    limit: int,
) -> dict[str, Any]:
    control_result = get_conversation_control(seller_id, customer_id)
    if control_result.get("durum") != "başarılı":
        return _map_database_failure(control_result)

    result = get_conversation_control_history(seller_id, customer_id, limit)
    if result.get("durum") != "başarılı":
        return _map_database_failure(result)
    return {
        "ok": True,
        "customer_id": customer_id,
        "history": result["history"],
    }
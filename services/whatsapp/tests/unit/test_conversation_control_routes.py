from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.router import router
from auth_service import AuthContext, require_seller


app = FastAPI()
app.include_router(router)
client = TestClient(app)

SELLER_CONTEXT = AuthContext(
    auth_user_id="22222222-2222-2222-2222-222222222222",
    email="seller@example.com",
    role="seller",
    profile_status="active",
    seller_id=42,
    profile={"id": 2, "role": "seller", "status": "active", "seller_id": 42},
    claims={"sub": "22222222-2222-2222-2222-222222222222"},
)


@pytest.fixture(autouse=True)
def seller_dependency() -> None:
    app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
    yield
    app.dependency_overrides.clear()


def presented_result() -> dict:
    return {
        "ok": True,
        "customer_id": 22,
        "control": {
            "state": "SELLER_TAKEN_OVER",
            "display_name": "Siz ilgileniyorsunuz",
            "reason_code": "manual_takeover",
            "reason_note": None,
            "changed_at": "2026-08-06T12:00:00+00:00",
            "changed_by_profile_id": 2,
            "resume_after_message_id": 91,
            "version": 4,
        },
        "capabilities": {
            "can_take_over": False,
            "can_resume_assistant": True,
            "can_pause_assistant": False,
            "can_activate_assistant": True,
        },
    }


def test_get_control_uses_authenticated_seller_scope() -> None:
    with patch(
        "api.seller.conversations.read_conversation_control",
        return_value=presented_result(),
    ) as mocked:
        response = client.get("/seller/conversations/22/control")

    assert response.status_code == 200
    assert response.json()["control"]["display_name"] == "Siz ilgileniyorsunuz"
    mocked.assert_called_once_with(42, 22)


def test_control_endpoint_requires_authentication() -> None:
    app.dependency_overrides.clear()

    response = client.get("/seller/conversations/22/control")

    assert response.status_code == 401


def test_post_uses_profile_actor_and_trims_reason_note() -> None:
    result = {**presented_result(), "action": "take_over", "changed": True}
    with patch(
        "api.seller.conversations.mutate_conversation_control",
        return_value=result,
    ) as mocked:
        response = client.post(
            "/seller/conversations/22/control",
            json={
                "action": "take_over",
                "expected_version": 3,
                "reason_note": "  Manuel destek  ",
            },
        )

    assert response.status_code == 200
    mocked.assert_called_once_with(
        seller_id=42,
        customer_id=22,
        actor_profile_id=2,
        action="take_over",
        expected_version=3,
        reason_note="Manuel destek",
    )


def test_post_rejects_untrusted_missing_profile_actor() -> None:
    invalid_context = AuthContext(
        auth_user_id=SELLER_CONTEXT.auth_user_id,
        email=SELLER_CONTEXT.email,
        role="seller",
        profile_status="active",
        seller_id=42,
        profile={"role": "seller", "status": "active", "seller_id": 42},
        claims=SELLER_CONTEXT.claims,
    )
    app.dependency_overrides[require_seller] = lambda: invalid_context

    response = client.post(
        "/seller/conversations/22/control",
        json={"action": "take_over", "expected_version": 3},
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "conversation_control_unavailable"


@pytest.mark.parametrize(
    "field",
    [
        "seller_id",
        "changed_by_profile_id",
        "target_state",
        "control_state",
        "resume_after_message_id",
        "control_version",
    ],
)
def test_post_rejects_security_sensitive_extra_fields(field: str) -> None:
    response = client.post(
        "/seller/conversations/22/control",
        json={"action": "take_over", "expected_version": 3, field: 99},
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        {"action": "take_over"},
        {"action": "take_over", "expected_version": 0},
        {"action": "take_over", "expected_version": True},
        {"action": "take_over", "expected_version": "3"},
        {"action": "RETURN_REVIEW", "expected_version": 3},
        {"action": "take_over", "expected_version": 3, "reason_note": "x" * 501},
    ],
)
def test_post_validates_action_version_and_note(body: dict) -> None:
    response = client.post("/seller/conversations/22/control", json=body)
    assert response.status_code == 422


def test_conflict_uses_safe_structured_contract() -> None:
    with patch(
        "api.seller.conversations.mutate_conversation_control",
        return_value={
            "ok": False,
            "kind": "conflict",
            "error": {
                "code": "control_version_conflict",
                "message": "Konuşmanın durumu değişti. Güncel bilgileri yenileyip tekrar deneyin.",
            },
        },
    ):
        response = client.post(
            "/seller/conversations/22/control",
            json={"action": "take_over", "expected_version": 3},
        )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "control_version_conflict"


def test_not_found_does_not_reveal_other_tenant() -> None:
    with patch(
        "api.seller.conversations.read_conversation_control",
        return_value={
            "ok": False,
            "kind": "not_found",
            "error": {
                "code": "conversation_control_not_found",
                "message": "Konuşma kontrol kaydı bulunamadı.",
            },
        },
    ):
        response = client.get("/seller/conversations/999/control")

    assert response.status_code == 404
    assert "tenant" not in response.text.lower()


def test_history_default_and_explicit_limit() -> None:
    result = {"ok": True, "customer_id": 22, "history": []}
    with patch(
        "api.seller.conversations.read_conversation_control_history",
        return_value=result,
    ) as mocked:
        first = client.get("/seller/conversations/22/control-history")
        second = client.get("/seller/conversations/22/control-history?limit=7")

    assert first.status_code == second.status_code == 200
    assert mocked.call_args_list[0].args == (42, 22, 20)
    assert mocked.call_args_list[1].args == (42, 22, 7)


@pytest.mark.parametrize("limit", [0, 101])
def test_history_rejects_out_of_range_limit(limit: int) -> None:
    response = client.get(f"/seller/conversations/22/control-history?limit={limit}")
    assert response.status_code == 422

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from auth_service import AuthContext, require_seller
from protected_routes import router


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


def test_conversation_list_uses_authenticated_seller_scope() -> None:
    result = {
        "ok": True,
        "toplam": 1,
        "limit": 20,
        "offset": 0,
        "attention_only": True,
        "conversations": [{"customer": {"id": 22}}],
    }
    with patch(
        "protected_routes.list_seller_panel_conversations",
        return_value=result,
    ) as mocked:
        response = client.get("/seller/conversations?attention_only=true")

    assert response.status_code == 200
    assert response.json()["conversations"][0]["customer"]["id"] == 22
    mocked.assert_called_once_with(
        42,
        attention_only=True,
        limit=20,
        offset=0,
    )


def test_conversation_list_requires_authentication() -> None:
    app.dependency_overrides.clear()

    response = client.get("/seller/conversations")

    assert response.status_code == 401


def test_conversation_list_validates_pagination() -> None:
    assert client.get("/seller/conversations?limit=0").status_code == 422
    assert client.get("/seller/conversations?limit=101").status_code == 422
    assert client.get("/seller/conversations?offset=-1").status_code == 422


def test_conversation_detail_passes_cursor_and_limits() -> None:
    result = {
        "ok": True,
        "customer": {"id": 22},
        "conversation_state": None,
        "control": None,
        "messages": [],
        "message_page": {"limit": 25, "has_more": False},
        "control_history": [],
        "active_order": None,
        "active_return_issue": None,
        "open_unanswered": [],
    }
    with patch(
        "protected_routes.get_seller_panel_conversation_detail",
        return_value=result,
    ) as mocked:
        response = client.get(
            "/seller/conversations/22"
            "?message_limit=25&before_message_id=500&control_history_limit=7"
        )

    assert response.status_code == 200
    mocked.assert_called_once_with(
        42,
        22,
        message_limit=25,
        before_message_id=500,
        control_history_limit=7,
    )


def test_conversation_detail_not_found_is_404_and_safe() -> None:
    with patch(
        "protected_routes.get_seller_panel_conversation_detail",
        return_value={
            "ok": False,
            "kind": "not_found",
            "error": {
                "code": "seller_conversation_not_found",
                "message": "Konuşma bulunamadı.",
            },
        },
    ):
        response = client.get("/seller/conversations/999")

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "seller_conversation_not_found"
    assert "tenant" not in response.text.lower()


def test_conversation_detail_does_not_shadow_control_route() -> None:
    with patch(
        "protected_routes.read_conversation_control",
        return_value={
            "ok": True,
            "customer_id": 22,
            "control": {
                "state": "ASSISTANT_ACTIVE",
                "display_name": "Asistan aktif",
                "changed_at": "2026-08-08T12:00:00+00:00",
                "changed_by_profile_id": None,
                "reason_code": None,
                "reason_note": None,
                "resume_after_message_id": None,
                "version": 1,
            },
            "capabilities": {
                "can_take_over": True,
                "can_resume_assistant": False,
                "can_pause_assistant": True,
                "can_activate_assistant": False,
            },
        },
    ):
        response = client.get("/seller/conversations/22/control")

    assert response.status_code == 200
    assert response.json()["control"]["state"] == "ASSISTANT_ACTIVE"


def test_dashboard_tasks_uses_type_alias_and_seller_scope() -> None:
    result = {
        "ok": True,
        "toplam": 1,
        "limit": 30,
        "offset": 4,
        "type": "return_review",
        "tasks": [{"id": "return_review:9", "type": "return_review"}],
    }
    with patch(
        "protected_routes.list_seller_panel_dashboard_tasks",
        return_value=result,
    ) as mocked:
        response = client.get(
            "/seller/dashboard/tasks?type=return_review&limit=30&offset=4"
        )

    assert response.status_code == 200
    assert response.json()["tasks"][0]["type"] == "return_review"
    mocked.assert_called_once_with(
        42,
        task_type="return_review",
        limit=30,
        offset=4,
    )


def test_dashboard_tasks_rejects_unknown_type() -> None:
    response = client.get("/seller/dashboard/tasks?type=kpi")

    assert response.status_code == 422

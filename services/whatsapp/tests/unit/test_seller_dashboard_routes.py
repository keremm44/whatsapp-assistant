from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.seller.dashboard import router
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

OTHER_SELLER_CONTEXT = AuthContext(
    auth_user_id="33333333-3333-3333-3333-333333333333",
    email="other@example.com",
    role="seller",
    profile_status="active",
    seller_id=99,
    profile={"id": 3, "role": "seller", "status": "active", "seller_id": 99},
    claims={"sub": "33333333-3333-3333-3333-333333333333"},
)


@pytest.fixture(autouse=True)
def seller_dependency() -> None:
    app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
    yield
    app.dependency_overrides.clear()


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
        "api.seller.dashboard.list_seller_panel_dashboard_tasks",
        return_value=result,
    ) as mocked:
        response = client.get(
            "/seller/dashboard/tasks?type=return_review&limit=30&offset=4"
        )

    assert response.status_code == 200
    assert response.json() == {
        "toplam": 1,
        "limit": 30,
        "offset": 4,
        "type": "return_review",
        "tasks": [{"id": "return_review:9", "type": "return_review"}],
    }
    mocked.assert_called_once_with(
        42,
        task_type="return_review",
        limit=30,
        offset=4,
    )


def test_dashboard_tasks_requires_authentication() -> None:
    app.dependency_overrides.clear()

    response = client.get("/seller/dashboard/tasks")

    assert response.status_code == 401


def test_dashboard_tasks_validates_query_before_service_call() -> None:
    with patch("api.seller.dashboard.list_seller_panel_dashboard_tasks") as mocked:
        invalid_type = client.get("/seller/dashboard/tasks?type=kpi")
        invalid_limit = client.get("/seller/dashboard/tasks?limit=0")
        invalid_offset = client.get("/seller/dashboard/tasks?offset=-1")

    assert invalid_type.status_code == 422
    assert invalid_limit.status_code == 422
    assert invalid_offset.status_code == 422
    mocked.assert_not_called()


@pytest.mark.parametrize(
    ("kind", "expected_status"),
    [
        ("not_found", 404),
        ("validation", 422),
        ("unavailable", 503),
        ("unknown", 503),
    ],
)
def test_dashboard_tasks_maps_service_errors(
    kind: str,
    expected_status: int,
) -> None:
    with patch(
        "api.seller.dashboard.list_seller_panel_dashboard_tasks",
        return_value={
            "ok": False,
            "kind": kind,
            "error": {
                "code": "seller_dashboard_error",
                "message": "Dashboard görevleri okunamadı.",
            },
        },
    ):
        response = client.get("/seller/dashboard/tasks")

    assert response.status_code == expected_status
    assert response.json()["detail"]["code"] == "seller_dashboard_error"


def test_sidebar_summary_returns_counts_with_seller_scope() -> None:
    result = {
        "ok": True,
        "returns_action_required": 4,
        "unanswered_open": 7,
        "paused_or_taken_over": 2,
    }
    with patch(
        "api.seller.dashboard.get_seller_sidebar_summary",
        return_value=result,
    ) as mocked:
        response = client.get("/seller/sidebar-summary")

    assert response.status_code == 200
    assert response.json() == {
        "returns_action_required": 4,
        "unanswered_open": 7,
        "paused_or_taken_over": 2,
    }
    mocked.assert_called_once_with(42)


def test_sidebar_summary_uses_authenticated_tenant_scope() -> None:
    app.dependency_overrides[require_seller] = lambda: OTHER_SELLER_CONTEXT
    with patch(
        "api.seller.dashboard.get_seller_sidebar_summary",
        return_value={
            "ok": True,
            "returns_action_required": 1,
            "unanswered_open": 2,
            "paused_or_taken_over": 3,
        },
    ) as mocked:
        response = client.get("/seller/sidebar-summary")

    assert response.status_code == 200
    mocked.assert_called_once_with(99)


@pytest.mark.parametrize(
    ("kind", "expected_status"),
    [
        ("validation", 422),
        ("unavailable", 503),
        ("unknown", 503),
    ],
)
def test_sidebar_summary_maps_service_errors(
    kind: str,
    expected_status: int,
) -> None:
    with patch(
        "api.seller.dashboard.get_seller_sidebar_summary",
        return_value={
            "ok": False,
            "kind": kind,
            "error": {
                "code": "seller_sidebar_error",
                "message": "Sidebar özeti okunamadı.",
            },
        },
    ):
        response = client.get("/seller/sidebar-summary")

    assert response.status_code == expected_status
    assert response.json()["detail"]["code"] == "seller_sidebar_error"

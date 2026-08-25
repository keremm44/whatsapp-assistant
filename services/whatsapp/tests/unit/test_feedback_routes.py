from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.admin.feedback import router as admin_feedback_router
from api.seller.feedback import router as seller_feedback_router
from auth_service import AuthContext, require_admin, require_seller


app = FastAPI()
app.include_router(seller_feedback_router)
app.include_router(admin_feedback_router)
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
ADMIN_CONTEXT = AuthContext(
    auth_user_id="11111111-1111-1111-1111-111111111111",
    email="admin@example.com",
    role="admin",
    profile_status="active",
    seller_id=None,
    profile={"id": 1, "role": "admin", "status": "active", "seller_id": None},
    claims={"sub": "11111111-1111-1111-1111-111111111111"},
)


@pytest.fixture(autouse=True)
def auth_dependencies() -> None:
    app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
    app.dependency_overrides[require_admin] = lambda: ADMIN_CONTEXT
    yield
    app.dependency_overrides.clear()


def test_seller_creates_feedback_with_authenticated_scope() -> None:
    with patch(
        "api.seller.feedback.submit_feedback",
        return_value={
            "ok": True,
            "feedback": {
                "id": 7,
                "category": "problem",
                "subject": "Konu",
                "message": "Mesaj",
                "status": "OPEN",
                "version": 1,
            },
        },
    ) as mocked:
        response = client.post(
            "/seller/feedback",
            json={"category": "problem", "subject": "  Konu ", "message": " Mesaj "},
        )

    assert response.status_code == 201
    assert response.json()["feedback"]["status"] == "OPEN"
    assert mocked.call_args.args[0] == 42
    assert mocked.call_args.args[1].subject == "Konu"


def test_seller_create_rejects_invalid_or_empty_content() -> None:
    with patch("api.seller.feedback.submit_feedback") as mocked:
        invalid_category = client.post(
            "/seller/feedback",
            json={"category": "bug", "subject": "Konu", "message": "Mesaj"},
        )
        empty_subject = client.post(
            "/seller/feedback",
            json={"category": "problem", "subject": "   ", "message": "Mesaj"},
        )
        empty_message = client.post(
            "/seller/feedback",
            json={"category": "problem", "subject": "Konu", "message": "   "},
        )

    assert invalid_category.status_code == 422
    assert empty_subject.status_code == 422
    assert empty_message.status_code == 422
    mocked.assert_not_called()


def test_seller_cannot_set_workflow_or_tenant_fields() -> None:
    with patch("api.seller.feedback.submit_feedback") as mocked:
        response = client.post(
            "/seller/feedback",
            json={
                "category": "complaint",
                "subject": "Konu",
                "message": "Mesaj",
                "seller_id": 99,
                "status": "RESOLVED",
                "admin_note": "self-approved",
            },
        )

    assert response.status_code == 422
    mocked.assert_not_called()


def test_seller_list_uses_auth_tenant_and_pagination() -> None:
    with patch(
        "api.seller.feedback.list_seller_feedback",
        return_value={
            "ok": True,
            "total": 1,
            "limit": 10,
            "offset": 5,
            "feedback": [{"id": 7}],
        },
    ) as mocked:
        response = client.get("/seller/feedback?limit=10&offset=5")

    assert response.status_code == 200
    mocked.assert_called_once_with(42, limit=10, offset=5)


def test_seller_cannot_read_other_seller_feedback() -> None:
    with patch(
        "api.seller.feedback.get_seller_feedback_item",
        return_value={
            "ok": False,
            "kind": "not_found",
            "error": {"code": "feedback_not_found", "message": "Feedback bulunamadı."},
        },
    ) as mocked:
        response = client.get("/seller/feedback/999")

    assert response.status_code == 404
    mocked.assert_called_once_with(42, 999)
    assert "seller" not in response.text.lower()


def test_admin_list_passes_status_category_and_seller_filters() -> None:
    with patch(
        "api.admin.feedback.list_admin_feedback",
        return_value={
            "ok": True,
            "total": 0,
            "limit": 15,
            "offset": 2,
            "feedback": [],
        },
    ) as mocked:
        response = client.get(
            "/admin/feedback?status=IN_REVIEW&category=complaint"
            "&seller_id=42&limit=15&offset=2"
        )

    assert response.status_code == 200
    mocked.assert_called_once_with(
        status="IN_REVIEW",
        category="complaint",
        seller_id=42,
        limit=15,
        offset=2,
    )


def test_admin_detail_and_update_are_guarded_by_admin() -> None:
    with patch(
        "api.admin.feedback.get_admin_feedback_item",
        return_value={"ok": True, "feedback": {"id": 7, "seller": {"id": 42}}},
    ) as detail_mock:
        detail_response = client.get("/admin/feedback/7")

    with patch(
        "api.admin.feedback.update_admin_feedback_item",
        return_value={
            "ok": True,
            "changed": True,
            "feedback": {"id": 7, "status": "IN_REVIEW", "version": 2},
        },
    ) as update_mock:
        update_response = client.patch(
            "/admin/feedback/7",
            json={
                "expected_version": 1,
                "status": "IN_REVIEW",
                "admin_note": "İnceleniyor",
            },
        )

    assert detail_response.status_code == 200
    assert update_response.status_code == 200
    detail_mock.assert_called_once_with(7)
    assert update_mock.call_args.args[0] == 7
    assert update_mock.call_args.args[1].expected_version == 1


def test_admin_stale_version_maps_to_409() -> None:
    with patch(
        "api.admin.feedback.update_admin_feedback_item",
        return_value={
            "ok": False,
            "kind": "conflict",
            "error": {"code": "feedback_conflict", "message": "stale"},
        },
    ):
        response = client.patch(
            "/admin/feedback/7",
            json={"expected_version": 1, "status": "RESOLVED"},
        )

    assert response.status_code == 409


def test_feedback_authorization_guards_remain_required() -> None:
    app.dependency_overrides.clear()

    assert client.get("/seller/feedback").status_code == 401
    assert client.get("/admin/feedback").status_code == 401

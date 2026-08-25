from __future__ import annotations

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.admin.applications import router
from auth_service import AuthContext, get_current_auth_context, require_admin


app = FastAPI()
app.include_router(router)
client = TestClient(app)

ADMIN_CONTEXT = AuthContext(
    auth_user_id="11111111-1111-1111-1111-111111111111",
    email="admin@example.com",
    role="admin",
    profile_status="active",
    seller_id=None,
    profile={"id": 1, "role": "admin", "status": "active", "seller_id": None},
    claims={"sub": "11111111-1111-1111-1111-111111111111"},
)

SELLER_CONTEXT = AuthContext(
    auth_user_id="22222222-2222-2222-2222-222222222222",
    email="seller@example.com",
    role="seller",
    profile_status="active",
    seller_id=42,
    profile={"id": 2, "role": "seller", "status": "active", "seller_id": 42},
    claims={"sub": "22222222-2222-2222-2222-222222222222"},
)


def _set_admin() -> None:
    app.dependency_overrides[require_admin] = lambda: ADMIN_CONTEXT


def _clear() -> None:
    app.dependency_overrides.clear()


def test_admin_lists_applications_with_filters() -> None:
    _set_admin()
    with patch(
        "api.admin.applications.get_seller_applications",
        return_value={
            "durum": "başarılı",
            "toplam": 1,
            "applications": [{"id": 9, "status": "pending"}],
        },
    ) as mocked:
        response = client.get("/admin/applications?status=pending&limit=50")

    assert response.status_code == 200
    assert response.json()["toplam"] == 1
    mocked.assert_called_once_with(status="pending", limit=50)
    _clear()


def test_admin_application_list_validates_limit_before_database_call() -> None:
    _set_admin()
    with patch("api.admin.applications.get_seller_applications") as mocked:
        response = client.get("/admin/applications?limit=0")

    assert response.status_code == 422
    mocked.assert_not_called()
    _clear()


def test_admin_can_invite_application() -> None:
    _set_admin()
    with patch(
        "api.admin.applications.invite_seller_from_application",
        return_value={
            "ok": True,
            "status": "invited",
            "already_processed": False,
            "invitation_sent": True,
            "application": {"id": 7, "status": "approved"},
            "seller": {"id": 51, "system_status": "onboarding"},
            "profile": {"id": 8, "status": "invited", "seller_id": 51},
        },
    ) as mocked:
        response = client.post(
            "/admin/applications/7/invite",
            json={
                "email": " SELLER@EXAMPLE.COM ",
                "admin_note": " Uygun bulundu ",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "invited"
    assert body["seller"]["id"] == 51
    assert "ok" not in body
    args = mocked.call_args.args
    assert args[0] == 7
    request = args[1]
    assert request.email == "seller@example.com"
    assert request.admin_note == "Uygun bulundu"
    _clear()


def test_admin_invite_maps_conflict_to_409() -> None:
    _set_admin()
    with patch(
        "api.admin.applications.invite_seller_from_application",
        return_value={
            "ok": False,
            "kind": "conflict",
            "error": {
                "code": "seller_application_not_invitable",
                "message": "Başvuru kapalı.",
            },
        },
    ):
        response = client.post("/admin/applications/7/invite", json={})

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "seller_application_not_invitable"
    _clear()


def test_admin_invite_maps_partial_failure_to_503() -> None:
    _set_admin()
    with patch(
        "api.admin.applications.invite_seller_from_application",
        return_value={
            "ok": False,
            "kind": "partial_failure",
            "error": {
                "code": "seller_invitation_partial_failure",
                "message": "Cleanup gerekli.",
            },
        },
    ):
        response = client.post("/admin/applications/7/invite", json={})

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "seller_invitation_partial_failure"
    _clear()


def test_admin_invite_rejects_invalid_body_before_service() -> None:
    _set_admin()
    with patch("api.admin.applications.invite_seller_from_application") as mocked:
        response = client.post(
            "/admin/applications/7/invite",
            json={"email": "not-an-email", "seller_id": 999},
        )

    assert response.status_code == 422
    mocked.assert_not_called()
    _clear()


def test_seller_cannot_call_admin_application_routes() -> None:
    app.dependency_overrides[get_current_auth_context] = lambda: SELLER_CONTEXT

    list_response = client.get("/admin/applications")
    invite_response = client.post("/admin/applications/7/invite", json={})

    assert list_response.status_code == 403
    assert invite_response.status_code == 403
    _clear()

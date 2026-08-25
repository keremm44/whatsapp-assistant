from __future__ import annotations

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from admin_seller_routes import router
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
    profile={"id": 3, "role": "admin", "status": "active", "seller_id": None},
    claims={"sub": "11111111-1111-1111-1111-111111111111"},
)

SELLER_CONTEXT = AuthContext(
    auth_user_id="22222222-2222-2222-2222-222222222222",
    email="seller@example.com",
    role="seller",
    profile_status="active",
    seller_id=42,
    profile={"id": 5, "role": "seller", "status": "active", "seller_id": 42},
    claims={"sub": "22222222-2222-2222-2222-222222222222"},
)


def _set_admin() -> None:
    app.dependency_overrides[require_admin] = lambda: ADMIN_CONTEXT


def _clear() -> None:
    app.dependency_overrides.clear()


def test_admin_lists_sellers_with_filters_and_pagination() -> None:
    _set_admin()
    with patch(
        "admin_seller_routes.list_admin_sellers",
        return_value={
            "ok": True,
            "total": 1,
            "limit": 10,
            "offset": 20,
            "sellers": [{"id": 42, "name": "Alya", "store_name": "Alya Atölye"}],
        },
    ) as mocked:
        response = client.get(
            "/admin/sellers?q=Alya&system_status=active&limit=10&offset=20"
        )

    assert response.status_code == 200
    assert response.json()["total"] == 1
    mocked.assert_called_once_with(
        q="Alya",
        system_status="active",
        limit=10,
        offset=20,
    )
    _clear()


def test_admin_gets_seller_detail() -> None:
    _set_admin()
    with patch(
        "admin_seller_routes.get_admin_seller",
        return_value={"ok": True, "seller": {"id": 42, "store_name": "Alya Atölye"}},
    ) as mocked:
        response = client.get("/admin/sellers/42")

    assert response.status_code == 200
    assert response.json()["seller"]["id"] == 42
    mocked.assert_called_once_with(42)
    _clear()


def test_invalid_status_is_rejected_by_route_contract() -> None:
    _set_admin()
    with patch("admin_seller_routes.list_admin_sellers") as mocked:
        response = client.get("/admin/sellers?system_status=invented")

    assert response.status_code == 422
    mocked.assert_not_called()
    _clear()


def test_unknown_seller_maps_to_404() -> None:
    _set_admin()
    with patch(
        "admin_seller_routes.get_admin_seller",
        return_value={
            "ok": False,
            "kind": "not_found",
            "error": {"code": "admin_seller_not_found", "message": "Seller bulunamadı."},
        },
    ):
        response = client.get("/admin/sellers/999")

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "admin_seller_not_found"
    _clear()


def test_unavailable_maps_to_503_without_internal_leak() -> None:
    _set_admin()
    with patch(
        "admin_seller_routes.list_admin_sellers",
        return_value={
            "ok": False,
            "kind": "unavailable",
            "error": {
                "code": "admin_seller_directory_unavailable",
                "message": "Seller directory şu anda okunamıyor.",
            },
        },
    ):
        response = client.get("/admin/sellers")

    assert response.status_code == 503
    assert "postgres" not in str(response.json()).lower()
    assert "password" not in str(response.json()).lower()
    _clear()


def test_seller_cannot_access_admin_seller_routes() -> None:
    app.dependency_overrides[get_current_auth_context] = lambda: SELLER_CONTEXT

    response = client.get("/admin/sellers")

    assert response.status_code == 403
    _clear()


def test_unauthenticated_request_is_rejected() -> None:
    _clear()

    response = client.get("/admin/sellers")

    assert response.status_code == 401

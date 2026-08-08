from __future__ import annotations

from unittest.mock import patch

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


def setup_function() -> None:
    app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_get_products_passes_include_inactive() -> None:
    with patch(
        "protected_routes.list_seller_products",
        return_value={"ok": True, "products": [], "total": 0},
    ) as mocked:
        response = client.get("/seller/products?include_inactive=true")

    assert response.status_code == 200
    assert response.json() == {"products": [], "total": 0}
    mocked.assert_called_once_with(42, include_inactive=True)


def test_create_product_returns_201() -> None:
    with patch(
        "protected_routes.create_seller_product",
        return_value={
            "ok": True,
            "changed": True,
            "product": {"id": 7, "name": "Kupa", "version": 1},
        },
    ):
        response = client.post("/seller/products", json={"name": "Kupa"})

    assert response.status_code == 201
    assert response.json()["product"]["id"] == 7


def test_create_product_rejects_untrusted_fields() -> None:
    with patch("protected_routes.create_seller_product") as mocked:
        response = client.post(
            "/seller/products",
            json={"name": "Kupa", "seller_id": 9, "version": 99},
        )

    assert response.status_code == 422
    mocked.assert_not_called()


def test_patch_product_uses_version_and_seller_scope() -> None:
    with patch(
        "protected_routes.update_seller_product",
        return_value={
            "ok": True,
            "changed": True,
            "product": {"id": 7, "name": "Yeni", "version": 3},
        },
    ) as mocked:
        response = client.patch(
            "/seller/products/7",
            json={"expected_version": 2, "name": "Yeni"},
        )

    assert response.status_code == 200
    assert mocked.call_args.args[0:2] == (42, 7)


def test_patch_product_maps_conflict() -> None:
    with patch(
        "protected_routes.update_seller_product",
        return_value={
            "ok": False,
            "kind": "conflict",
            "error": {"code": "seller_product_conflict", "message": "stale"},
        },
    ):
        response = client.patch(
            "/seller/products/7",
            json={"expected_version": 2, "is_active": False},
        )

    assert response.status_code == 409


def test_patch_product_rejects_empty_patch() -> None:
    with patch("protected_routes.update_seller_product") as mocked:
        response = client.patch(
            "/seller/products/7",
            json={"expected_version": 2},
        )

    assert response.status_code == 422
    mocked.assert_not_called()

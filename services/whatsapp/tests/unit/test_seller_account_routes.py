from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.seller.account import router
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


def test_seller_me_uses_authenticated_seller_scope_and_preserves_access_shape() -> None:
    with patch(
        "api.seller.account.get_seller_by_id",
        return_value={
            "durum": "başarılı",
            "satıcı": {
                "id": 42,
                "store_name": "Test Mağaza",
                "onboarding_completed": False,
                "system_status": "onboarding",
                "ai_enabled": False,
            },
        },
    ) as mocked:
        response = client.get("/seller/me")

    assert response.status_code == 200
    assert response.json() == {
        "seller": {
            "id": 42,
            "store_name": "Test Mağaza",
            "onboarding_completed": False,
            "system_status": "onboarding",
            "ai_enabled": False,
        },
        "access": {
            "role": "seller",
            "seller_id": 42,
            "onboarding_completed": False,
            "system_status": "onboarding",
            "ai_enabled": False,
        },
    }
    mocked.assert_called_once_with(42)


def test_seller_me_uses_current_tenant_not_a_client_supplied_identity() -> None:
    app.dependency_overrides[require_seller] = lambda: OTHER_SELLER_CONTEXT
    with patch(
        "api.seller.account.get_seller_by_id",
        return_value={
            "durum": "başarılı",
            "satıcı": {
                "id": 99,
                "onboarding_completed": True,
                "system_status": "beta_active",
                "ai_enabled": True,
            },
        },
    ) as mocked:
        response = client.get("/seller/me")

    assert response.status_code == 200
    mocked.assert_called_once_with(99)


def test_seller_me_maps_database_not_found_to_404() -> None:
    with patch(
        "api.seller.account.get_seller_by_id",
        return_value={"durum": "bulunamadı", "mesaj": "Satıcı bulunamadı."},
    ):
        response = client.get("/seller/me")

    assert response.status_code == 404
    assert response.json()["detail"] == "Satıcı bulunamadı."


def test_seller_me_maps_database_validation_to_422() -> None:
    with patch(
        "api.seller.account.get_seller_by_id",
        return_value={
            "durum": "doğrulama_hatası",
            "mesaj": "Satıcı okunamadı.",
            "errors": [{"field": "seller_id", "message": "Geçersiz."}],
        },
    ):
        response = client.get("/seller/me")

    assert response.status_code == 422
    assert response.json()["detail"]["errors"][0]["field"] == "seller_id"


def test_seller_me_requires_authentication() -> None:
    app.dependency_overrides.clear()

    response = client.get("/seller/me")

    assert response.status_code == 401

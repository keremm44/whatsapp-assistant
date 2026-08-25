from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.admin.sellers import router
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


@pytest.fixture(autouse=True)
def admin_dependency() -> None:
    app.dependency_overrides[require_admin] = lambda: ADMIN_CONTEXT
    yield
    app.dependency_overrides.clear()


def test_admin_activation_calls_database_with_server_owned_approval() -> None:
    with patch(
        "api.admin.sellers.activate_seller",
        return_value={
            "durum": "başarılı",
            "seller": {
                "id": 42,
                "system_status": "beta_active",
                "ai_enabled": True,
            },
        },
    ) as mocked:
        response = client.post(
            "/admin/sellers/42/activate",
            json={"approved": True},
        )

    assert response.status_code == 200
    assert response.json()["seller"]["system_status"] == "beta_active"
    mocked.assert_called_once_with(
        seller_id=42,
        activated_by_admin=True,
    )


def test_admin_activation_rejects_false_before_database_call() -> None:
    with patch("api.admin.sellers.activate_seller") as mocked:
        response = client.post(
            "/admin/sellers/42/activate",
            json={"approved": False},
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Aktivasyon için approved=true gönderilmelidir."
    mocked.assert_not_called()


def test_admin_activation_maps_database_not_found_to_404() -> None:
    with patch(
        "api.admin.sellers.activate_seller",
        return_value={"durum": "bulunamadı", "mesaj": "Satıcı bulunamadı."},
    ):
        response = client.post(
            "/admin/sellers/42/activate",
            json={"approved": True},
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Satıcı bulunamadı."


def test_admin_activation_maps_locked_state_to_409() -> None:
    with patch(
        "api.admin.sellers.activate_seller",
        return_value={"durum": "kilitli", "mesaj": "Aktivasyon kilitli."},
    ):
        response = client.post(
            "/admin/sellers/42/activate",
            json={"approved": True},
        )

    assert response.status_code == 409
    assert response.json()["detail"] == "Aktivasyon kilitli."


def test_seller_cannot_call_admin_activation_route() -> None:
    app.dependency_overrides.pop(require_admin, None)
    app.dependency_overrides[get_current_auth_context] = lambda: SELLER_CONTEXT

    response = client.post(
        "/admin/sellers/42/activate",
        json={"approved": True},
    )

    assert response.status_code == 403


def test_admin_activation_requires_authentication() -> None:
    app.dependency_overrides.clear()

    response = client.post(
        "/admin/sellers/42/activate",
        json={"approved": True},
    )

    assert response.status_code == 401

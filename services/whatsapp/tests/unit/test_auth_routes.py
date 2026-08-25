from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.auth import router
from auth_service import AuthContext, get_current_auth_context


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
def clear_dependencies() -> None:
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def test_auth_me_returns_trusted_context_shape() -> None:
    app.dependency_overrides[get_current_auth_context] = lambda: SELLER_CONTEXT

    response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json() == {
        "auth_user_id": "22222222-2222-2222-2222-222222222222",
        "email": "seller@example.com",
        "role": "seller",
        "status": "active",
        "seller_id": 42,
        "profile": {
            "id": 2,
            "role": "seller",
            "status": "active",
            "seller_id": 42,
        },
    }


def test_auth_me_requires_authentication() -> None:
    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_complete_invite_passes_bearer_token_to_service() -> None:
    with patch(
        "api.auth.complete_invited_profile_from_access_token",
        return_value={
            "durum": "başarılı",
            "profile": {"id": 10, "status": "active", "seller_id": 42},
        },
    ) as mocked:
        response = client.post(
            "/auth/complete-invite",
            headers={"Authorization": "Bearer invite-token"},
        )

    assert response.status_code == 200
    assert response.json()["profile"]["status"] == "active"
    mocked.assert_called_once_with("invite-token")


def test_complete_invite_requires_bearer_token_before_service_call() -> None:
    with patch("api.auth.complete_invited_profile_from_access_token") as mocked:
        response = client.post("/auth/complete-invite")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    mocked.assert_not_called()


@pytest.mark.parametrize(
    ("result", "expected_status"),
    [
        (
            {"durum": "geçersiz_token", "mesaj": "Davet oturumu geçersiz."},
            401,
        ),
        (
            {"durum": "bulunamadı", "mesaj": "Davetli profil bulunamadı."},
            404,
        ),
        (
            {"durum": "reddedildi", "mesaj": "Davet tamamlanamadı."},
            409,
        ),
        (
            {"durum": "hata", "mesaj": "Davet tamamlanamadı."},
            500,
        ),
    ],
)
def test_complete_invite_preserves_service_error_mapping(
    result: dict[str, str],
    expected_status: int,
) -> None:
    with patch(
        "api.auth.complete_invited_profile_from_access_token",
        return_value=result,
    ):
        response = client.post(
            "/auth/complete-invite",
            headers={"Authorization": "Bearer invite-token"},
        )

    assert response.status_code == expected_status
    assert response.json()["detail"] == result["mesaj"]
    if expected_status == 401:
        assert response.headers["www-authenticate"] == "Bearer"

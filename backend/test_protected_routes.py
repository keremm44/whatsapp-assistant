from __future__ import annotations

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from auth_service import AuthContext, get_current_auth_context, require_admin, require_seller
from protected_routes import router


app = FastAPI()
app.include_router(router)
client = TestClient(app)


ADMIN_CONTEXT = AuthContext(
    auth_user_id="11111111-1111-1111-1111-111111111111",
    email="admin@example.com",
    role="admin",
    profile_status="active",
    seller_id=None,
    profile={
        "id": 1,
        "role": "admin",
        "status": "active",
        "seller_id": None,
    },
    claims={"sub": "11111111-1111-1111-1111-111111111111"},
)

SELLER_CONTEXT = AuthContext(
    auth_user_id="22222222-2222-2222-2222-222222222222",
    email="seller@example.com",
    role="seller",
    profile_status="active",
    seller_id=42,
    profile={
        "id": 2,
        "role": "seller",
        "status": "active",
        "seller_id": 42,
    },
    claims={"sub": "22222222-2222-2222-2222-222222222222"},
)


def set_seller_dependencies() -> None:
    app.dependency_overrides[get_current_auth_context] = lambda: SELLER_CONTEXT
    app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT


def set_admin_dependencies() -> None:
    app.dependency_overrides[get_current_auth_context] = lambda: ADMIN_CONTEXT
    app.dependency_overrides[require_admin] = lambda: ADMIN_CONTEXT


def clear_dependencies() -> None:
    app.dependency_overrides.clear()


def test_auth_me() -> None:
    set_seller_dependencies()

    response = client.get("/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "seller"
    assert body["seller_id"] == 42

    clear_dependencies()


def test_seller_me_uses_token_seller_id() -> None:
    set_seller_dependencies()

    with patch(
        "protected_routes.get_seller_by_id",
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
    assert response.json()["seller"]["id"] == 42
    mocked.assert_called_once_with(42)

    clear_dependencies()


def test_seller_onboarding() -> None:
    set_seller_dependencies()

    with patch(
        "protected_routes.get_onboarding_status",
        return_value={
            "durum": "başarılı",
            "seller_id": 42,
            "current_onboarding_step": 1,
            "steps": [],
        },
    ) as mocked:
        response = client.get("/seller/onboarding")

    assert response.status_code == 200
    assert response.json()["seller_id"] == 42
    mocked.assert_called_once_with(42)

    clear_dependencies()


def test_start_onboarding_step() -> None:
    set_seller_dependencies()

    with patch(
        "protected_routes.start_onboarding_step",
        return_value={
            "durum": "başarılı",
            "step": {
                "seller_id": 42,
                "step_order": 1,
                "status": "in_progress",
            },
        },
    ) as mocked:
        response = client.post("/seller/onboarding/1/start")

    assert response.status_code == 200
    mocked.assert_called_once_with(
        seller_id=42,
        step_order=1,
    )

    clear_dependencies()


def test_complete_onboarding_step() -> None:
    set_seller_dependencies()

    with patch(
        "protected_routes.complete_onboarding_step",
        return_value={
            "durum": "başarılı",
            "seller_id": 42,
            "current_onboarding_step": 2,
        },
    ) as mocked:
        response = client.post(
            "/seller/onboarding/1/complete",
            json={
                "step_data": {
                    "business_name": "Test Mağaza",
                }
            },
        )

    assert response.status_code == 200
    assert response.json()["current_onboarding_step"] == 2
    mocked.assert_called_once_with(
        seller_id=42,
        step_order=1,
        step_data={
            "business_name": "Test Mağaza",
        },
    )

    clear_dependencies()


def test_locked_step_returns_409() -> None:
    set_seller_dependencies()

    with patch(
        "protected_routes.start_onboarding_step",
        return_value={
            "durum": "kilitli",
            "mesaj": "Önceki adım tamamlanmalı.",
        },
    ):
        response = client.post("/seller/onboarding/2/start")

    assert response.status_code == 409

    clear_dependencies()


def test_admin_applications() -> None:
    set_admin_dependencies()

    with patch(
        "protected_routes.get_seller_applications",
        return_value={
            "durum": "başarılı",
            "toplam": 1,
            "applications": [
                {
                    "id": 9,
                    "status": "pending",
                }
            ],
        },
    ) as mocked:
        response = client.get(
            "/admin/applications?status=pending&limit=50"
        )

    assert response.status_code == 200
    assert response.json()["toplam"] == 1
    mocked.assert_called_once_with(
        status="pending",
        limit=50,
    )

    clear_dependencies()


def test_admin_activation() -> None:
    set_admin_dependencies()

    with patch(
        "protected_routes.activate_seller",
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

    clear_dependencies()


def test_admin_activation_rejects_false() -> None:
    set_admin_dependencies()

    response = client.post(
        "/admin/sellers/42/activate",
        json={"approved": False},
    )

    assert response.status_code == 400

    clear_dependencies()


def run_all_tests() -> None:
    tests = [
        test_auth_me,
        test_seller_me_uses_token_seller_id,
        test_seller_onboarding,
        test_start_onboarding_step,
        test_complete_onboarding_step,
        test_locked_step_returns_409,
        test_admin_applications,
        test_admin_activation,
        test_admin_activation_rejects_false,
    ]

    for test in tests:
        test()
        print(f"BAŞARILI: {test.__name__}")

    print("\nTÜM PROTECTED ROUTES TESTLERİ BAŞARILI")


if __name__ == "__main__":
    run_all_tests()

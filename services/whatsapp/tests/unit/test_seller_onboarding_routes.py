from __future__ import annotations

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.seller.onboarding import router
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


def setup_function() -> None:
    app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_get_onboarding_uses_token_seller_id() -> None:
    with patch(
        "api.seller.onboarding.get_onboarding_status",
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


def test_get_onboarding_schema() -> None:
    response = client.get("/seller/onboarding/schema")

    assert response.status_code == 200
    body = response.json()
    assert body["version"] == "onboarding_v1"
    assert body["total_steps"] == 10
    assert body["steps"][0]["step_key"] == "business_info"


def test_start_onboarding_step() -> None:
    with patch(
        "api.seller.onboarding.start_onboarding_step",
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
    mocked.assert_called_once_with(seller_id=42, step_order=1)


def test_complete_onboarding_step() -> None:
    with patch(
        "api.seller.onboarding.complete_onboarding_step",
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
                    "name": "Test Satıcı",
                    "email": "seller@example.com",
                    "phone": "+905551234567",
                }
            },
        )

    assert response.status_code == 200
    assert response.json()["current_onboarding_step"] == 2
    mocked.assert_called_once_with(
        seller_id=42,
        step_order=1,
        step_data={
            "name": "Test Satıcı",
            "email": "seller@example.com",
            "phone": "+905551234567",
        },
    )


def test_onboarding_validation_error_returns_422() -> None:
    with patch(
        "api.seller.onboarding.complete_onboarding_step",
        return_value={
            "durum": "doğrulama_hatası",
            "mesaj": "Onboarding verisi doğrulanamadı.",
            "errors": [
                {
                    "field": "email",
                    "code": "value_error",
                    "message": "Geçerli bir e-posta adresi girilmelidir.",
                }
            ],
        },
    ):
        response = client.post(
            "/seller/onboarding/1/complete",
            json={"step_data": {}},
        )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["errors"][0]["field"] == "email"


def test_locked_step_returns_409() -> None:
    with patch(
        "api.seller.onboarding.start_onboarding_step",
        return_value={
            "durum": "kilitli",
            "mesaj": "Önceki adım tamamlanmalı.",
        },
    ):
        response = client.post("/seller/onboarding/2/start")

    assert response.status_code == 409


def test_step_order_out_of_range_returns_422_without_database_call() -> None:
    with patch("api.seller.onboarding.start_onboarding_step") as start_mock, patch(
        "api.seller.onboarding.complete_onboarding_step"
    ) as complete_mock:
        start_response = client.post("/seller/onboarding/11/start")
        complete_response = client.post(
            "/seller/onboarding/0/complete",
            json={"step_data": {}},
        )

    assert start_response.status_code == 422
    assert complete_response.status_code == 422
    start_mock.assert_not_called()
    complete_mock.assert_not_called()

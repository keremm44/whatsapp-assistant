from __future__ import annotations

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from public_routes import router


app = FastAPI()
app.include_router(router)
client = TestClient(app)


def marketing_payload(**overrides):
    data = {
        "name": "Ayşe Kaya",
        "storeName": "Alya Atölye",
        "phone": "0555 123 45 67",
        "category": "Kişiselleştirilmiş ürün",
        "note": "Yoğun günlerde 50 mesaj geliyor.",
    }
    data.update(overrides)
    return data


def test_public_application_accepts_marketing_form_without_auth() -> None:
    with patch(
        "public_routes.submit_public_seller_application",
        return_value={
            "ok": True,
            "received": True,
            "message": "Başvurunuz alındı.",
        },
    ) as mocked:
        response = client.post("/applications", json=marketing_payload())

    assert response.status_code == 202
    assert response.json() == {
        "received": True,
        "message": "Başvurunuz alındı.",
    }
    model = mocked.call_args.args[0]
    assert model.phone == "+905551234567"
    assert model.email is None


def test_public_application_duplicate_response_does_not_leak_duplicate_state() -> None:
    with patch(
        "public_routes.submit_public_seller_application",
        return_value={
            "ok": True,
            "received": True,
            "message": "Başvurunuz alındı.",
        },
    ):
        response = client.post("/applications", json=marketing_payload())

    assert response.status_code == 202
    assert "duplicate" not in response.text.lower()
    assert "application_id" not in response.text


def test_public_application_rejects_bad_payload_before_service() -> None:
    with patch("public_routes.submit_public_seller_application") as mocked:
        response = client.post(
            "/applications",
            json=marketing_payload(phone="12", admin_note="inject"),
        )

    assert response.status_code == 422
    mocked.assert_not_called()


def test_public_application_unavailable_maps_to_503_safe_error() -> None:
    with patch(
        "public_routes.submit_public_seller_application",
        return_value={
            "ok": False,
            "kind": "unavailable",
            "error": {
                "code": "seller_application_unavailable",
                "message": "Başvurunuz şu anda alınamıyor. Lütfen daha sonra tekrar deneyin.",
            },
        },
    ):
        response = client.post("/applications", json=marketing_payload())

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "seller_application_unavailable"

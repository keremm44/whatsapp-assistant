from __future__ import annotations

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from public_abuse_protection import PublicApplicationAbuseProtectionMiddleware
from public_routes import router


def marketing_payload() -> dict[str, str]:
    return {
        "name": "Ayşe Kaya",
        "storeName": "Alya Atölye",
        "phone": "0555 123 45 67",
        "category": "Kişiselleştirilmiş ürün",
        "note": "Yoğun günlerde 50 mesaj geliyor.",
    }


def success_result() -> dict[str, object]:
    return {
        "ok": True,
        "received": True,
        "message": "Başvurunuz alındı.",
    }


def make_client(
    *,
    max_body_bytes: int = 16 * 1024,
    rate_limit: int = 10,
    rate_window_seconds: float = 60.0,
) -> TestClient:
    app = FastAPI()
    app.add_middleware(
        PublicApplicationAbuseProtectionMiddleware,
        max_body_bytes=max_body_bytes,
        rate_limit=rate_limit,
        rate_window_seconds=rate_window_seconds,
    )
    app.include_router(router)
    return TestClient(app)


def test_normal_application_reaches_route_under_limits() -> None:
    client = make_client()

    with patch(
        "public_routes.submit_public_seller_application",
        return_value=success_result(),
    ) as mocked:
        response = client.post("/applications", json=marketing_payload())

    assert response.status_code == 202
    assert response.json()["received"] is True
    mocked.assert_called_once()


def test_oversized_application_is_rejected_before_json_service() -> None:
    client = make_client(max_body_bytes=128)
    oversized = b'{"padding":"' + (b"x" * 256) + b'"}'

    with patch("public_routes.submit_public_seller_application") as mocked:
        response = client.post(
            "/applications",
            content=oversized,
            headers={"content-type": "application/json"},
        )

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == (
        "seller_application_request_too_large"
    )
    assert response.headers["cache-control"] == "no-store"
    mocked.assert_not_called()


def test_rate_limit_blocks_burst_before_service() -> None:
    client = make_client(rate_limit=3)

    with patch(
        "public_routes.submit_public_seller_application",
        return_value=success_result(),
    ) as mocked:
        statuses = [
            client.post("/applications", json=marketing_payload()).status_code
            for _ in range(3)
        ]
        limited = client.post("/applications", json=marketing_payload())

    assert statuses == [202, 202, 202]
    assert limited.status_code == 429
    assert limited.json()["detail"]["code"] == "seller_application_rate_limited"
    assert int(limited.headers["retry-after"]) >= 1
    assert limited.headers["cache-control"] == "no-store"
    assert mocked.call_count == 3


def test_x_forwarded_for_does_not_bypass_client_bucket() -> None:
    client = make_client(rate_limit=2)

    with patch(
        "public_routes.submit_public_seller_application",
        return_value=success_result(),
    ) as mocked:
        first = client.post(
            "/applications",
            json=marketing_payload(),
            headers={"x-forwarded-for": "203.0.113.10"},
        )
        second = client.post(
            "/applications",
            json=marketing_payload(),
            headers={"x-forwarded-for": "198.51.100.20"},
        )
        third = client.post(
            "/applications",
            json=marketing_payload(),
            headers={"x-forwarded-for": "192.0.2.30"},
        )

    assert [first.status_code, second.status_code, third.status_code] == [
        202,
        202,
        429,
    ]
    assert mocked.call_count == 2


def test_other_paths_are_not_rate_limited() -> None:
    app = FastAPI()
    app.add_middleware(
        PublicApplicationAbuseProtectionMiddleware,
        rate_limit=1,
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    client = TestClient(app)

    for _ in range(3):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

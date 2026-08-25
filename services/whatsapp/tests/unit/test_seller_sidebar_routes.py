from __future__ import annotations

from unittest.mock import patch

import pytest
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


def test_sidebar_summary_returns_counts_with_seller_scope() -> None:
    result = {
        "ok": True,
        "returns_action_required": 4,
        "unanswered_open": 7,
        "paused_or_taken_over": 2,
    }
    with patch("protected_routes.get_seller_sidebar_summary", return_value=result) as mocked:
        response = client.get("/seller/sidebar-summary")

    assert response.status_code == 200
    assert response.json() == {
        "returns_action_required": 4,
        "unanswered_open": 7,
        "paused_or_taken_over": 2,
    }
    mocked.assert_called_once_with(42)


def test_sidebar_summary_requires_authentication() -> None:
    app.dependency_overrides.clear()
    response = client.get("/seller/sidebar-summary")
    assert response.status_code == 401


def test_sidebar_summary_tenant_isolation() -> None:
    # Her seller kendi seller_id'si ile çağrılmalı
    result = {
        "ok": True,
        "returns_action_required": 1,
        "unanswered_open": 2,
        "paused_or_taken_over": 3,
    }
    app.dependency_overrides[require_seller] = lambda: OTHER_SELLER_CONTEXT
    with patch("protected_routes.get_seller_sidebar_summary", return_value=result) as mocked:
        response = client.get("/seller/sidebar-summary")

    assert response.status_code == 200
    mocked.assert_called_once_with(99)
    assert response.json()["returns_action_required"] == 1


def test_sidebar_summary_maps_unavailable_to_503() -> None:
    with patch(
        "protected_routes.get_seller_sidebar_summary",
        return_value={
            "ok": False,
            "kind": "unavailable",
            "error": {"code": "seller_sidebar_unavailable", "message": "Sidebar özetine şu anda erişilemiyor."},
        },
    ):
        response = client.get("/seller/sidebar-summary")

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "seller_sidebar_unavailable"


def test_sidebar_summary_does_not_expose_internal_details() -> None:
    # Hata mesajı tenant sızdırmamalı
    with patch(
        "protected_routes.get_seller_sidebar_summary",
        return_value={
            "ok": False,
            "kind": "unavailable",
            "error": {"code": "seller_sidebar_unavailable", "message": "Sidebar özetine şu anda erişilemiyor."},
        },
    ):
        response = client.get("/seller/sidebar-summary")

    assert "tenant" not in response.text.lower()
    assert "seller_id" not in response.text.lower()


def test_sidebar_summary_is_lightweight_single_endpoint() -> None:
    # Tek endpoint üzerinden tüm sayılar dönmeli, ayrı liste çağrısı yok
    result = {
        "ok": True,
        "returns_action_required": 0,
        "unanswered_open": 0,
        "paused_or_taken_over": 0,
    }
    with patch("protected_routes.get_seller_sidebar_summary", return_value=result) as mocked:
        response = client.get("/seller/sidebar-summary")

    assert response.status_code == 200
    # sadece bir servis çağrısı; liste servisleri çağrılmamalı
    assert mocked.call_count == 1
    body = response.json()
    assert set(body.keys()) == {"returns_action_required", "unanswered_open", "paused_or_taken_over"}
    for v in body.values():
        assert isinstance(v, int)
        assert v >= 0


def test_sidebar_summary_validation_error_is_422() -> None:
    with patch(
        "protected_routes.get_seller_sidebar_summary",
        return_value={
            "ok": False,
            "kind": "validation",
            "error": {"code": "seller_sidebar_validation_error", "message": "İstek parametreleri geçersiz."},
        },
    ):
        response = client.get("/seller/sidebar-summary")

    assert response.status_code == 422

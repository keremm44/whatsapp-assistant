from __future__ import annotations

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.seller.settings import router
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


def test_get_seller_settings() -> None:
    with patch(
        "api.seller.settings.get_seller_settings",
        return_value={"ok": True, "settings": {"version": 2}},
    ):
        response = client.get("/seller/settings")
    assert response.status_code == 200
    assert response.json()["settings"]["version"] == 2


def test_patch_seller_settings_rejects_admin_fields() -> None:
    with patch("api.seller.settings.update_seller_settings") as mocked:
        response = client.patch(
            "/seller/settings",
            json={"expected_version": 1, "ai_enabled": True},
        )
    assert response.status_code == 422
    mocked.assert_not_called()


def test_patch_seller_settings_maps_conflict() -> None:
    with patch(
        "api.seller.settings.update_seller_settings",
        return_value={
            "ok": False,
            "kind": "conflict",
            "error": {"code": "seller_settings_conflict", "message": "stale"},
        },
    ):
        response = client.patch(
            "/seller/settings",
            json={"expected_version": 1, "business": {"name": "Yeni Ad"}},
        )
    assert response.status_code == 409


def test_list_rules_passes_active_filter() -> None:
    with patch(
        "api.seller.settings.list_seller_rules",
        return_value={"ok": True, "rules": []},
    ) as mocked:
        response = client.get("/seller/rules?active=true")
    assert response.status_code == 200
    assert mocked.call_args.kwargs["active"] is True


def test_create_rule_returns_201() -> None:
    with patch(
        "api.seller.settings.create_seller_rule",
        return_value={"ok": True, "rule": {"id": 7, "version": 1}},
    ):
        response = client.post(
            "/seller/rules",
            json={"trigger_text": "Kargo", "response_text": "Yarın çıkar"},
        )
    assert response.status_code == 201
    assert response.json()["rule"]["id"] == 7


def test_rule_body_cannot_write_hit_count_or_seller_id() -> None:
    with patch("api.seller.settings.create_seller_rule") as mocked:
        response = client.post(
            "/seller/rules",
            json={
                "trigger_text": "Kargo",
                "response_text": "Yarın çıkar",
                "hit_count": 999,
                "seller_id": 9,
            },
        )
    assert response.status_code == 422
    mocked.assert_not_called()


def test_patch_rule_uses_version() -> None:
    with patch(
        "api.seller.settings.update_seller_rule",
        return_value={"ok": True, "rule": {"id": 7, "version": 3}},
    ) as mocked:
        response = client.patch(
            "/seller/rules/7",
            json={"expected_version": 2, "response_text": "Yeni cevap"},
        )
    assert response.status_code == 200
    assert mocked.call_args.args[0:2] == (42, 7)


def test_delete_rule_soft_deactivate_route() -> None:
    with patch(
        "api.seller.settings.deactivate_seller_rule",
        return_value={
            "ok": True,
            "changed": True,
            "rule": {"id": 7, "is_active": False, "version": 3},
        },
    ) as mocked:
        response = client.delete("/seller/rules/7?expected_version=2")
    assert response.status_code == 200
    assert response.json()["changed"] is True
    assert mocked.call_args.args == (42, 7, 2)

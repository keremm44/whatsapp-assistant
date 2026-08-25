from __future__ import annotations

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.admin.announcements import router as admin_announcements_router
from api.seller.announcements import router as seller_announcements_router
from auth_service import AuthContext, get_current_auth_context, require_admin, require_seller


app = FastAPI()
app.include_router(admin_announcements_router)
app.include_router(seller_announcements_router)
client = TestClient(app)

ADMIN_CONTEXT = AuthContext(
    auth_user_id="11111111-1111-1111-1111-111111111111",
    email="admin@example.com",
    role="admin",
    profile_status="active",
    seller_id=None,
    profile={"id": 3, "role": "admin", "status": "active", "seller_id": None},
    claims={"sub": "11111111-1111-1111-1111-111111111111"},
)

SELLER_CONTEXT = AuthContext(
    auth_user_id="22222222-2222-2222-2222-222222222222",
    email="seller@example.com",
    role="seller",
    profile_status="active",
    seller_id=42,
    profile={"id": 5, "role": "seller", "status": "active", "seller_id": 42},
    claims={"sub": "22222222-2222-2222-2222-222222222222"},
)


def _set_admin() -> None:
    app.dependency_overrides[require_admin] = lambda: ADMIN_CONTEXT


def _set_seller() -> None:
    app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT


def _clear() -> None:
    app.dependency_overrides.clear()


def test_admin_can_publish_to_all_without_seller_ids() -> None:
    _set_admin()
    with patch(
        "api.admin.announcements.publish_announcement",
        return_value={
            "ok": True,
            "announcement": {
                "id": 8,
                "title": "Duyuru",
                "target_count": 12,
                "read_count": 0,
            },
        },
    ) as mocked:
        response = client.post(
            "/admin/announcements",
            json={
                "title": " Duyuru ",
                "message": " İçerik ",
                "audience": {"type": "ALL_SELLERS"},
            },
        )

    assert response.status_code == 201
    assert response.json()["announcement"]["target_count"] == 12
    assert mocked.call_args.args[0] == 3
    request = mocked.call_args.args[1]
    assert request.title == "Duyuru"
    assert request.audience.seller_ids is None
    _clear()


def test_admin_publish_selected_rejects_duplicate_ids_before_service() -> None:
    _set_admin()
    with patch("api.admin.announcements.publish_announcement") as mocked:
        response = client.post(
            "/admin/announcements",
            json={
                "title": "Duyuru",
                "message": "İçerik",
                "audience": {
                    "type": "SELECTED_SELLERS",
                    "seller_ids": [42, 42],
                },
            },
        )

    assert response.status_code == 422
    mocked.assert_not_called()
    _clear()


def test_admin_list_and_detail_routes_are_protected_and_paginated() -> None:
    _set_admin()
    with patch(
        "api.admin.announcements.list_admin_announcements",
        return_value={"ok": True, "total": 0, "limit": 10, "offset": 20, "announcements": []},
    ) as list_mock, patch(
        "api.admin.announcements.get_admin_announcement_item",
        return_value={"ok": True, "announcement": {"id": 8, "targets": []}},
    ) as detail_mock:
        list_response = client.get("/admin/announcements?limit=10&offset=20")
        detail_response = client.get("/admin/announcements/8")

    assert list_response.status_code == 200
    assert detail_response.status_code == 200
    list_mock.assert_called_once_with(limit=10, offset=20)
    detail_mock.assert_called_once_with(8)
    _clear()


def test_seller_list_detail_and_read_use_authenticated_seller_scope() -> None:
    _set_seller()
    with patch(
        "api.seller.announcements.list_seller_announcements",
        return_value={"ok": True, "total": 0, "limit": 5, "offset": 0, "announcements": []},
    ) as list_mock, patch(
        "api.seller.announcements.get_seller_announcement_item",
        return_value={"ok": True, "announcement": {"id": 8}},
    ) as detail_mock, patch(
        "api.seller.announcements.mark_seller_announcement_read",
        return_value={
            "ok": True,
            "announcement_id": 8,
            "is_read": True,
            "read_at": "2026-08-16T12:00:00+00:00",
            "changed": True,
        },
    ) as read_mock:
        list_response = client.get("/seller/announcements?limit=5")
        detail_response = client.get("/seller/announcements/8")
        read_response = client.post("/seller/announcements/8/read")

    assert list_response.status_code == 200
    assert detail_response.status_code == 200
    assert read_response.status_code == 200
    list_mock.assert_called_once_with(42, limit=5, offset=0)
    detail_mock.assert_called_once_with(42, 8)
    read_mock.assert_called_once_with(42, 8)
    _clear()


def test_publish_domain_validation_maps_to_422() -> None:
    _set_admin()
    with patch(
        "api.admin.announcements.publish_announcement",
        return_value={
            "ok": False,
            "kind": "validation",
            "error": {
                "code": "announcement_validation_error",
                "message": "Seçili seller kimliklerinden biri bulunamadı.",
            },
        },
    ):
        response = client.post(
            "/admin/announcements",
            json={
                "title": "Duyuru",
                "message": "İçerik",
                "audience": {
                    "type": "SELECTED_SELLERS",
                    "seller_ids": [999],
                },
            },
        )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "announcement_validation_error"
    _clear()


def test_not_found_and_unavailable_errors_map_without_leaking_details() -> None:
    _set_seller()
    with patch(
        "api.seller.announcements.get_seller_announcement_item",
        return_value={
            "ok": False,
            "kind": "not_found",
            "error": {"code": "announcement_not_found", "message": "Duyuru bulunamadı."},
        },
    ):
        not_found = client.get("/seller/announcements/999")
    with patch(
        "api.seller.announcements.mark_seller_announcement_read",
        return_value={
            "ok": False,
            "kind": "unavailable",
            "error": {
                "code": "announcement_unavailable",
                "message": "Duyuru işlemi şu anda tamamlanamıyor.",
            },
        },
    ):
        unavailable = client.post("/seller/announcements/8/read")

    assert not_found.status_code == 404
    assert not_found.json()["detail"]["code"] == "announcement_not_found"
    assert unavailable.status_code == 503
    assert "database" not in str(unavailable.json()).lower()
    _clear()


def test_seller_unread_count_uses_authenticated_seller_scope() -> None:
    _set_seller()
    with patch(
        "api.seller.announcements.get_seller_announcement_unread_count",
        return_value={"ok": True, "unread_count": 4},
    ) as count_mock:
        response = client.get("/seller/announcements/unread-count")

    assert response.status_code == 200
    assert response.json() == {"unread_count": 4}
    count_mock.assert_called_once_with(42)
    _clear()


def test_seller_cannot_use_admin_announcement_routes() -> None:
    app.dependency_overrides[get_current_auth_context] = lambda: SELLER_CONTEXT

    response = client.get("/admin/announcements")

    assert response.status_code == 403
    _clear()


def test_admin_cannot_use_seller_announcement_routes() -> None:
    app.dependency_overrides[get_current_auth_context] = lambda: ADMIN_CONTEXT

    response = client.get("/seller/announcements")

    assert response.status_code == 403
    _clear()

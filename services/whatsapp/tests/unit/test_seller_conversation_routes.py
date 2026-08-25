from __future__ import annotations

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.seller.conversations import router
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


def test_list_conversations_uses_token_seller_scope_and_filters() -> None:
    with patch(
        "api.seller.conversations.list_seller_panel_conversations",
        return_value={"ok": True, "items": [{"customer_id": 7}], "total": 1},
    ) as mocked:
        response = client.get(
            "/seller/conversations?attention_only=true&control_state=RETURN_REVIEW&limit=10&offset=5"
        )

    assert response.status_code == 200
    assert response.json() == {"items": [{"customer_id": 7}], "total": 1}
    mocked.assert_called_once_with(
        42,
        attention_only=True,
        control_state="RETURN_REVIEW",
        limit=10,
        offset=5,
    )


def test_list_conversations_v2_uses_cursor_and_strips_internal_ok() -> None:
    with patch(
        "api.seller.conversations.list_conversations_v2",
        return_value={
            "ok": True,
            "items": [{"customer_id": 8}],
            "next_cursor": "next",
        },
    ) as mocked:
        response = client.get("/seller/conversations/v2?limit=15&cursor=current")

    assert response.status_code == 200
    assert response.json() == {
        "items": [{"customer_id": 8}],
        "next_cursor": "next",
    }
    mocked.assert_called_once_with(
        42,
        attention_only=False,
        control_state=None,
        limit=15,
        cursor="current",
    )


def test_conversation_detail_preserves_pagination_contract() -> None:
    with patch(
        "api.seller.conversations.get_seller_panel_conversation_detail",
        return_value={
            "ok": True,
            "conversation": {"customer_id": 9},
            "messages": [],
        },
    ) as mocked:
        response = client.get(
            "/seller/conversations/9?message_limit=25&before_message_id=100&control_history_limit=12"
        )

    assert response.status_code == 200
    assert response.json()["conversation"]["customer_id"] == 9
    mocked.assert_called_once_with(
        42,
        9,
        message_limit=25,
        before_message_id=100,
        control_history_limit=12,
    )


def test_message_media_keeps_private_proxy_headers() -> None:
    with patch(
        "api.seller.conversations.get_seller_message_media",
        return_value={
            "ok": True,
            "content": b"image-bytes",
            "content_type": "image/jpeg",
        },
    ) as mocked:
        response = client.get("/seller/messages/55/media")

    assert response.status_code == 200
    assert response.content == b"image-bytes"
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    mocked.assert_called_once_with(42, 55)


def test_read_conversation_control_uses_seller_scope() -> None:
    with patch(
        "api.seller.conversations.read_conversation_control",
        return_value={
            "ok": True,
            "customer_id": 11,
            "control": {"state": "ASSISTANT_ACTIVE", "version": 3},
            "capabilities": {"can_take_over": True},
        },
    ) as mocked:
        response = client.get("/seller/conversations/11/control")

    assert response.status_code == 200
    assert response.json()["control"]["version"] == 3
    mocked.assert_called_once_with(42, 11)


def test_mutate_conversation_control_uses_trusted_profile_and_invalidates_cache() -> None:
    with patch(
        "api.seller.conversations.mutate_conversation_control",
        return_value={
            "ok": True,
            "customer_id": 11,
            "control": {"state": "SELLER_TAKEN_OVER", "version": 4},
            "capabilities": {"can_take_over": False},
        },
    ) as mutate_mock, patch(
        "api.seller.conversations.seller_read_cache.invalidate_seller"
    ) as invalidate_mock:
        response = client.post(
            "/seller/conversations/11/control",
            json={
                "action": "take_over",
                "expected_version": 3,
                "reason_note": " Seller devraldı ",
            },
        )

    assert response.status_code == 200
    mutate_mock.assert_called_once_with(
        seller_id=42,
        customer_id=11,
        actor_profile_id=2,
        action="take_over",
        expected_version=3,
        reason_note="Seller devraldı",
    )
    invalidate_mock.assert_called_once_with(42)


def test_control_history_preserves_limit() -> None:
    with patch(
        "api.seller.conversations.read_conversation_control_history",
        return_value={"ok": True, "customer_id": 11, "events": [{"id": 1}]},
    ) as mocked:
        response = client.get("/seller/conversations/11/control-history?limit=7")

    assert response.status_code == 200
    assert response.json()["events"] == [{"id": 1}]
    mocked.assert_called_once_with(42, 11, 7)


def test_control_conflict_maps_to_409_without_cache_invalidation() -> None:
    with patch(
        "api.seller.conversations.mutate_conversation_control",
        return_value={
            "ok": False,
            "kind": "conflict",
            "error": {
                "code": "control_version_conflict",
                "message": "Konuşmanın durumu değişti.",
            },
        },
    ), patch(
        "api.seller.conversations.seller_read_cache.invalidate_seller"
    ) as invalidate_mock:
        response = client.post(
            "/seller/conversations/11/control",
            json={"action": "take_over", "expected_version": 3},
        )

    assert response.status_code == 409
    invalidate_mock.assert_not_called()


def test_media_unsupported_maps_to_415() -> None:
    with patch(
        "api.seller.conversations.get_seller_message_media",
        return_value={
            "ok": False,
            "kind": "unsupported",
            "error": {"code": "unsupported_media", "message": "Desteklenmiyor."},
        },
    ):
        response = client.get("/seller/messages/55/media")

    assert response.status_code == 415

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import cursor_queue_repository as repository
import seller_list_v2_service as service
from api.router import router
from auth_service import (
    AuthContext,
    get_current_auth_context,
    require_seller,
)
from pagination import (
    decode_seller_list_cursor,
    encode_seller_list_cursor,
)


app = FastAPI()
app.include_router(router)
client = TestClient(app)

SELLER_CONTEXT = AuthContext(
    auth_user_id="22222222-2222-2222-2222-222222222222",
    email="seller@example.com",
    role="seller",
    profile_status="active",
    seller_id=42,
    profile={"id": 5, "role": "seller", "status": "active", "seller_id": 42},
    claims={"sub": "22222222-2222-2222-2222-222222222222"},
)
ADMIN_CONTEXT = AuthContext(
    auth_user_id="11111111-1111-1111-1111-111111111111",
    email="admin@example.com",
    role="admin",
    profile_status="active",
    seller_id=None,
    profile={"id": 3, "role": "admin", "status": "active", "seller_id": None},
    claims={"sub": "11111111-1111-1111-1111-111111111111"},
)

V2_RESPONSE_KEYS = {"items", "has_more", "next_cursor"}


# =====================================================
# ORDERS /seller/orders/v2
# =====================================================


def _order_row(row_id: int, timestamp: str, **extra: Any) -> dict[str, Any]:
    row = {
        "id": row_id,
        "seller_id": 42,
        "customer_id": 22,
        "product_id": 3,
        "product_name_snapshot": "Kişiye Özel Kupa",
        "external_order_number": f"TR{row_id:05d}",
        "customer_phone_snapshot": "+905321112233",
        "image_message_id": 100 + row_id,
        "custom_text": None,
        "status": "COLLECTING",
        "review_reason_code": None,
        "review_reason_note": None,
        "version": 1,
        "created_at": "2026-08-16T11:00:00+00:00",
        "updated_at": timestamp,
        "completed_at": None,
    }
    row.update(extra)
    return row


class FakeQuery:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.filters: list[tuple[str, str, Any]] = []

    def select(self, value: str) -> "FakeQuery":
        return self

    def eq(self, key: str, value: Any) -> "FakeQuery":
        self.filters.append(("eq", key, value))
        return self

    def lt(self, key: str, value: Any) -> "FakeQuery":
        self.filters.append(("lt", key, value))
        return self

    def order(self, key: str, *, desc: bool = False) -> "FakeQuery":
        return self

    def limit(self, value: int) -> "FakeQuery":
        self._limit = value
        return self

    def execute(self):
        rows = list(self.rows)
        for operator, key, value in self.filters:
            if operator == "eq":
                rows = [row for row in rows if row.get(key) == value]
            elif operator == "lt":
                rows = [row for row in rows if row.get(key) < value]
        limit = getattr(self, "_limit", None)
        if limit is not None:
            rows = rows[:limit]
        return SimpleNamespace(data=rows)


class FakeSupabase:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self.rows)


def _orders_e2e_rows() -> list[dict[str, Any]]:
    return [
        _order_row(3, "2026-08-16T12:03:00+00:00"),
        _order_row(2, "2026-08-16T12:02:00+00:00"),
        _order_row(1, "2026-08-16T12:01:00+00:00"),
        _order_row(4, "2026-08-16T12:00:00+00:00"),
    ]


def test_orders_v2_end_to_end_keyset_pagination(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        repository, "get_supabase", lambda: FakeSupabase(_orders_e2e_rows())
    )
    app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
    try:
        first = client.get("/seller/orders/v2?limit=3")
        assert first.status_code == 200
        body = first.json()
        assert set(body) == V2_RESPONSE_KEYS
        assert [item["id"] for item in body["items"]] == [3, 2, 1]
        assert body["has_more"] is True
        assert isinstance(body["next_cursor"], str)
        # Legacy presentation eşdeğeri korunuyor.
        assert body["items"][0]["display_status"] == "Bilgi toplanıyor"
        assert body["items"][0]["seller_action_required"] is False
        assert body["items"][0]["has_image"] is True

        second = client.get(f"/seller/orders/v2?limit=3&cursor={body['next_cursor']}")
        assert second.status_code == 200
        second_body = second.json()
        assert [item["id"] for item in second_body["items"]] == [4]
        assert second_body["has_more"] is False
        assert second_body["next_cursor"] is None

        # Üçüncü istek: has_more=false iken cursor yok → liste bitti.
        third = client.get("/seller/orders/v2?limit=3")
        assert third.status_code == 200
        assert third.json()["has_more"] is True
    finally:
        app.dependency_overrides.clear()


def test_orders_v2_cursor_fail_closed_for_other_seller() -> None:
    foreign_token = encode_seller_list_cursor(
        seller_id=43,
        queue=service.QUEUE_ORDERS,
        filters={
            "view": "all",
            "status": None,
            "product_id": None,
            "image_missing": None,
            "customer_id": None,
            "external_order_number": None,
        },
        position={"updated_at": "2026-08-16T12:00:00+00:00", "id": 9},
    )
    called = False

    def fail(*args: Any, **kwargs: Any) -> dict[str, Any]:
        nonlocal called
        called = True
        raise AssertionError("repository çağrılmamalı")

    with patch.object(service, "list_order_cursor_records", side_effect=fail):
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get(
                f"/seller/orders/v2?cursor={foreign_token}"
            )
        finally:
            app.dependency_overrides.clear()
    assert response.status_code == 422
    assert called is False


def test_orders_v2_cursor_fail_closed_for_different_filters() -> None:
    token = encode_seller_list_cursor(
        seller_id=42,
        queue=service.QUEUE_ORDERS,
        filters={
            "view": "all",
            "status": None,
            "product_id": None,
            "image_missing": None,
            "customer_id": None,
            "external_order_number": None,
        },
        position={"updated_at": "2026-08-16T12:00:00+00:00", "id": 9},
    )
    called = False

    def fail(*args: Any, **kwargs: Any) -> dict[str, Any]:
        nonlocal called
        called = True
        raise AssertionError("repository çağrılmamalı")

    with patch.object(service, "list_order_cursor_records", side_effect=fail):
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get(
                f"/seller/orders/v2?view=collecting&cursor={token}"
            )
        finally:
            app.dependency_overrides.clear()
    assert response.status_code == 422
    assert called is False


def test_orders_v2_rejects_cross_queue_cursor() -> None:
    token = encode_seller_list_cursor(
        seller_id=42,
        queue=service.QUEUE_RETURNS,
        filters={
            "view": "all",
            "customer_id": None,
            "issue_type": None,
            "external_order_number": None,
        },
        position={"updated_at": "2026-08-16T12:00:00+00:00", "id": 9},
    )
    called = False

    def fail(*args: Any, **kwargs: Any) -> dict[str, Any]:
        nonlocal called
        called = True
        raise AssertionError("repository çağrılmamalı")

    with patch.object(service, "list_order_cursor_records", side_effect=fail):
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get(f"/seller/orders/v2?cursor={token}")
        finally:
            app.dependency_overrides.clear()
    assert response.status_code == 422
    assert called is False


def test_orders_v2_rejects_garbage_cursor() -> None:
    app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
    try:
        response = client.get("/seller/orders/v2?cursor=not***base64")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422


def test_orders_v2_limit_is_bounded() -> None:
    app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
    try:
        response = client.get("/seller/orders/v2?limit=101")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422


def test_orders_v2_invalid_status_is_validation_error() -> None:
    called = False

    def fail(*args: Any, **kwargs: Any) -> dict[str, Any]:
        nonlocal called
        called = True
        raise AssertionError("repository çağrılmamalı")

    with patch.object(service, "list_order_cursor_records", side_effect=fail):
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get("/seller/orders/v2?status=NOT_A_STATUS")
        finally:
            app.dependency_overrides.clear()
    assert response.status_code == 422
    assert called is False


def test_orders_v2_repository_failure_maps_to_503() -> None:
    with patch.object(
        service,
        "list_order_cursor_records",
        return_value={"durum": "hata", "mesaj": "Sipariş listesi okunamadı."},
    ):
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get("/seller/orders/v2")
        finally:
            app.dependency_overrides.clear()
    assert response.status_code == 503


def test_orders_v2_is_not_the_id_detail_route() -> None:
    # /seller/orders/v2 exact match; /seller/orders/{order_id} int bekler.
    # V2 route tam eşleşmeyle çalışıyorsa v2 envelope döner; detail route
    # olsaydı farklı shape / hata dönerdi.
    with patch("api.seller.orders.list_orders_v2") as mocked:
        mocked.return_value = {
            "ok": True,
            "items": [],
            "has_more": False,
            "next_cursor": None,
        }
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get("/seller/orders/v2")
        finally:
            app.dependency_overrides.clear()
    assert response.status_code == 200
    assert set(response.json()) == V2_RESPONSE_KEYS


def test_admin_cannot_access_orders_v2() -> None:
    app.dependency_overrides[get_current_auth_context] = lambda: ADMIN_CONTEXT
    try:
        response = client.get("/seller/orders/v2")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403


# =====================================================
# RETURNS /seller/return-issue-requests/v2
# =====================================================


def _returns_repo_success(
    rows: list[dict[str, Any]] | None = None,
    *,
    has_more: bool = False,
) -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "requests": rows or [],
        "has_more": has_more,
        "next_position": (
            {"updated_at": "2026-08-16T12:00:00+00:00", "id": 9}
            if has_more
            else None
        ),
    }


def test_returns_v2_presents_like_legacy_list() -> None:
    row = {
        "id": 11,
        "customer_id": 22,
        "order_id": 41,
        "issue_type": "DAMAGED",
        "external_order_number_snapshot": "TR111",
        "product_name_snapshot": "Kupa",
        "reason_text": "Ürün kırık",
        "requested_quantity": 1,
        "min_quantity_snapshot": 1,
        "max_quantity_snapshot": 10,
        "quantity_limit_direction": None,
        "image_requirement_snapshot": "REQUIRED",
        "status": "SELLER_REVIEW_REQUIRED",
        "review_reason_code": None,
        "review_note": None,
        "review_required_at": "2026-08-16T12:00:00+00:00",
        "handled_at": None,
        "seller_note": None,
        "version": 2,
        "created_at": "2026-08-16T11:00:00+00:00",
        "updated_at": "2026-08-16T12:00:00+00:00",
    }
    with (
        patch.object(
            service,
            "list_return_cursor_records",
            return_value=_returns_repo_success([row]),
        ),
        patch.object(
            service,
            "get_customers_by_ids",
            return_value={
                "durum": "başarılı",
                "customers": [
                    {"id": 22, "whatsapp_number": "+905321112233"}
                ],
            },
        ),
    ):
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get("/seller/return-issue-requests/v2")
        finally:
            app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    assert set(body) == V2_RESPONSE_KEYS
    item = body["items"][0]
    assert item["customer_phone"] == "+905321112233"
    assert item["display_issue_type"]
    assert item["seller_action_required"] is True
    assert body["has_more"] is False
    assert body["next_cursor"] is None


def test_returns_v2_invalid_issue_type_is_validation_error() -> None:
    called = False

    def fail(*args: Any, **kwargs: Any) -> dict[str, Any]:
        nonlocal called
        called = True
        raise AssertionError("repository çağrılmamalı")

    with patch.object(service, "list_return_cursor_records", side_effect=fail):
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get(
                "/seller/return-issue-requests/v2?issue_type=NOT_A_TYPE"
            )
        finally:
            app.dependency_overrides.clear()
    assert response.status_code == 422
    assert called is False


def test_returns_v2_cross_tenant_cursor_rejected() -> None:
    token = encode_seller_list_cursor(
        seller_id=43,
        queue=service.QUEUE_RETURNS,
        filters={
            "view": "all",
            "customer_id": None,
            "issue_type": None,
            "external_order_number": None,
        },
        position={"updated_at": "2026-08-16T12:00:00+00:00", "id": 9},
    )
    called = False

    def fail(*args: Any, **kwargs: Any) -> dict[str, Any]:
        nonlocal called
        called = True
        raise AssertionError("repository çağrılmamalı")

    with patch.object(service, "list_return_cursor_records", side_effect=fail):
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get(
                f"/seller/return-issue-requests/v2?cursor={token}"
            )
        finally:
            app.dependency_overrides.clear()
    assert response.status_code == 422
    assert called is False


# =====================================================
# UNANSWERED /seller/unanswered-questions/v2
# =====================================================


def test_unanswered_v2_presents_like_legacy_list() -> None:
    group = {
        "id": 7,
        "canonical_question": "Kargo süresi ne kadar?",
        "status": "OPEN",
        "answer_text": None,
        "occurrence_count": 2,
        "first_seen_at": "2026-08-16T10:00:00+00:00",
        "last_seen_at": "2026-08-16T12:00:00+00:00",
        "version": 3,
    }
    with patch.object(
        service,
        "list_unanswered_cursor_records",
        return_value={
            "durum": "başarılı",
            "groups": [group],
            "has_more": False,
            "next_position": None,
        },
    ):
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get("/seller/unanswered-questions/v2")
        finally:
            app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    assert set(body) == V2_RESPONSE_KEYS
    item = body["items"][0]
    assert item == {
        "id": 7,
        "question": "Kargo süresi ne kadar?",
        "status": "OPEN",
        "answer": None,
        "occurrence_count": 2,
        "first_seen_at": "2026-08-16T10:00:00+00:00",
        "last_seen_at": "2026-08-16T12:00:00+00:00",
        "version": 3,
        "seller_action_required": True,
    }


def test_unanswered_v2_cross_tenant_cursor_rejected() -> None:
    token = encode_seller_list_cursor(
        seller_id=43,
        queue=service.QUEUE_UNANSWERED,
        filters={"view": "all"},
        position={"last_seen_at": "2026-08-16T12:00:00+00:00", "id": 9},
    )
    called = False

    def fail(*args: Any, **kwargs: Any) -> dict[str, Any]:
        nonlocal called
        called = True
        raise AssertionError("repository çağrılmamalı")

    with patch.object(service, "list_unanswered_cursor_records", side_effect=fail):
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get(f"/seller/unanswered-questions/v2?cursor={token}")
        finally:
            app.dependency_overrides.clear()
    assert response.status_code == 422
    assert called is False


# =====================================================
# CONVERSATIONS /seller/conversations/v2
# =====================================================


def _conversation_row() -> dict[str, Any]:
    return {
        "customer_id": 9,
        "customer_name": "Müşteri",
        "whatsapp_number": "+90555",
        "is_blocked": False,
        "muted_until": None,
        "is_muted": False,
        "total_messages": 4,
        "customer_last_message_at": "2026-08-16T12:00:00+00:00",
        "last_message_id": 50,
        "last_message_direction": "incoming",
        "last_message_content": "Merhaba",
        "last_message_type": "text",
        "last_message_was_auto_replied": False,
        "last_message_media_available": False,
        "last_message_created_at": "2026-08-16T12:00:00+00:00",
        "current_state": "NORMAL",
        "state_type": "normal",
        "state_updated_at": "2026-08-16T12:00:00+00:00",
        "control_state": "ASSISTANT_PAUSED",
        "control_changed_at": "2026-08-16T12:00:00+00:00",
        "control_changed_by_profile_id": 5,
        "control_reason_code": "manual_pause",
        "control_reason_note": None,
        "resume_after_message_id": None,
        "control_version": 2,
        "has_active_order": True,
        "active_order_id": 7,
        "active_order_status": "SELLER_REVIEW_REQUIRED",
        "active_order_external_order_number": "ABC-1",
        "active_order_product_name": "Kupa",
        "active_order_version": 2,
        "active_order_updated_at": "2026-08-16T11:59:00+00:00",
        "active_return_issue_id": None,
        "active_return_issue_type": None,
        "active_return_issue_status": None,
        "active_return_issue_version": None,
        "active_return_issue_updated_at": None,
        "open_unanswered_group_id": None,
        "open_unanswered_question": None,
        "open_unanswered_occurrence_count": None,
        "open_unanswered_last_seen_at": None,
        "open_unanswered_version": None,
        "needs_attention": True,
        "attention_reason": "assistant_paused",
    }


def test_conversations_v2_presents_legacy_compatible_item() -> None:
    with patch.object(
        service,
        "list_conversation_cursor_records",
        return_value={
            "durum": "başarılı",
            "items": [_conversation_row()],
            "has_more": True,
            "next_position": {
                "paused_rank": 1,
                "attention_rank": 1,
                "sort_at": "2026-08-16T12:00:00+00:00",
                "customer_id": 9,
            },
        },
    ):
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get(
                "/seller/conversations/v2?control_state=ASSISTANT_PAUSED"
            )
        finally:
            app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    assert set(body) == V2_RESPONSE_KEYS
    assert body["has_more"] is True
    assert isinstance(body["next_cursor"], str)
    item = body["items"][0]
    # Legacy parser sözleşmesi: active_order customer_id +
    # seller_action_required zorunludur.
    assert item["customer"]["id"] == 9
    assert item["active_order"]["customer_id"] == 9
    assert item["active_order"]["seller_action_required"] is True
    assert item["attention_reason"] == "assistant_paused"
    assert item["needs_attention"] is True
    # Frontend parser'ı gerektirmeyen fazla alan yok (has_active_order yok).
    assert "has_active_order" not in item


def test_conversations_v2_cursor_round_trips_through_rpc_position() -> None:
    # Endpoint'ten gelen next_cursor, aynı filtre bağlamıyla decode edilebilir.
    with patch.object(
        service,
        "list_conversation_cursor_records",
        return_value={
            "durum": "başarılı",
            "items": [_conversation_row()],
            "has_more": True,
            "next_position": {
                "paused_rank": 1,
                "attention_rank": 1,
                "sort_at": "2026-08-16T12:00:00+00:00",
                "customer_id": 9,
            },
        },
    ):
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get(
                "/seller/conversations/v2?control_state=ASSISTANT_PAUSED"
            )
            token = response.json()["next_cursor"]
        finally:
            app.dependency_overrides.clear()
    position = decode_seller_list_cursor(
        token,
        seller_id=42,
        queue=service.QUEUE_CONVERSATIONS,
        filters={"attention_only": False, "control_state": "ASSISTANT_PAUSED"},
    )
    assert position == {
        "paused_rank": 1,
        "attention_rank": 1,
        "sort_at": "2026-08-16T12:00:00+00:00",
        "customer_id": 9,
    }


def test_conversations_v2_cross_tenant_cursor_rejected() -> None:
    token = encode_seller_list_cursor(
        seller_id=43,
        queue=service.QUEUE_CONVERSATIONS,
        filters={"attention_only": False, "control_state": None},
        position={
            "paused_rank": 1,
            "attention_rank": 1,
            "sort_at": "2026-08-16T12:00:00+00:00",
            "customer_id": 9,
        },
    )
    called = False

    def fail(*args: Any, **kwargs: Any) -> dict[str, Any]:
        nonlocal called
        called = True
        raise AssertionError("repository çağrılmamalı")

    with patch.object(service, "list_conversation_cursor_records", side_effect=fail):
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get(f"/seller/conversations/v2?cursor={token}")
        finally:
            app.dependency_overrides.clear()
    assert response.status_code == 422
    assert called is False


def test_conversations_v2_repository_failure_maps_to_503() -> None:
    with patch.object(
        service,
        "list_conversation_cursor_records",
        return_value={"durum": "hata", "mesaj": "Konuşma listesi okunamadı."},
    ):
        app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
        try:
            response = client.get("/seller/conversations/v2")
        finally:
            app.dependency_overrides.clear()
    assert response.status_code == 503


# =====================================================
# PROJECTIONS
# =====================================================


def test_v2_repository_functions_use_safe_projections() -> None:
    # Yeni v2 yüzeyi select("*") kullanmıyor; repository'ye columns
    # parametresi olarak güvenli projection geçiyor.
    for columns in (
        service.ORDERS_COLUMNS,
        service.RETURNS_COLUMNS,
        service.UNANSWERED_COLUMNS,
    ):
        assert isinstance(columns, str)
        assert columns
        assert "*" not in columns
    assert "updated_at" in service.ORDERS_COLUMNS
    assert "updated_at" in service.RETURNS_COLUMNS
    assert "last_seen_at" in service.UNANSWERED_COLUMNS
    assert "id" in service.ORDERS_COLUMNS
    assert "id" in service.RETURNS_COLUMNS
    assert "id" in service.UNANSWERED_COLUMNS


def test_legacy_endpoints_still_registered_and_untouched() -> None:
    # Legacy offset endpointleri korunmalı; v2 ek yüzey.
    from main import app as full_app

    from fastapi.routing import APIRoute

    paths: set[str] = set()
    for route in full_app.routes:
        original = getattr(route, "original_router", None) or (
            route if isinstance(route, APIRoute) else None
        )
        if original is None:
            continue
        for sub in getattr(original, "routes", []):
            if isinstance(sub, APIRoute):
                paths.add(sub.path)

    for legacy in (
        "/seller/orders",
        "/seller/return-issue-requests",
        "/seller/unanswered-questions",
        "/seller/conversations",
    ):
        assert legacy in paths
    for v2 in (
        "/seller/orders/v2",
        "/seller/return-issue-requests/v2",
        "/seller/unanswered-questions/v2",
        "/seller/conversations/v2",
    ):
        assert v2 in paths


def test_cursor_queue_module_unchanged_for_legacy_v2_surface() -> None:
    # /seller/v2/* yüzeyinin kendi imzasız cursor altyapısı olduğu gibi
    # duruyor (bu görev onu değiştirmiyor).
    from pagination_cursor import decode_cursor, encode_cursor

    token = encode_cursor(
        "seller_orders_v2",
        {"view": "all"},
        {"updated_at": "2026-08-16T12:00:00+00:00", "id": 9},
    )
    assert (
        decode_cursor(token, "seller_orders_v2", {"view": "all"})
        == {"updated_at": "2026-08-16T12:00:00+00:00", "id": 9}
    )
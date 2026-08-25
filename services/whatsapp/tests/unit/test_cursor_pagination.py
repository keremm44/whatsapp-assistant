from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import cursor_queue_repository as repository
import cursor_queue_service as service
from auth_service import AuthContext, get_current_auth_context, require_seller
from cursor_queue_routes import router
from pagination_cursor import CursorError, decode_cursor, encode_cursor


def test_cursor_round_trip_and_filter_binding() -> None:
    filters = {"view": "all", "customer_id": None}
    position = {
        "updated_at": "2026-08-16T12:00:00+00:00",
        "id": 42,
    }
    token = encode_cursor("orders", filters, position)
    assert decode_cursor(token, "orders", filters) == position
    with pytest.raises(CursorError):
        decode_cursor(
            token,
            "orders",
            {"view": "collecting", "customer_id": None},
        )
    with pytest.raises(CursorError):
        decode_cursor(token, "returns", filters)


def test_malformed_cursor_rejected() -> None:
    with pytest.raises(CursorError):
        decode_cursor("not***base64", "orders", {"view": "all"})


class FakeQuery:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.filters: list[tuple[str, str, Any]] = []
        self.orders: list[tuple[str, bool]] = []
        self.limit_value: int | None = None

    def select(self, value: str):
        return self

    def eq(self, key: str, value: Any):
        self.filters.append(("eq", key, value))
        return self

    def lt(self, key: str, value: Any):
        self.filters.append(("lt", key, value))
        return self

    def order(self, key: str, *, desc: bool = False):
        self.orders.append((key, desc))
        return self

    def limit(self, value: int):
        self.limit_value = value
        return self

    def execute(self):
        rows = list(self.rows)
        for operator, key, value in self.filters:
            if operator == "eq":
                rows = [row for row in rows if row.get(key) == value]
            elif operator == "lt":
                rows = [row for row in rows if row.get(key) < value]
        for key, desc in reversed(self.orders):
            rows.sort(key=lambda row: row.get(key), reverse=desc)
        if self.limit_value is not None:
            rows = rows[: self.limit_value]
        return SimpleNamespace(data=rows)


class FakeSupabase:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self.rows)


def _row(row_id: int, timestamp: str) -> dict[str, Any]:
    return {"id": row_id, "updated_at": timestamp}


def test_keyset_page_does_not_skip_when_newer_row_is_inserted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    rows = [
        _row(3, "2026-08-16T12:03:00+00:00"),
        _row(2, "2026-08-16T12:02:00+00:00"),
        _row(1, "2026-08-16T12:01:00+00:00"),
    ]
    fake = FakeSupabase(rows)
    monkeypatch.setattr(repository, "get_supabase", lambda: fake)
    first = repository._run_keyset_table_page(
        table_name="test",
        build_query=lambda: fake.table("test").select("*"),
        time_field="updated_at",
        limit=2,
        position=None,
    )
    assert [item["id"] for item in first["items"]] == [3, 2]
    assert first["has_more"] is True

    rows.insert(0, _row(4, "2026-08-16T12:04:00+00:00"))
    second = repository._run_keyset_table_page(
        table_name="test",
        build_query=lambda: fake.table("test").select("*"),
        time_field="updated_at",
        limit=2,
        position=first["next_position"],
    )
    assert [item["id"] for item in second["items"]] == [1]
    assert not ({3, 2} & {item["id"] for item in second["items"]})


def test_keyset_uses_id_as_tie_breaker(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [
        _row(5, "2026-08-16T12:00:00+00:00"),
        _row(4, "2026-08-16T12:00:00+00:00"),
        _row(3, "2026-08-16T11:59:00+00:00"),
    ]
    fake = FakeSupabase(rows)
    monkeypatch.setattr(repository, "get_supabase", lambda: fake)
    first = repository._run_keyset_table_page(
        table_name="test",
        build_query=lambda: fake.table("test").select("*"),
        time_field="updated_at",
        limit=1,
        position=None,
    )
    second = repository._run_keyset_table_page(
        table_name="test",
        build_query=lambda: fake.table("test").select("*"),
        time_field="updated_at",
        limit=1,
        position=first["next_position"],
    )
    assert first["items"][0]["id"] == 5
    assert second["items"][0]["id"] == 4


def test_cursor_is_bound_to_order_filters_before_repository_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    filters = {
        "view": "all",
        "status": None,
        "product_id": None,
        "image_missing": None,
        "customer_id": None,
        "external_order_number": None,
    }
    token = encode_cursor(
        "seller_orders_v2",
        filters,
        {"updated_at": "2026-08-16T12:00:00+00:00", "id": 9},
    )
    called = False

    def fail(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError("repository should not be called")

    monkeypatch.setattr(service, "list_order_cursor_records", fail)
    result = service.list_orders_cursor(42, view="collecting", cursor=token)
    assert result["kind"] == "validation"
    assert called is False


def test_conversation_projection_preserves_existing_shape(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        service,
        "list_conversation_cursor_records",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "items": [
                {
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
                    "active_order_status": "COLLECTING",
                    "active_order_external_order_number": "ABC-1",
                    "active_order_product_name": "Kupa",
                    "active_order_version": 2,
                    "active_order_updated_at": "2026-08-16T11:59:00+00:00",
                    "active_return_issue_id": None,
                    "open_unanswered_group_id": None,
                    "needs_attention": True,
                    "attention_reason": "assistant_paused",
                }
            ],
            "has_more": True,
            "next_position": {
                "paused_rank": 1,
                "attention_rank": 1,
                "sort_at": "2026-08-16T12:00:00+00:00",
                "customer_id": 9,
            },
        },
    )
    result = service.list_conversations_cursor(
        42,
        control_state="ASSISTANT_PAUSED",
        limit=1,
    )
    assert result["ok"] is True
    assert result["next_cursor"]
    item = result["conversations"][0]
    assert item["customer"]["id"] == 9
    assert item["has_active_order"] is True
    assert item["active_order"]["external_order_number"] == "ABC-1"


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


def test_v2_route_is_seller_scoped_and_passes_cursor() -> None:
    app.dependency_overrides[require_seller] = lambda: SELLER_CONTEXT
    try:
        with patch(
            "cursor_queue_routes.list_conversations_cursor",
            return_value={
                "ok": True,
                "limit": 20,
                "has_more": False,
                "next_cursor": None,
                "attention_only": False,
                "control_state": "ASSISTANT_PAUSED",
                "conversations": [],
            },
        ) as mocked:
            response = client.get(
                "/seller/v2/conversations"
                "?control_state=ASSISTANT_PAUSED&cursor=abc"
            )
        assert response.status_code == 200
        mocked.assert_called_once_with(
            42,
            attention_only=False,
            control_state="ASSISTANT_PAUSED",
            limit=20,
            cursor="abc",
        )
    finally:
        app.dependency_overrides.clear()


def test_admin_cannot_access_seller_v2_queue() -> None:
    app.dependency_overrides[get_current_auth_context] = lambda: ADMIN_CONTEXT
    try:
        response = client.get("/seller/v2/orders")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_cursor_migration_adds_read_only_keyset_contracts() -> None:
    sql = Path("migrations/033_add_cursor_pagination_read_models.sql").read_text(
        encoding="utf-8"
    ).lower()
    assert "get_seller_conversation_list_cursor" in sql
    assert "get_seller_dashboard_tasks_cursor" in sql
    assert "limit (result_limit + 1)" in sql
    assert "related_entity_id < cursor_entity_id" in sql
    assert "idx_orders_seller_updated_id" in sql
    assert "idx_return_issue_requests_seller_updated_id" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql
    assert "seller_cursor_pagination_v1" in sql
    assert "create or replace function public.get_seller_conversation_list(" not in sql
    assert "create or replace function public.get_seller_dashboard_tasks(" not in sql

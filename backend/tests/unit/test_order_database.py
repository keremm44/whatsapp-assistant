from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

import database


MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "014_create_orders_and_field_definitions.sql"
)


def order_record(
    *,
    order_id: int = 1,
    status: str = database.ORDER_STATUS_COLLECTING,
    version: int = 1,
    external_order_number: str | None = None,
    product_id: int | None = None,
    image_message_id: int | None = None,
    custom_text: str | None = None,
) -> dict[str, Any]:
    return {
        "id": order_id,
        "seller_id": 11,
        "customer_id": 22,
        "product_id": product_id,
        "product_name_snapshot": None,
        "external_order_number": external_order_number,
        "customer_phone_snapshot": "+905551112244",
        "customer_note": None,
        "image_message_id": image_message_id,
        "custom_text": custom_text,
        "status": status,
        "review_reason_code": None,
        "review_reason_note": None,
        "created_from_message_id": 101,
        "last_source_message_id": None,
        "version": version,
        "created_at": "2026-08-06T12:00:00+00:00",
        "updated_at": "2026-08-06T12:00:00+00:00",
        "completed_at": None,
        "closed_at": None,
    }


def rpc_success(
    *,
    order: dict[str, Any] | None = None,
    changed: bool = True,
    created: bool | None = None,
    completed: bool | None = None,
    idempotent: bool | None = None,
    snapshot_count: int | None = None,
    race_resolved: bool | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "status": "success",
        "changed": changed,
        "order": order or order_record(),
    }
    if created is not None:
        payload["created"] = created
    if completed is not None:
        payload["completed"] = completed
    if idempotent is not None:
        payload["idempotent"] = idempotent
    if snapshot_count is not None:
        payload["snapshot_count"] = snapshot_count
    if race_resolved is not None:
        payload["race_resolved"] = race_resolved
    return payload


class FakeQuery:
    def __init__(self, data: Any) -> None:
        self.data = data
        self.filters: list[tuple[str, Any]] = []
        self.selected: str | None = None
        self.limit_value: int | None = None
        self.order_calls: list[tuple[str, bool]] = []
        self.range_call: tuple[int, int] | None = None
        self.is_calls: list[tuple[str, str]] = []
        self.not_is_calls: list[tuple[str, str]] = []
        self.insert_data: dict[str, Any] | None = None
        self.update_data: dict[str, Any] | None = None

    def insert(self, data: dict[str, Any]) -> "FakeQuery":
        self.insert_data = data
        if isinstance(self.data, Exception):
            return self
        return self

    def update(self, data: dict[str, Any]) -> "FakeQuery":
        self.update_data = data
        return self

    def upsert(self, data: dict[str, Any], on_conflict: str = "") -> "FakeQuery":
        self.insert_data = data
        return self

    def select(self, columns: str, **_kwargs: Any) -> "FakeQuery":
        self.selected = columns
        return self

    def eq(self, column: str, value: Any) -> "FakeQuery":
        self.filters.append((column, value))
        return self

    def is_(self, column: str, value: str) -> "FakeQuery":
        self.is_calls.append((column, value))
        return self

    def not_(self) -> "FakeNot":
        return FakeNot(self)

    def limit(self, value: int) -> "FakeQuery":
        self.limit_value = value
        return self

    def order(self, column: str, desc: bool = False) -> "FakeQuery":
        self.order_calls.append((column, desc))
        return self

    def range(self, start: int, end: int) -> "FakeQuery":
        self.range_call = (start, end)
        return self

    def execute(self) -> SimpleNamespace:
        if isinstance(self.data, Exception):
            raise self.data
        return SimpleNamespace(data=self.data)


class FakeNot:
    def __init__(self, parent: FakeQuery) -> None:
        self.parent = parent

    def is_(self, column: str, value: str) -> FakeQuery:
        self.parent.not_is_calls.append((column, value))
        return self.parent


class FakeRpc:
    def __init__(self, data: Any) -> None:
        self.data = data

    def execute(self) -> SimpleNamespace:
        if isinstance(self.data, Exception):
            raise self.data
        return SimpleNamespace(data=self.data)


class FakeSupabase:
    def __init__(
        self,
        *,
        table_data: Any = None,
        rpc_data: Any = None,
    ) -> None:
        self.table_data = table_data
        self.rpc_data = rpc_data
        self.table_calls: list[str] = []
        self.queries: list[FakeQuery] = []
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []

    def table(self, name: str) -> FakeQuery:
        self.table_calls.append(name)
        query = FakeQuery(self.table_data)
        self.queries.append(query)
        return query

    def rpc(self, name: str, payload: dict[str, Any]) -> FakeRpc:
        self.rpc_calls.append((name, payload))
        return FakeRpc(self.rpc_data)


def install_fake(
    monkeypatch: pytest.MonkeyPatch,
    fake: FakeSupabase,
) -> FakeSupabase:
    monkeypatch.setattr(database, "get_supabase", lambda: fake)
    return fake


# =====================================================
# MIGRATION YAPISI
# =====================================================

def test_migration_creates_required_tables() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    for table in [
        "public.products",
        "public.orders",
        "public.order_field_definitions",
        "public.order_field_snapshots",
        "public.order_field_values",
    ]:
        assert f"CREATE TABLE IF NOT EXISTS {table}" in content


def test_migration_has_single_active_order_index() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "uq_orders_one_active_per_conversation" in content
    assert "WHERE status IN ('COLLECTING', 'SELLER_REVIEW_REQUIRED')" in content


def test_migration_has_snapshot_identity_unique() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "order_field_snapshots_order_identity_unique" in content
    assert "UNIQUE (id, order_id)" in content


def test_migration_has_value_idempotency_unique() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "uq_order_field_values_idempotency" in content
    assert "order_id, field_snapshot_id, source_message_id" in content


def test_migration_has_active_field_key_unique() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "uq_order_field_definitions_active_key" in content
    assert "WHERE is_active = TRUE" in content


def test_migration_has_required_rpcs() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    for rpc in [
        "get_or_create_active_order",
        "set_order_product_and_snapshot_fields",
        "record_order_field_value",
        "update_order_core",
        "flag_order_review",
        "_recompute_order_completion",
    ]:
        assert f"CREATE OR REPLACE FUNCTION public.{rpc}" in content


def test_migration_has_version_defaults() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "version BIGINT NOT NULL DEFAULT 1" in content


def test_migration_uses_safe_delete_behavior() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    # Hard delete yok; ON DELETE SET NULL / RESTRICT / CASCADE güvenli.
    assert "ON DELETE SET NULL" in content
    assert "ON DELETE RESTRICT" in content


def test_migration_does_not_touch_conversation_control() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "conversation_control_transitions" not in content
    assert "transition_conversation_control" not in content


# =====================================================
# RPC YANIT NORMALİZASYONU
# =====================================================

def test_order_rpc_response_success(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data=rpc_success(
                order=order_record(),
                created=True,
                snapshot_count=3,
            )
        ),
    )

    result = database.get_or_create_active_order(11, 22, 101)

    assert result["durum"] == "başarılı", result
    assert result["order"]["id"] == 1
    assert result["created"] is True
    assert result["snapshot_count"] == 3
    assert fake.rpc_calls[0][0] == "get_or_create_active_order"
    assert fake.rpc_calls[0][1] == {
        "target_seller_id": 11,
        "target_customer_id": 22,
        "source_message_id": 101,
    }


def test_order_rpc_response_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake(
        monkeypatch,
        FakeSupabase(rpc_data={"status": "not_found"}),
    )

    result = database.get_or_create_active_order(11, 22, 101)

    assert result["durum"] == "bulunamadı"


def test_order_rpc_response_forbidden(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake(
        monkeypatch,
        FakeSupabase(rpc_data={"status": "forbidden"}),
    )

    result = database.get_or_create_active_order(11, 22, 101)

    assert result["durum"] == "reddedildi"


def test_order_rpc_response_conflict(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data={
                "status": "conflict",
                "order": order_record(version=3),
            }
        ),
    )

    result = database.get_or_create_active_order(11, 22, 101)

    assert result["durum"] == "çakışma"
    assert result["order"]["version"] == 3


def test_order_rpc_response_product_change_review(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_fake(
        monkeypatch,
        FakeSupabase(
            rpc_data={
                "status": "order_product_change_requires_review",
                "order": order_record(),
            }
        ),
    )

    result = database.set_order_product_and_snapshot_fields(11, 22, 1, 5)

    assert result["durum"] == "ürün_değişikliği_inceleme_gerekli"


def test_order_rpc_response_error(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake(
        monkeypatch,
        FakeSupabase(rpc_data={"status": "error", "message": "DB hatası"}),
    )

    result = database.get_or_create_active_order(11, 22, 101)

    assert result["durum"] == "hata"
    assert "DB hatası" in result["mesaj"]


def test_order_rpc_exception_normalized(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake(
        monkeypatch,
        FakeSupabase(rpc_data=RuntimeError("connection refused")),
    )

    result = database.get_or_create_active_order(11, 22, 101)

    assert result["durum"] == "hata"
    assert "connection refused" not in result["mesaj"]


def test_order_rpc_validation_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake(monkeypatch, FakeSupabase())

    result = database.get_or_create_active_order(0, 22, 101)
    assert result["durum"] == "doğrulama_hatası"

    result = database.get_or_create_active_order(11, 22, 0)
    assert result["durum"] == "doğrulama_hatası"


# =====================================================
# SİPARİŞ OKUMA
# =====================================================

def test_get_order_by_id_tenant_scoped(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(table_data=[order_record()]),
    )

    result = database.get_order_by_id(11, 1)

    assert result["durum"] == "başarılı"
    query = fake.queries[0]
    assert ("seller_id", 11) in query.filters
    assert ("id", 1) in query.filters


def test_get_order_by_id_other_tenant_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_fake(monkeypatch, FakeSupabase(table_data=[]))

    result = database.get_order_by_id(99, 1)

    assert result["durum"] == "bulunamadı"


def test_get_order_detail_returns_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        database,
        "get_order_by_id",
        lambda seller_id, order_id: {
            "durum": "başarılı",
            "order": order_record(),
        },
    )

    snapshot = {
        "id": 7,
        "order_id": 1,
        "source_definition_id": 3,
        "definition_version": 2,
        "field_key": "print_text",
        "label_snapshot": "Kupaya yazılacak isim",
        "field_type_snapshot": "short_text",
        "is_required_snapshot": True,
        "sort_order_snapshot": 10,
        "options_snapshot": [],
        "validation_snapshot": {"max_length": 40},
    }
    value = {
        "id": 9,
        "order_id": 1,
        "field_snapshot_id": 7,
        "value": "Ali",
        "source_message_id": 105,
    }

    fake = install_fake(
        monkeypatch,
        FakeSupabase(table_data=[snapshot]),
    )

    # Snapshot ve value sorguları için farklı fake veri döndür.
    def table(name: str) -> FakeQuery:
        if name == "order_field_snapshots":
            return FakeQuery([snapshot])

        if name == "order_field_values":
            return FakeQuery([value])

        return FakeQuery([])

    fake.table = table  # type: ignore[method-assign]

    result = database.get_order_detail(11, 1)

    assert result["durum"] == "başarılı", result
    assert result["fields"][0]["field_key"] == "print_text"                                                                                                                                                                                                                                    
    assert result["fields"][0]["value"] == "Ali"
    assert result["fields"][0]["completed"] is True


# =====================================================
# SİPARİŞ LİSTELEME
# =====================================================

def test_list_orders_tenant_scoped(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(table_data=[order_record()]),
    )

    result = database.list_orders(11, view="all")

    assert result["durum"] == "başarılı"
    query = fake.queries[0]
    assert ("seller_id", 11) in query.filters
    assert query.range_call == (0, 19)


def test_list_orders_action_required(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = install_fake(monkeypatch, FakeSupabase(table_data=[]))

    result = database.list_orders(11, view="action_required")

    assert result["durum"] == "başarılı"
    query = fake.queries[0]
    assert ("status", database.ORDER_STATUS_SELLER_REVIEW_REQUIRED) in query.filters


def test_list_orders_collecting(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = install_fake(monkeypatch, FakeSupabase(table_data=[]))

    result = database.list_orders(11, view="collecting")

    assert result["durum"] == "başarılı"
    query = fake.queries[0]
    assert ("status", database.ORDER_STATUS_COLLECTING) in query.filters


def test_list_orders_limit_validation(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake(monkeypatch, FakeSupabase())

    result = database.list_orders(11, view="all", limit=0)
    assert result["durum"] == "doğrulama_hatası"

    result = database.list_orders(11, view="all", limit=101)
    assert result["durum"] == "doğrulama_hatası"


def test_list_orders_invalid_view(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake(monkeypatch, FakeSupabase())

    result = database.list_orders(11, view="invalid")
    assert result["durum"] == "doğrulama_hatası"


def test_list_orders_image_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = install_fake(monkeypatch, FakeSupabase(table_data=[]))

    result = database.list_orders(11, view="all", image_missing=True)

    assert result["durum"] == "başarılı"
    query = fake.queries[0]
    assert ("image_message_id", "null") in query.is_calls


# =====================================================
# ALAN TANIMLARI
# =====================================================

def test_create_field_definition_tenant_scoped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(
            table_data=[{
                "id": 1,
                "seller_id": 11,
                "field_key": "print_text",
                "label": "Kupaya yazılacak isim",
                "field_type": "short_text",
                "is_required": True,
                "is_active": True,
                "sort_order": 10,
                "options": [],
                "validation_config": {"max_length": 40},
                "version": 1,
            }]
        ),
    )

    result = database.create_order_field_definition(
        11,
        field_key="print_text",
        label="Kupaya yazılacak isim",
        field_type="short_text",
        is_required=True,
        sort_order=10,
        validation_config={"max_length": 40},
    )

    assert result["durum"] == "başarılı"
    assert fake.table_calls[0] == "order_field_definitions"


def test_create_field_definition_invalid_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_fake(monkeypatch, FakeSupabase())

    result = database.create_order_field_definition(
        11,
        field_key="x",
        label="X",
        field_type="invalid",
        is_required=False,
        sort_order=0,
    )

    assert result["durum"] == "doğrulama_hatası"


def test_create_field_definition_duplicate_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_fake(
        monkeypatch,
        FakeSupabase(table_data=RuntimeError("duplicate key value")),
    )

    result = database.create_order_field_definition(
        11,
        field_key="print_text",
        label="X",
        field_type="short_text",
        is_required=False,
        sort_order=0,
    )

    assert result["durum"] == "çakışma"


def test_update_field_definition_optimistic_concurrency(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current = {
        "id": 1,
        "seller_id": 11,
        "field_key": "print_text",
        "label": "Eski",
        "field_type": "short_text",
        "is_required": False,
        "is_active": True,
        "sort_order": 10,
        "version": 2,
    }

    fake = install_fake(
        monkeypatch,
        FakeSupabase(table_data=[current]),
    )

    result = database.update_order_field_definition(
        11,
        1,
        expected_version=2,
        label="Yeni",
        is_required=True,
    )

    assert result["durum"] == "başarılı"
    assert fake.queries[0].filters[0] == ("id", 1)
    assert ("seller_id", 11) in fake.queries[0].filters


def test_update_field_definition_stale_version(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current = {
        "id": 1,
        "seller_id": 11,
        "field_key": "print_text",
        "label": "Eski",
        "field_type": "short_text",
        "is_required": False,
        "is_active": True,
        "sort_order": 10,
        "version": 3,
    }

    install_fake(monkeypatch, FakeSupabase(table_data=[current]))

    result = database.update_order_field_definition(
        11,
        1,
        expected_version=2,
        label="Yeni",
    )

    assert result["durum"] == "çakışma"


def test_update_field_definition_other_tenant_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_fake(monkeypatch, FakeSupabase(table_data=[]))

    result = database.update_order_field_definition(
        99,
        1,
        expected_version=1,
        label="Yeni",
    )

    assert result["durum"] == "bulunamadı"


def test_get_field_definitions_tenant_scoped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(monkeypatch, FakeSupabase(table_data=[]))

    result = database.get_order_field_definitions(11)

    assert result["durum"] == "başarılı"
    query = fake.queries[0]
    assert ("seller_id", 11) in query.filters
    assert ("is_active", True) in query.filters


def test_get_product_by_id_tenant_scoped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install_fake(
        monkeypatch,
        FakeSupabase(table_data=[{"id": 5, "seller_id": 11, "name": "Kupa"}]),
    )

    result = database.get_product_by_id(11, 5)

    assert result["durum"] == "başarılı"
    query = fake.queries[0]
    assert ("id", 5) in query.filters
    assert ("seller_id", 11) in query.filters


def test_get_product_by_id_other_tenant_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_fake(monkeypatch, FakeSupabase(table_data=[]))

    result = database.get_product_by_id(99, 5)

    assert result["durum"] == "bulunamadı"
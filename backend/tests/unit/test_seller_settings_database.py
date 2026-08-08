from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import database


class FakeQuery:
    def __init__(self, responses: list[Any]) -> None:
        self.responses = responses
        self.filters: list[tuple[str, Any]] = []
        self.updated: dict[str, Any] | None = None
        self.inserted: dict[str, Any] | None = None
        self.selected: str | None = None

    def select(self, value: str): self.selected = value; return self
    def eq(self, key: str, value: Any): self.filters.append((key, value)); return self
    def limit(self, value: int): return self
    def order(self, *args, **kwargs): return self
    def update(self, value: dict[str, Any]): self.updated = value; return self
    def insert(self, value: dict[str, Any]): self.inserted = value; return self
    def execute(self):
        value = self.responses.pop(0)
        if isinstance(value, Exception):
            raise value
        return SimpleNamespace(data=value)


class FakeRpcCall:
    def __init__(self, value: Any) -> None:
        self.value = value

    def execute(self):
        if isinstance(self.value, Exception):
            raise self.value
        return SimpleNamespace(data=self.value)


class FakeSupabase:
    def __init__(self, query: FakeQuery | None = None, rpc_value: Any = None) -> None:
        self.query = query
        self.rpc_value = rpc_value
        self.tables: list[str] = []
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []

    def table(self, name: str) -> FakeQuery:
        assert self.query is not None
        self.tables.append(name)
        return self.query

    def rpc(self, name: str, params: dict[str, Any]) -> FakeRpcCall:
        self.rpc_calls.append((name, params))
        return FakeRpcCall(self.rpc_value)


def test_settings_read_selects_safe_fields(monkeypatch) -> None:
    query = FakeQuery([[{"id": 42, "settings_version": 1}]])
    fake = FakeSupabase(query=query)
    monkeypatch.setattr(database, "get_supabase", lambda: fake)
    result = database.get_seller_settings_record(42)
    assert result["durum"] == "başarılı"
    assert "email" not in (query.selected or "")
    assert ("id", 42) in query.filters


def test_settings_update_is_tenant_and_version_scoped(monkeypatch) -> None:
    query = FakeQuery([[{"id": 42, "settings_version": 4}]])
    fake = FakeSupabase(query=query)
    monkeypatch.setattr(database, "get_supabase", lambda: fake)
    result = database.update_seller_settings_record(42, 3, seller_patch={"store_name": "Yeni"}, product_info={"order": {}})
    assert result["durum"] == "başarılı"
    assert query.updated["settings_version"] == 4
    assert ("id", 42) in query.filters
    assert ("settings_version", 3) in query.filters


def test_rule_list_uses_seller_scoped_rpc(monkeypatch) -> None:
    fake = FakeSupabase(rpc_value={"status": "success", "rules": []})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.list_seller_rule_records(42, active=True)

    assert result["durum"] == "başarılı"
    assert fake.rpc_calls == [
        (
            "get_seller_rules",
            {"target_seller_id": 42, "include_inactive": False},
        )
    ]


def test_rule_list_filters_inactive_when_requested(monkeypatch) -> None:
    fake = FakeSupabase(
        rpc_value={
            "status": "success",
            "rules": [
                {"id": 1, "is_active": True},
                {"id": 2, "is_active": False},
            ],
        }
    )
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.list_seller_rule_records(42, active=False)

    assert result["rules"] == [{"id": 2, "is_active": False}]
    assert fake.rpc_calls[0][1]["include_inactive"] is True


def test_rule_create_forces_trusted_seller_id(monkeypatch) -> None:
    fake = FakeSupabase(rpc_value={"status": "success", "changed": True, "rule": {"id": 7}})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.create_seller_rule_record(
        42,
        trigger_text="Kargo",
        response_text="Yarın",
        category="custom",
        is_active=True,
    )

    assert result["durum"] == "başarılı"
    assert fake.rpc_calls == [
        (
            "create_seller_rule",
            {
                "target_seller_id": 42,
                "trigger_text_value": "Kargo",
                "response_text_value": "Yarın",
                "category_value": "custom",
            },
        )
    ]


def test_rule_create_maps_unique_violation(monkeypatch) -> None:
    fake = FakeSupabase(rpc_value=RuntimeError("23505 duplicate key"))
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.create_seller_rule_record(
        42,
        trigger_text="Kargo",
        response_text="Yarın",
        category="custom",
        is_active=True,
    )

    assert result["durum"] == "duplicate"


def test_rule_update_filters_out_untrusted_fields(monkeypatch) -> None:
    fake = FakeSupabase(rpc_value={"status": "success", "changed": True, "rule": {"id": 7, "version": 3}})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.update_seller_rule_record(
        42,
        7,
        2,
        patch={"response_text": "Yeni", "hit_count": 999, "seller_id": 5},
    )

    assert result["durum"] == "başarılı"
    assert fake.rpc_calls == [
        (
            "update_seller_rule",
            {
                "target_seller_id": 42,
                "target_rule_id": 7,
                "expected_version": 2,
                "trigger_text_value": None,
                "response_text_value": "Yeni",
                "category_value": None,
                "is_active_value": None,
            },
        )
    ]


def test_rule_deactivate_uses_soft_delete_rpc(monkeypatch) -> None:
    fake = FakeSupabase(
        rpc_value={
            "status": "success",
            "changed": False,
            "rule": {"id": 7, "is_active": False, "version": 3},
        }
    )
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.deactivate_seller_rule_record(42, 7, 3)

    assert result["durum"] == "başarılı"
    assert result["changed"] is False
    assert fake.rpc_calls[0] == (
        "delete_seller_rule",
        {"target_seller_id": 42, "target_rule_id": 7, "expected_version": 3},
    )

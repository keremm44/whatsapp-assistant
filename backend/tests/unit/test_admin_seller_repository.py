from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import admin_seller_repository as repository


class FakeQuery:
    def __init__(self, rows: list[dict[str, Any]] | Exception) -> None:
        self.rows = rows
        self.selected: str | None = None
        self.filters: list[tuple[str, Any]] = []
        self.orders: list[tuple[str, bool]] = []
        self.limit_value: int | None = None

    def select(self, value: str):
        self.selected = value
        return self

    def eq(self, key: str, value: Any):
        self.filters.append((key, value))
        return self

    def order(self, key: str, *, desc: bool = False):
        self.orders.append((key, desc))
        return self

    def limit(self, value: int):
        self.limit_value = value
        return self

    def execute(self):
        if isinstance(self.rows, Exception):
            raise self.rows
        rows = self.rows
        for key, value in self.filters:
            rows = [row for row in rows if row.get(key) == value]
        return SimpleNamespace(data=rows)


class FakeSupabase:
    def __init__(self, query: FakeQuery) -> None:
        self.query = query
        self.tables: list[str] = []

    def table(self, name: str) -> FakeQuery:
        self.tables.append(name)
        return self.query


def seller_row(
    seller_id: int,
    name: str,
    store_name: str,
    *,
    system_status: str = "active",
) -> dict[str, Any]:
    return {
        "id": seller_id,
        "name": name,
        "store_name": store_name,
        "store_link": "https://example.com",
        "system_status": system_status,
        "onboarding_status": "completed",
        "onboarding_completed": True,
        "ai_enabled": True,
        "created_at": f"2026-08-{seller_id:02d}T10:00:00+00:00",
        "updated_at": f"2026-08-{seller_id:02d}T11:00:00+00:00",
        "email": "secret@example.com",
        "phone": "+905551234567",
        "product_info": {"secret": True},
    }


def test_list_uses_safe_projection_and_deterministic_order(monkeypatch) -> None:
    query = FakeQuery([seller_row(2, "B", "B Store"), seller_row(1, "A", "A Store")])
    fake = FakeSupabase(query)
    monkeypatch.setattr(repository, "get_supabase", lambda: fake)

    result = repository.list_admin_seller_records(limit=20, offset=0)

    assert result["durum"] == "başarılı"
    assert fake.tables == ["sellers"]
    assert query.orders == [("created_at", True), ("id", True)]
    selected = query.selected or ""
    for forbidden in ("email", "phone", "product_info", "auth_user_id"):
        assert forbidden not in selected


def test_list_search_is_case_insensitive_and_paginates_after_search(monkeypatch) -> None:
    rows = [
        seller_row(3, "Kerem", "Kuzey Atölye"),
        seller_row(2, "Ayşe", "KEREM Tasarım"),
        seller_row(1, "Başka", "Başka Mağaza"),
    ]
    query = FakeQuery(rows)
    monkeypatch.setattr(repository, "get_supabase", lambda: FakeSupabase(query))

    result = repository.list_admin_seller_records(q="  kerem  ", limit=1, offset=1)

    assert result["total"] == 2
    assert [row["id"] for row in result["sellers"]] == [2]


def test_sql_looking_search_is_plain_data(monkeypatch) -> None:
    rows = [
        seller_row(2, "Normal", "DROP TABLE Studio"),
        seller_row(1, "Başka", "Atölye"),
    ]
    query = FakeQuery(rows)
    monkeypatch.setattr(repository, "get_supabase", lambda: FakeSupabase(query))

    result = repository.list_admin_seller_records(q="DROP TABLE", limit=20, offset=0)

    assert result["durum"] == "başarılı"
    assert [row["id"] for row in result["sellers"]] == [2]
    assert query.filters == []


def test_status_filter_is_applied_as_structured_filter(monkeypatch) -> None:
    rows = [
        seller_row(2, "Aktif", "A", system_status="active"),
        seller_row(1, "Askıda", "B", system_status="suspended"),
    ]
    query = FakeQuery(rows)
    monkeypatch.setattr(repository, "get_supabase", lambda: FakeSupabase(query))

    result = repository.list_admin_seller_records(system_status="active")

    assert result["durum"] == "başarılı"
    assert query.filters == [("system_status", "active")]
    assert [row["id"] for row in result["sellers"]] == [2]


def test_detail_uses_safe_select_and_maps_not_found(monkeypatch) -> None:
    query = FakeQuery([])
    monkeypatch.setattr(repository, "get_supabase", lambda: FakeSupabase(query))

    result = repository.get_admin_seller_record(999)

    assert result["durum"] == "bulunamadı"
    assert query.filters == [("id", 999)]
    assert query.limit_value == 1
    assert "email" not in (query.selected or "")


def test_database_exception_does_not_leak_raw_error(monkeypatch) -> None:
    query = FakeQuery(RuntimeError("postgres password=secret"))
    monkeypatch.setattr(repository, "get_supabase", lambda: FakeSupabase(query))

    result = repository.list_admin_seller_records()

    assert result["durum"] == "hata"
    assert "secret" not in result["mesaj"]
    assert "password" not in result["mesaj"].lower()

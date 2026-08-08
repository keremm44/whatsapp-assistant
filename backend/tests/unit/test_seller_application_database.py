from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import database


class FakeQuery:
    def __init__(self, data: Any = None, error: Exception | None = None) -> None:
        self.data = data
        self.error = error
        self.insert_data: dict[str, Any] | None = None

    def insert(self, data: dict[str, Any]) -> "FakeQuery":
        self.insert_data = data
        return self

    def execute(self) -> SimpleNamespace:
        if self.error is not None:
            raise self.error
        return SimpleNamespace(data=self.data)


class FakeSupabase:
    def __init__(self, query: FakeQuery) -> None:
        self.query = query
        self.table_name: str | None = None

    def table(self, name: str) -> FakeQuery:
        self.table_name = name
        return self.query


def test_create_application_allows_missing_email_and_persists_category(monkeypatch) -> None:
    query = FakeQuery(data=[{"id": 11, "status": "pending"}])
    fake = FakeSupabase(query)
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.create_seller_application(
        full_name=" Ayşe Kaya ",
        email=None,
        phone="+905551234567",
        store_name=" Alya Atölye ",
        product_category=" Kupa ",
        notes=" Not ",
    )

    assert result["durum"] == "başarılı"
    assert fake.table_name == "seller_applications"
    assert query.insert_data == {
        "full_name": "Ayşe Kaya",
        "phone": "+905551234567",
        "store_name": "Alya Atölye",
        "status": "pending",
        "notes": "Not",
        "product_category": "Kupa",
    }


def test_create_application_normalizes_optional_email(monkeypatch) -> None:
    query = FakeQuery(data=[{"id": 11, "status": "pending"}])
    monkeypatch.setattr(database, "get_supabase", lambda: FakeSupabase(query))

    result = database.create_seller_application(
        full_name="Ayşe Kaya",
        email=" AYSE@EXAMPLE.COM ",
        phone="+905551234567",
        store_name="Alya Atölye",
    )

    assert result["durum"] == "başarılı"
    assert query.insert_data is not None
    assert query.insert_data["email"] == "ayse@example.com"


def test_create_application_maps_unique_violation_to_duplicate(monkeypatch) -> None:
    query = FakeQuery(error=RuntimeError("23505 duplicate key value"))
    monkeypatch.setattr(database, "get_supabase", lambda: FakeSupabase(query))

    result = database.create_seller_application(
        full_name="Ayşe Kaya",
        email=None,
        phone="+905551234567",
        store_name="Alya Atölye",
    )

    assert result["durum"] == "duplicate"


def test_create_application_rejects_blank_required_fields_without_db(monkeypatch) -> None:
    called = False

    def fail_if_called():
        nonlocal called
        called = True
        raise AssertionError("DB çağrılmamalı")

    monkeypatch.setattr(database, "get_supabase", fail_if_called)
    result = database.create_seller_application(
        full_name=" ",
        email=None,
        phone="+905551234567",
        store_name="Alya Atölye",
    )

    assert result["durum"] == "doğrulama_hatası"
    assert called is False

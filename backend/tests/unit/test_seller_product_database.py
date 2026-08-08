from __future__ import annotations

from types import SimpleNamespace

import database


class FakeRpcCall:
    def __init__(self, data):
        self._data = data

    def execute(self):
        if isinstance(self._data, Exception):
            raise self._data
        return SimpleNamespace(data=self._data)


class FakeSupabase:
    def __init__(self, data):
        self.data = data
        self.calls: list[tuple[str, dict]] = []

    def rpc(self, name: str, params: dict):
        self.calls.append((name, params))
        return FakeRpcCall(self.data)


def test_list_seller_products_uses_rpc_and_filter(monkeypatch) -> None:
    fake = FakeSupabase({"status": "success", "total": 1, "products": [{"id": 8}]})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.list_seller_product_records(42, include_inactive=True)

    assert result == {"durum": "başarılı", "total": 1, "products": [{"id": 8}]}
    assert fake.calls == [
        (
            "get_seller_products",
            {"target_seller_id": 42, "include_inactive": True},
        )
    ]


def test_create_seller_product_maps_duplicate_conflict(monkeypatch) -> None:
    fake = FakeSupabase({"status": "conflict", "reason": "duplicate_name"})
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.create_seller_product_record(42, name="Kupa")

    assert result["durum"] == "conflict"
    assert result["reason"] == "duplicate_name"
    assert fake.calls[0][0] == "create_seller_product"


def test_update_seller_product_passes_version_and_patch(monkeypatch) -> None:
    fake = FakeSupabase(
        {
            "status": "success",
            "changed": True,
            "product": {"id": 7, "name": "Yeni Kupa", "version": 3},
        }
    )
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.update_seller_product_record(
        42,
        7,
        2,
        name="Yeni Kupa",
        is_active=False,
    )

    assert result["durum"] == "başarılı"
    assert result["changed"] is True
    assert fake.calls == [
        (
            "update_seller_product",
            {
                "target_seller_id": 42,
                "target_product_id": 7,
                "expected_version": 2,
                "name_value": "Yeni Kupa",
                "is_active_value": False,
            },
        )
    ]


def test_product_rpc_error_is_fail_closed(monkeypatch) -> None:
    fake = FakeSupabase(RuntimeError("network down"))
    monkeypatch.setattr(database, "get_supabase", lambda: fake)

    result = database.list_seller_product_records(42)

    assert result["durum"] == "hata"
    assert "getirilemedi" in result["mesaj"]

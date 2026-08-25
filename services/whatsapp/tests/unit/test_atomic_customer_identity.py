from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import database.atomic_customer as customer_db


@dataclass
class _Result:
    data: Any


class _RpcQuery:
    def __init__(self, data: Any) -> None:
        self._data = data

    def execute(self) -> _Result:
        return _Result(self._data)


class _Client:
    def __init__(self, data: Any) -> None:
        self.data = data
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _RpcQuery:
        self.calls.append((name, params))
        return _RpcQuery(self.data)


def _customer() -> dict[str, Any]:
    return {
        "id": 14,
        "seller_id": 2,
        "whatsapp_number": "905551112233",
        "name": "Test",
    }


def test_atomic_customer_maps_created_and_normalizes_inputs(monkeypatch) -> None:
    client = _Client(
        {
            "status": "success",
            "created": True,
            "customer": _customer(),
        }
    )
    monkeypatch.setattr(customer_db, "get_supabase", lambda: client)

    result = customer_db.get_or_create_customer(
        seller_id=2,
        whatsapp_number=" 905551112233 ",
        name=" Test ",
    )

    assert result == {"durum": "yeni_oluşturuldu", "customer": _customer()}
    assert client.calls == [
        (
            "get_or_create_customer_identity",
            {
                "target_seller_id": 2,
                "whatsapp_number_value": "905551112233",
                "name_value": "Test",
            },
        )
    ]


def test_atomic_customer_maps_existing_identity(monkeypatch) -> None:
    client = _Client(
        {
            "status": "success",
            "created": False,
            "customer": _customer(),
        }
    )
    monkeypatch.setattr(customer_db, "get_supabase", lambda: client)

    result = customer_db.get_or_create_customer(2, "905551112233")

    assert result["durum"] == "mevcut"
    assert result["customer"]["id"] == 14


def test_atomic_customer_rejects_invalid_identity_before_rpc(monkeypatch) -> None:
    def _unexpected() -> Any:
        raise AssertionError("database must not be called")

    monkeypatch.setattr(customer_db, "get_supabase", _unexpected)

    assert customer_db.get_or_create_customer(0, "905551112233")["durum"] == "doğrulama_hatası"
    assert customer_db.get_or_create_customer(2, "   ")["durum"] == "doğrulama_hatası"


def test_atomic_customer_fails_closed_on_tenant_mismatch(monkeypatch) -> None:
    customer = _customer()
    customer["seller_id"] = 99
    client = _Client({"status": "success", "created": False, "customer": customer})
    monkeypatch.setattr(customer_db, "get_supabase", lambda: client)

    result = customer_db.get_or_create_customer(2, "905551112233")

    assert result["durum"] == "hata"


def test_atomic_customer_fails_closed_on_number_mismatch(monkeypatch) -> None:
    customer = _customer()
    customer["whatsapp_number"] = "different"
    client = _Client({"status": "success", "created": False, "customer": customer})
    monkeypatch.setattr(customer_db, "get_supabase", lambda: client)

    result = customer_db.get_or_create_customer(2, "905551112233")

    assert result["durum"] == "hata"

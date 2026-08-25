from __future__ import annotations

import pytest
from pydantic import ValidationError

import seller_product_service as service


def test_create_request_is_strict_and_trims_name() -> None:
    request = service.SellerProductCreateRequest(name="  Kupa  ")
    assert request.name == "Kupa"
    with pytest.raises(ValidationError):
        service.SellerProductCreateRequest(name="Kupa", seller_id=99)


def test_update_request_requires_mutation_and_rejects_null() -> None:
    with pytest.raises(ValidationError):
        service.SellerProductUpdateRequest(expected_version=1)
    with pytest.raises(ValidationError):
        service.SellerProductUpdateRequest(expected_version=1, is_active=None)


def test_list_products_exposes_only_public_fields(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "list_seller_product_records",
        lambda seller_id, include_inactive=False: {
            "durum": "başarılı",
            "products": [
                {
                    "id": 7,
                    "seller_id": 42,
                    "name": "Kupa",
                    "is_active": True,
                    "version": 2,
                    "created_at": "c",
                    "updated_at": "u",
                    "internal": "secret",
                }
            ],
        },
    )

    result = service.list_products(42)

    assert result["ok"] is True
    assert result["total"] == 1
    assert result["products"][0] == {
        "id": 7,
        "name": "Kupa",
        "is_active": True,
        "version": 2,
        "created_at": "c",
        "updated_at": "u",
    }


def test_duplicate_name_maps_to_conflict(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "create_seller_product_record",
        lambda seller_id, name: {
            "durum": "conflict",
            "reason": "duplicate_name",
        },
    )

    result = service.create_product(42, service.SellerProductCreateRequest(name="Kupa"))

    assert result["ok"] is False
    assert result["kind"] == "conflict"
    assert result["error"]["code"] == "seller_product_duplicate_name"


def test_stale_version_maps_to_conflict(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "update_seller_product_record",
        lambda *args, **kwargs: {
            "durum": "conflict",
            "reason": "stale_version",
            "current_version": 4,
        },
    )

    result = service.update_product(
        42,
        7,
        service.SellerProductUpdateRequest(expected_version=2, name="Yeni"),
    )

    assert result["ok"] is False
    assert result["kind"] == "conflict"
    assert result["error"]["code"] == "seller_product_conflict"


def test_update_passes_only_explicit_fields(monkeypatch) -> None:
    captured = {}

    def fake_update(seller_id, product_id, expected_version, *, name, is_active):
        captured.update(
            seller_id=seller_id,
            product_id=product_id,
            expected_version=expected_version,
            name=name,
            is_active=is_active,
        )
        return {
            "durum": "başarılı",
            "changed": True,
            "product": {"id": 7, "name": "Kupa", "is_active": False, "version": 3},
        }

    monkeypatch.setattr(service, "update_seller_product_record", fake_update)

    result = service.update_product(
        42,
        7,
        service.SellerProductUpdateRequest(expected_version=2, is_active=False),
    )

    assert result["ok"] is True
    assert captured["name"] is None
    assert captured["is_active"] is False

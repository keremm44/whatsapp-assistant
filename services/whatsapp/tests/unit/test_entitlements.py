from __future__ import annotations

import pytest
from fastapi import HTTPException

import entitlement_service
import product_auth
from api.seller import entitlements as entitlement_routes
from auth_service import AuthContext


def _seller_context(seller_id: int = 7) -> AuthContext:
    return AuthContext(
        auth_user_id="00000000-0000-0000-0000-000000000007",
        email="seller@example.com",
        role="seller",
        profile_status="active",
        seller_id=seller_id,
        profile={"id": 3, "seller_id": seller_id},
        claims={"sub": "00000000-0000-0000-0000-000000000007"},
    )


def test_list_active_seller_products_filters_non_active_and_sorts(monkeypatch) -> None:
    monkeypatch.setattr(
        entitlement_service,
        "list_seller_entitlements",
        lambda seller_id: {
            "durum": "başarılı",
            "entitlements": [
                {"product_key": "trendyol", "status": "active"},
                {"product_key": "whatsapp", "status": "active"},
                {"product_key": "legacy", "status": "suspended"},
            ],
        },
    )

    result = entitlement_service.list_active_seller_products(7)

    assert result == {
        "durum": "başarılı",
        "products": ["trendyol", "whatsapp"],
    }


def test_seller_has_active_entitlement_rejects_invalid_product_key() -> None:
    result = entitlement_service.seller_has_active_entitlement(7, "../trendyol")

    assert result["durum"] == "doğrulama_hatası"
    assert result["active"] is False


def test_product_guard_allows_active_entitlement(monkeypatch) -> None:
    monkeypatch.setattr(
        product_auth,
        "seller_has_active_entitlement",
        lambda seller_id, product_key: {"durum": "başarılı", "active": True},
    )
    dependency = product_auth.require_product_entitlement("trendyol")
    context = _seller_context()

    assert dependency(context) is context


def test_product_guard_denies_missing_entitlement(monkeypatch) -> None:
    monkeypatch.setattr(
        product_auth,
        "seller_has_active_entitlement",
        lambda seller_id, product_key: {"durum": "başarılı", "active": False},
    )
    dependency = product_auth.require_product_entitlement("trendyol")

    with pytest.raises(HTTPException) as exc_info:
        dependency(_seller_context())

    assert exc_info.value.status_code == 403


def test_product_guard_fails_closed_when_entitlements_cannot_be_read(monkeypatch) -> None:
    monkeypatch.setattr(
        product_auth,
        "seller_has_active_entitlement",
        lambda seller_id, product_key: {"durum": "hata", "active": False},
    )
    dependency = product_auth.require_product_entitlement("whatsapp")

    with pytest.raises(HTTPException) as exc_info:
        dependency(_seller_context())

    assert exc_info.value.status_code == 503


def test_entitlement_route_returns_only_active_products(monkeypatch) -> None:
    monkeypatch.setattr(
        entitlement_routes,
        "list_active_seller_products",
        lambda seller_id: {"durum": "başarılı", "products": ["whatsapp"]},
    )

    assert entitlement_routes.seller_entitlements(_seller_context()) == {
        "products": ["whatsapp"]
    }


def test_entitlement_route_does_not_fail_open(monkeypatch) -> None:
    monkeypatch.setattr(
        entitlement_routes,
        "list_active_seller_products",
        lambda seller_id: {"durum": "hata", "products": []},
    )

    with pytest.raises(HTTPException) as exc_info:
        entitlement_routes.seller_entitlements(_seller_context())

    assert exc_info.value.status_code == 503

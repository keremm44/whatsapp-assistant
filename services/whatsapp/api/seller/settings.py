from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import PositiveInt

from auth_service import AuthContext, require_seller
from seller_settings_service import (
    SellerRuleCreateRequest,
    SellerRuleUpdateRequest,
    SellerSettingsUpdateRequest,
    create_rule as create_seller_rule,
    deactivate_rule as deactivate_seller_rule,
    get_settings as get_seller_settings,
    list_rules as list_seller_rules,
    update_rule as update_seller_rule,
    update_settings as update_seller_settings,
)


ROUTE_PATHS = frozenset(
    {
        "/seller/settings",
        "/seller/rules",
        "/seller/rules/{rule_id}",
    }
)

router = APIRouter(tags=["Protected API"])


def _raise_from_seller_settings_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


@router.get("/seller/settings")
def seller_settings(
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın panelden değiştirebildiği güvenli işletme/ürün ayarlarını döndürür."""
    result = get_seller_settings(context.seller_id)
    if result.get("ok") is not True:
        _raise_from_seller_settings_service(result)
    return {"settings": result["settings"]}


@router.patch("/seller/settings")
def seller_update_settings(
    body: SellerSettingsUpdateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller ayarlarını optimistic concurrency ile günceller."""
    result = update_seller_settings(context.seller_id, body)
    if result.get("ok") is not True:
        _raise_from_seller_settings_service(result)
    return {"settings": result["settings"]}


@router.get("/seller/rules")
def seller_rules(
    active: bool | None = Query(default=None),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın hazır yanıt kurallarını listeler."""
    result = list_seller_rules(context.seller_id, active=active)
    if result.get("ok") is not True:
        _raise_from_seller_settings_service(result)
    return {"rules": result["rules"]}


@router.post("/seller/rules", status_code=status.HTTP_201_CREATED)
def seller_create_rule(
    body: SellerRuleCreateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Gelecek müşteri mesajlarında kullanılabilecek yeni hazır yanıt kuralı oluşturur."""
    result = create_seller_rule(context.seller_id, body)
    if result.get("ok") is not True:
        _raise_from_seller_settings_service(result)
    return {"rule": result["rule"]}


@router.patch("/seller/rules/{rule_id}")
def seller_update_rule(
    rule_id: PositiveInt,
    body: SellerRuleUpdateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller rule'ını tenant scope + version kontrolüyle günceller."""
    result = update_seller_rule(context.seller_id, rule_id, body)
    if result.get("ok") is not True:
        _raise_from_seller_settings_service(result)
    return {"rule": result["rule"]}


@router.delete("/seller/rules/{rule_id}")
def seller_delete_rule(
    rule_id: PositiveInt,
    expected_version: PositiveInt = Query(...),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Rule geçmişini koruyarak kuralı yalnız gelecekteki cevaplar için devre dışı bırakır."""
    result = deactivate_seller_rule(context.seller_id, rule_id, expected_version)
    if result.get("ok") is not True:
        _raise_from_seller_settings_service(result)
    return {
        "changed": result.get("changed") is True,
        "rule": result["rule"],
    }

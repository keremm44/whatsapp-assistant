from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from auth_service import AuthContext, require_seller
from entitlement_service import list_active_seller_products


router = APIRouter(tags=["Protected API"])

ROUTE_PATHS = frozenset({"/seller/entitlements"})


@router.get("/seller/entitlements")
def seller_entitlements(
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    result = list_active_seller_products(context.seller_id)
    if result.get("durum") != "başarılı":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ürün yetkileri okunamadı.",
        )

    return {"products": result["products"]}

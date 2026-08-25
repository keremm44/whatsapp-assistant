from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import PositiveInt

from auth_service import AuthContext, require_seller
from seller_product_service import (
    SellerProductCreateRequest,
    SellerProductUpdateRequest,
    create_product as create_seller_product,
    list_products as list_seller_products,
    update_product as update_seller_product,
)


ROUTE_PATHS = frozenset(
    {
        "/seller/products",
        "/seller/products/{product_id}",
    }
)

router = APIRouter(tags=["Protected API"])


def _raise_from_seller_product_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


@router.get("/seller/products")
def seller_products(
    include_inactive: bool = Query(default=False),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın ürünlerini listeler; varsayılan olarak pasif ürünleri gizler."""
    result = list_seller_products(
        context.seller_id,
        include_inactive=include_inactive,
    )
    if result.get("ok") is not True:
        _raise_from_seller_product_service(result)
    return {"products": result["products"], "total": result["total"]}


@router.post("/seller/products", status_code=status.HTTP_201_CREATED)
def seller_create_product(
    body: SellerProductCreateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller için yeni ürün oluşturur."""
    result = create_seller_product(context.seller_id, body)
    if result.get("ok") is not True:
        _raise_from_seller_product_service(result)
    return {
        "changed": result.get("changed") is True,
        "product": result["product"],
    }


@router.patch("/seller/products/{product_id}")
def seller_update_product(
    product_id: PositiveInt,
    body: SellerProductUpdateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Ürünü version kontrolüyle günceller veya is_active=false ile devre dışı bırakır."""
    result = update_seller_product(context.seller_id, product_id, body)
    if result.get("ok") is not True:
        _raise_from_seller_product_service(result)
    return {
        "changed": result.get("changed") is True,
        "product": result["product"],
    }

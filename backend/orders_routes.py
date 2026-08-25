"""
orders_routes.py — Seller sipariş ve dinamik alan tanımı endpointleri.

Route'lar:
  GET   /seller/orders
  GET   /seller/orders/v2
  GET   /seller/orders/{order_id}
  GET   /seller/order-field-definitions
  POST  /seller/order-field-definitions
  PATCH /seller/order-field-definitions/{field_id}
"""

from __future__ import annotations

import logging
import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, PositiveInt, field_validator

from auth_service import AuthContext, require_seller
from database import (
    ORDER_DISPLAY_STATUS,
    ORDER_STATUS_SELLER_REVIEW_REQUIRED,
    create_order_field_definition,
    get_order_field_definitions,
    get_product_by_id,
    update_order_field_definition,
)
from order_service import (
    get_order_with_fields,
    list_seller_orders,
    present_order_summary,
)
from seller_list_v2_service import list_orders_v2
from route_helpers import raise_from_database_result, seller_list_v2_public

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Orders"])


# ── Yardımcı ──────────────────────────────────────────────────────────────


def _raise_from_order_service(
    result: dict[str, Any],
    *,
    default_message: str,
) -> None:
    durum = result.get("durum")
    if durum == "bulunamadı":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=result.get("mesaj") or default_message,
        )
    if durum == "doğrulama_hatası":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=result.get("mesaj") or default_message,
        )
    if durum == "çakışma":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=result.get("mesaj") or default_message,
        )
    logger.error("Sipariş işlemi başarısız: durum=%r result=%r", durum, result)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=default_message,
    )


# ── Request modelleri ──────────────────────────────────────────────────────


class OrderFieldDefinitionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    product_id: int | None = Field(default=None, ge=1)
    field_key: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=120)
    field_type: str
    is_required: bool = False
    sort_order: int = Field(default=0, ge=0)
    options: list[dict[str, Any]] | None = None
    validation_config: dict[str, Any] | None = None

    @field_validator("field_key")
    @classmethod
    def validate_field_key(cls, value: str) -> str:
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", value):
            raise ValueError(
                "field_key küçük harf/rakam/alt çizgi içeren geçerli bir anahtar olmalıdır."
            )
        return value


class OrderFieldDefinitionUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    expected_version: Annotated[int, Field(strict=True, gt=0)]
    label: str | None = Field(default=None, min_length=1, max_length=120)
    is_required: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = Field(default=None, ge=0)


# ── Endpointler ────────────────────────────────────────────────────────────


@router.get("/seller/orders")
def seller_orders(
    view: str = Query(default="all", pattern="^(action_required|collecting|all)$"),
    status_filter: str | None = Query(default=None, alias="status"),
    product_id: int | None = Query(default=None, ge=1),
    image_missing: bool | None = Query(default=None),
    customer_id: int | None = Query(default=None, ge=1),
    external_order_number: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Satıcının siparişlerini tenant scope'unda listeler."""
    result = list_seller_orders(
        context.seller_id,
        view=view,
        status=status_filter,
        product_id=product_id,
        image_missing=image_missing,
        customer_id=customer_id,
        external_order_number=external_order_number,
        limit=limit,
        offset=offset,
    )
    if result.get("durum") != "başarılı":
        _raise_from_order_service(result, default_message="Siparişler okunamadı.")
    return {
        "view": view,
        "toplam": result["toplam"],
        "limit": limit,
        "offset": offset,
        "orders": [present_order_summary(order) for order in result["orders"]],
    }


@router.get("/seller/orders/v2")
def seller_orders_v2(
    view: str = Query(default="all", pattern="^(action_required|collecting|all)$"),
    status_filter: str | None = Query(default=None, alias="status"),
    product_id: int | None = Query(default=None, ge=1),
    image_missing: bool | None = Query(default=None),
    customer_id: int | None = Query(default=None, ge=1),
    external_order_number: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=2048),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Satıcının siparişlerini (updated_at, id) keyset cursor ile listeler."""
    result = list_orders_v2(
        context.seller_id,
        view=view,
        status=status_filter,
        product_id=product_id,
        image_missing=image_missing,
        customer_id=customer_id,
        external_order_number=external_order_number,
        limit=limit,
        cursor=cursor,
    )
    return seller_list_v2_public(result)


@router.get("/seller/orders/{order_id}")
def seller_order_detail(
    order_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Sipariş detayını snapshot alanları ve değerleriyle döndürür."""
    result = get_order_with_fields(context.seller_id, order_id)
    if result.get("durum") != "başarılı":
        _raise_from_order_service(result, default_message="Sipariş detayı okunamadı.")

    order = result["order"]
    status_value = order.get("status")
    display_status = ORDER_DISPLAY_STATUS.get(status_value, status_value or "Bilinmiyor")

    return {
        "order": {
            "id": order.get("id"),
            "external_order_number": order.get("external_order_number"),
            "product_id": order.get("product_id"),
            "product_name_snapshot": order.get("product_name_snapshot"),
            "customer_id": order.get("customer_id"),
            "customer_phone_snapshot": order.get("customer_phone_snapshot"),
            "customer_note": order.get("customer_note"),
            "image_message_id": order.get("image_message_id"),
            "custom_text": order.get("custom_text"),
            "status": status_value,
            "display_status": display_status,
            "review_reason_code": order.get("review_reason_code"),
            "review_reason_note": order.get("review_reason_note"),
            "created_from_message_id": order.get("created_from_message_id"),
            "last_source_message_id": order.get("last_source_message_id"),
            "version": order.get("version"),
            "created_at": order.get("created_at"),
            "updated_at": order.get("updated_at"),
            "completed_at": order.get("completed_at"),
            "closed_at": order.get("closed_at"),
            "seller_action_required": status_value == ORDER_STATUS_SELLER_REVIEW_REQUIRED,
        },
        "fields": result["fields"],
    }


@router.get("/seller/order-field-definitions")
def seller_order_field_definitions(
    product_id: int | None = Query(default=None, ge=1),
    include_inactive: bool = Query(default=False),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Satıcının dinamik alan tanımlarını listeler."""
    result = get_order_field_definitions(
        context.seller_id,
        product_id=product_id,
        include_inactive=include_inactive,
    )
    if result.get("durum") != "başarılı":
        _raise_from_order_service(result, default_message="Alan tanımları okunamadı.")
    return {"toplam": result["toplam"], "definitions": result["definitions"]}


@router.post("/seller/order-field-definitions")
def seller_create_order_field_definition(
    body: OrderFieldDefinitionCreateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Yeni dinamik alan tanımı oluşturur."""
    if body.product_id is not None:
        product_result = get_product_by_id(context.seller_id, body.product_id)
        if product_result.get("durum") != "başarılı":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ürün bu satıcı kapsamında bulunamadı.",
            )

    result = create_order_field_definition(
        context.seller_id,
        field_key=body.field_key,
        label=body.label,
        field_type=body.field_type,
        is_required=body.is_required,
        sort_order=body.sort_order,
        product_id=body.product_id,
        options=body.options,
        validation_config=body.validation_config,
    )
    if result.get("durum") != "başarılı":
        _raise_from_order_service(result, default_message="Alan tanımı oluşturulamadı.")
    return {"definition": result["definition"]}


@router.patch("/seller/order-field-definitions/{field_id}")
def seller_update_order_field_definition(
    field_id: PositiveInt,
    body: OrderFieldDefinitionUpdateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Dinamik alan tanımını optimistic concurrency ile günceller."""
    result = update_order_field_definition(
        context.seller_id,
        field_id,
        expected_version=body.expected_version,
        label=body.label,
        is_required=body.is_required,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    if result.get("durum") != "başarılı":
        _raise_from_order_service(result, default_message="Alan tanımı güncellenemedi.")
    return {"definition": result["definition"]}

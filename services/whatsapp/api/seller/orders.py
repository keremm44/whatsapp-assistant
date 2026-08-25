from __future__ import annotations

from fastapi import APIRouter

from api.partition import build_route_partition


ROUTE_PATHS = frozenset(
    {
        "/seller/orders",
        "/seller/orders/v2",
        "/seller/orders/{order_id}",
        "/seller/order-field-definitions",
        "/seller/order-field-definitions/{field_id}",
    }
)


def build_router(source_router: APIRouter) -> APIRouter:
    return build_route_partition(source_router, ROUTE_PATHS)

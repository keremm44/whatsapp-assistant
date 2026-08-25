from __future__ import annotations

from fastapi import APIRouter

from protected_routes import router as legacy_protected_router


ROUTE_PATHS = frozenset(
    {
        "/seller/products",
        "/seller/products/{product_id}",
    }
)

router = APIRouter()

for route in legacy_protected_router.routes:
    if getattr(route, "path", None) in ROUTE_PATHS:
        router.routes.append(route)

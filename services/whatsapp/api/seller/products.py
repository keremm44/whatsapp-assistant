from __future__ import annotations

from fastapi import APIRouter


ROUTE_PATHS = frozenset(
    {
        "/seller/products",
        "/seller/products/{product_id}",
    }
)


def build_router(source_router: APIRouter) -> APIRouter:
    router = APIRouter()
    for route in source_router.routes:
        if getattr(route, "path", None) in ROUTE_PATHS:
            router.routes.append(route)
    return router

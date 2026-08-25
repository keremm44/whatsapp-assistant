from __future__ import annotations

from fastapi import APIRouter

from protected_routes import router as legacy_protected_router
from api.seller.products import ROUTE_PATHS as PRODUCT_ROUTE_PATHS
from api.seller.products import build_router as build_products_router
from api.seller.settings import ROUTE_PATHS as SETTINGS_ROUTE_PATHS
from api.seller.settings import build_router as build_settings_router


_PARTITIONED_PATHS = SETTINGS_ROUTE_PATHS | PRODUCT_ROUTE_PATHS

router = APIRouter()
router.include_router(build_settings_router(legacy_protected_router))
router.include_router(build_products_router(legacy_protected_router))

# Keep every not-yet-migrated protected route behavior-identical while route
# ownership is moved domain by domain. The legacy module remains the handler
# source during this transition; later steps can move handler implementations
# without changing the public route surface.
for route in legacy_protected_router.routes:
    if getattr(route, "path", None) not in _PARTITIONED_PATHS:
        router.routes.append(route)

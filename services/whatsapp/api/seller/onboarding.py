from __future__ import annotations

from fastapi import APIRouter

from api.partition import build_route_partition


ROUTE_PATHS = frozenset(
    {
        "/seller/onboarding/schema",
        "/seller/onboarding",
        "/seller/onboarding/{step_order}/start",
        "/seller/onboarding/{step_order}/complete",
    }
)


def build_router(source_router: APIRouter) -> APIRouter:
    return build_route_partition(source_router, ROUTE_PATHS)

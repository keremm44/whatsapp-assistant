from __future__ import annotations

from fastapi import APIRouter

from api.partition import build_route_partition


ROUTE_PATHS = frozenset(
    {
        "/admin/applications",
        "/admin/applications/{application_id}/invite",
    }
)


def build_router(source_router: APIRouter) -> APIRouter:
    return build_route_partition(source_router, ROUTE_PATHS)

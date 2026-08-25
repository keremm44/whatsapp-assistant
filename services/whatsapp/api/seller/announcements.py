from __future__ import annotations

from fastapi import APIRouter

from api.partition import build_route_partition


ROUTE_PATHS = frozenset(
    {
        "/seller/announcements",
        "/seller/announcements/unread-count",
        "/seller/announcements/{announcement_id}",
        "/seller/announcements/{announcement_id}/read",
    }
)


def build_router(source_router: APIRouter) -> APIRouter:
    return build_route_partition(source_router, ROUTE_PATHS)

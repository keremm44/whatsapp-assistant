from __future__ import annotations

from fastapi import APIRouter

from api.partition import build_route_partition


ROUTE_PATHS = frozenset(
    {
        "/seller/unanswered-questions",
        "/seller/unanswered-questions/v2",
        "/seller/unanswered-questions/{group_id}",
        "/seller/unanswered-questions/{group_id}/actions",
    }
)


def build_router(source_router: APIRouter) -> APIRouter:
    return build_route_partition(source_router, ROUTE_PATHS)

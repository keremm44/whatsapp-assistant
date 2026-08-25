from __future__ import annotations

from fastapi import APIRouter

from api.partition import build_route_partition


ROUTE_PATHS = frozenset(
    {
        "/seller/conversations",
        "/seller/conversations/v2",
        "/seller/conversations/{customer_id}",
        "/seller/messages/{message_id}/media",
        "/seller/conversations/{customer_id}/control",
        "/seller/conversations/{customer_id}/control-history",
    }
)


def build_router(source_router: APIRouter) -> APIRouter:
    return build_route_partition(source_router, ROUTE_PATHS)

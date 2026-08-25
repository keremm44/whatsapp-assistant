from __future__ import annotations

from fastapi import APIRouter

from api.partition import build_route_partition


ROUTE_PATHS = frozenset(
    {
        "/seller/return-issue-requests",
        "/seller/return-issue-requests/v2",
        "/seller/return-issue-requests/{request_id}",
        "/seller/return-issue-requests/{request_id}/evidence",
        "/seller/return-issue-requests/{request_id}/actions",
        "/seller/return-issue-settings",
        "/seller/return-issue-settings/{issue_type}",
    }
)


def build_router(source_router: APIRouter) -> APIRouter:
    return build_route_partition(source_router, ROUTE_PATHS)

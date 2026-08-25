from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth_service import AuthContext, require_seller
from seller_panel_service import list_dashboard_tasks as list_seller_panel_dashboard_tasks
from seller_sidebar_service import get_seller_sidebar_summary


ROUTE_PATHS = frozenset(
    {
        "/seller/dashboard/tasks",
        "/seller/sidebar-summary",
    }
)

router = APIRouter(tags=["Protected API"])


def _raise_from_seller_panel_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def _raise_from_sidebar_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


@router.get("/seller/dashboard/tasks")
def seller_dashboard_tasks(
    task_type: str | None = Query(
        default=None,
        alias="type",
        pattern="^(return_review|order_review|unanswered_question)$",
    ),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Bugün ilgilenmeniz gerekenler iş kuyruğunu döndürür."""
    result = list_seller_panel_dashboard_tasks(
        context.seller_id,
        task_type=task_type,
        limit=limit,
        offset=offset,
    )
    if not result.get("ok"):
        _raise_from_seller_panel_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/sidebar-summary")
def seller_sidebar_summary(
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller sidebar için hafif, güvenilir action-count özetini döndürür.

    - Tek seller-scoped endpoint.
    - Liste endpointlerini çağırıp saymaz; database read model count'larını kullanır.
    - Tenant isolation AuthContext seller_id üzerinden korunur.
    """
    result = get_seller_sidebar_summary(context.seller_id)
    if not result.get("ok"):
        _raise_from_sidebar_service(result)
    return {key: value for key, value in result.items() if key != "ok"}

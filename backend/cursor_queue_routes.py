from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth_service import AuthContext, require_seller
from cursor_queue_service import (
    list_conversations_cursor,
    list_dashboard_tasks_cursor,
    list_orders_cursor,
    list_return_issues_cursor,
    list_unanswered_cursor,
)


router = APIRouter(tags=["Seller Cursor Queues"])


def _raise(result: dict[str, Any]) -> None:
    status_code = {
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(result.get("kind"), status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def _public(result: dict[str, Any]) -> dict[str, Any]:
    if not result.get("ok"):
        _raise(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/v2/conversations")
def seller_conversations_cursor(
    attention_only: bool = Query(default=False),
    control_state: Literal[
        "ASSISTANT_ACTIVE",
        "SELLER_TAKEN_OVER",
        "RETURN_REVIEW",
        "ASSISTANT_PAUSED",
    ]
    | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=2048),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    return _public(
        list_conversations_cursor(
            context.seller_id,
            attention_only=attention_only,
            control_state=control_state,
            limit=limit,
            cursor=cursor,
        )
    )


@router.get("/seller/v2/dashboard/tasks")
def seller_dashboard_tasks_cursor(
    task_type: str | None = Query(
        default=None,
        alias="type",
        pattern="^(return_review|order_review|unanswered_question)$",
    ),
    limit: int = Query(default=50, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=2048),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    return _public(
        list_dashboard_tasks_cursor(
            context.seller_id,
            task_type=task_type,
            limit=limit,
            cursor=cursor,
        )
    )


@router.get("/seller/v2/orders")
def seller_orders_cursor(
    view: str = Query(
        default="all",
        pattern="^(action_required|collecting|all)$",
    ),
    status_filter: str | None = Query(default=None, alias="status"),
    product_id: int | None = Query(default=None, ge=1),
    image_missing: bool | None = Query(default=None),
    customer_id: int | None = Query(default=None, ge=1),
    external_order_number: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=2048),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    return _public(
        list_orders_cursor(
            context.seller_id,
            view=view,
            status=status_filter,
            product_id=product_id,
            image_missing=image_missing,
            customer_id=customer_id,
            external_order_number=external_order_number,
            limit=limit,
            cursor=cursor,
        )
    )


@router.get("/seller/v2/return-issue-requests")
def seller_return_issues_cursor(
    view: str = Query(
        default="all",
        pattern="^(action_required|collecting|handled|all)$",
    ),
    customer_id: int | None = Query(default=None, ge=1),
    issue_type: str | None = Query(default=None, max_length=48),
    external_order_number: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=2048),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    return _public(
        list_return_issues_cursor(
            context.seller_id,
            view=view,
            customer_id=customer_id,
            issue_type=issue_type,
            external_order_number=external_order_number,
            limit=limit,
            cursor=cursor,
        )
    )


@router.get("/seller/v2/unanswered-questions")
def seller_unanswered_cursor(
    view: str = Query(
        default="all",
        pattern="^(action_required|answered|dismissed|all)$",
    ),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=2048),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    return _public(
        list_unanswered_cursor(
            context.seller_id,
            view=view,
            limit=limit,
            cursor=cursor,
        )
    )

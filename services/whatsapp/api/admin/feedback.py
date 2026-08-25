from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import PositiveInt

from auth_service import AuthContext, require_admin
from feedback_service import (
    AdminFeedbackUpdateRequest,
    FeedbackCategory,
    FeedbackStatus,
    get_admin_feedback as get_admin_feedback_item,
    list_admin_feedback,
    update_admin_feedback as update_admin_feedback_item,
)


ROUTE_PATHS = frozenset(
    {
        "/admin/feedback",
        "/admin/feedback/{feedback_id}",
    }
)

router = APIRouter(tags=["Protected API"])


def _raise_from_feedback_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


@router.get("/admin/feedback")
def admin_feedback_list(
    feedback_status: FeedbackStatus | None = Query(default=None, alias="status"),
    category: FeedbackCategory | None = Query(default=None),
    seller_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """Admin workflow kuyruğunu güvenli seller özeti ve filtrelerle listeler."""
    result = list_admin_feedback(
        status=feedback_status,
        category=category,
        seller_id=seller_id,
        limit=limit,
        offset=offset,
    )
    if not result.get("ok"):
        _raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/admin/feedback/{feedback_id}")
def admin_feedback_detail(
    feedback_id: PositiveInt,
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    result = get_admin_feedback_item(feedback_id)
    if not result.get("ok"):
        _raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.patch("/admin/feedback/{feedback_id}")
def admin_update_feedback(
    feedback_id: PositiveInt,
    body: AdminFeedbackUpdateRequest,
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """Admin workflow alanlarını expected_version ile atomik günceller."""
    result = update_admin_feedback_item(feedback_id, body)
    if not result.get("ok"):
        _raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import PositiveInt

from auth_service import AuthContext, require_seller
from feedback_service import (
    SellerFeedbackCreateRequest,
    get_seller_feedback as get_seller_feedback_item,
    list_seller_feedback,
    submit_feedback,
)


ROUTE_PATHS = frozenset(
    {
        "/seller/feedback",
        "/seller/feedback/{feedback_id}",
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


@router.post(
    "/seller/feedback",
    status_code=status.HTTP_201_CREATED,
)
def seller_submit_feedback(
    body: SellerFeedbackCreateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller adına kategorili feedback oluşturur; seller_id auth context'ten gelir."""
    result = submit_feedback(context.seller_id, body)
    if not result.get("ok"):
        _raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/feedback")
def seller_feedback_list(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın yalnız kendi feedback kayıtlarını en yeniden eskiye listeler."""
    result = list_seller_feedback(
        context.seller_id,
        limit=limit,
        offset=offset,
    )
    if not result.get("ok"):
        _raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/feedback/{feedback_id}")
def seller_feedback_detail(
    feedback_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Tenant dışı feedback kayıtlarını 404 olarak görünmez tutar."""
    result = get_seller_feedback_item(context.seller_id, feedback_id)
    if not result.get("ok"):
        _raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}

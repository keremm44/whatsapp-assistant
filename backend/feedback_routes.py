"""
feedback_routes.py — Seller ve admin feedback endpointleri.

Route'lar:
  POST /seller/feedback
  GET  /seller/feedback
  GET  /seller/feedback/{feedback_id}
  GET  /admin/feedback
  GET  /admin/feedback/{feedback_id}
  PATCH /admin/feedback/{feedback_id}
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import PositiveInt

from auth_service import AuthContext, require_admin, require_seller
from feedback_service import (
    AdminFeedbackUpdateRequest,
    FeedbackCategory,
    FeedbackStatus,
    SellerFeedbackCreateRequest,
    get_admin_feedback as get_admin_feedback_item,
    get_seller_feedback as get_seller_feedback_item,
    list_admin_feedback,
    list_seller_feedback,
    submit_feedback,
    update_admin_feedback as update_admin_feedback_item,
)
from route_helpers import raise_from_feedback_service

router = APIRouter(tags=["Feedback"])


@router.post("/seller/feedback", status_code=status.HTTP_201_CREATED)
def seller_submit_feedback(
    body: SellerFeedbackCreateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller adına kategorili feedback oluşturur; seller_id auth context'ten gelir."""
    result = submit_feedback(context.seller_id, body)
    if not result.get("ok"):
        raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/feedback")
def seller_feedback_list(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın yalnız kendi feedback kayıtlarını en yeniden eskiye listeler."""
    result = list_seller_feedback(context.seller_id, limit=limit, offset=offset)
    if not result.get("ok"):
        raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/feedback/{feedback_id}")
def seller_feedback_detail(
    feedback_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Tenant dışı feedback kayıtlarını 404 olarak görünmez tutar."""
    result = get_seller_feedback_item(context.seller_id, feedback_id)
    if not result.get("ok"):
        raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


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
        raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/admin/feedback/{feedback_id}")
def admin_feedback_detail(
    feedback_id: PositiveInt,
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    result = get_admin_feedback_item(feedback_id)
    if not result.get("ok"):
        raise_from_feedback_service(result)
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
        raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}

"""
analytics_routes.py — Seller analytics endpointi.

GET /seller/analytics/summary?period=week|month
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth_service import AuthContext, require_seller
from analytics_service import get_seller_analytics_summary

router = APIRouter(tags=["Analytics"])


@router.get("/seller/analytics/summary")
def seller_analytics_summary(
    period: Literal["week", "month"] = Query(default="week"),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """
    Seller'ın seçili periyot için analitik özetini döndürür.

    period=week  → son 7 gün (varsayılan)
    period=month → son 30 gün
    """
    result = get_seller_analytics_summary(context.seller_id, period=period)

    if not result.get("ok"):
        kind = result.get("kind")
        error = result.get("error", {})
        status_code = {
            "validation":  status.HTTP_422_UNPROCESSABLE_CONTENT,
            "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
        }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
        raise HTTPException(status_code=status_code, detail=error)

    return {key: value for key, value in result.items() if key != "ok"}

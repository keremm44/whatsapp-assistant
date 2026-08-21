from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import PositiveInt

from admin_seller_service import (
    AdminSellerSystemStatus,
    get_admin_seller,
    list_admin_sellers,
)
from auth_service import AuthContext, require_admin


router = APIRouter(tags=["Admin Seller Directory"])


def _raise_from_admin_seller_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


@router.get("/admin/sellers")
def admin_seller_list(
    q: str | None = Query(default=None, max_length=160),
    system_status: AdminSellerSystemStatus | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """Admin için minimal, salt-okunur seller directory listesini döndürür."""
    result = list_admin_sellers(
        q=q,
        system_status=system_status,
        limit=limit,
        offset=offset,
    )
    if not result.get("ok"):
        _raise_from_admin_seller_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/admin/sellers/{seller_id}")
def admin_seller_detail(
    seller_id: PositiveInt,
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """Tek seller'ın yalnız güvenli admin directory detayını döndürür."""
    result = get_admin_seller(seller_id)
    if not result.get("ok"):
        _raise_from_admin_seller_service(result)
    return {key: value for key, value in result.items() if key != "ok"}

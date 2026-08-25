from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import PositiveInt

from announcement_service import (
    get_seller_announcement as get_seller_announcement_item,
    get_seller_announcement_unread_count,
    list_seller_announcements,
    mark_seller_announcement_read,
)
from auth_service import AuthContext, require_seller


ROUTE_PATHS = frozenset(
    {
        "/seller/announcements",
        "/seller/announcements/unread-count",
        "/seller/announcements/{announcement_id}",
        "/seller/announcements/{announcement_id}/read",
    }
)

router = APIRouter(tags=["Protected API"])


def _raise_from_announcement_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


@router.get("/seller/announcements")
def seller_announcement_list(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın yalnız explicit hedeflendiği duyuruları tenant scope'unda listeler."""
    result = list_seller_announcements(
        context.seller_id,
        limit=limit,
        offset=offset,
    )
    if not result.get("ok"):
        _raise_from_announcement_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/announcements/unread-count")
def seller_announcement_unread_count(
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller zil rozeti için tenant-scoped gerçek okunmamış sayıyı döndürür."""
    result = get_seller_announcement_unread_count(context.seller_id)
    if not result.get("ok"):
        _raise_from_announcement_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/announcements/{announcement_id}")
def seller_announcement_detail(
    announcement_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Hedeflenmeyen veya başka tenant'a ait duyuruyu 404 olarak gizler."""
    result = get_seller_announcement_item(context.seller_id, announcement_id)
    if not result.get("ok"):
        _raise_from_announcement_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.post("/seller/announcements/{announcement_id}/read")
def seller_mark_announcement_read(
    announcement_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'a özel okundu zamanını ilk çağrıda yazar; tekrarları idempotenttir."""
    result = mark_seller_announcement_read(context.seller_id, announcement_id)
    if not result.get("ok"):
        _raise_from_announcement_service(result)
    return {key: value for key, value in result.items() if key != "ok"}

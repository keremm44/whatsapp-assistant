"""
announcements_routes.py — Admin duyuru yayımlama ve seller duyuru endpointleri.

Route'lar:
  POST /admin/announcements
  GET  /admin/announcements
  GET  /admin/announcements/{announcement_id}
  GET  /seller/announcements
  GET  /seller/announcements/unread-count
  GET  /seller/announcements/{announcement_id}
  POST /seller/announcements/{announcement_id}/read
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import PositiveInt

from auth_service import AuthContext, require_admin, require_seller
from announcement_service import (
    AdminAnnouncementCreateRequest,
    create_announcement as publish_announcement,
    get_admin_announcement as get_admin_announcement_item,
    get_seller_announcement as get_seller_announcement_item,
    get_seller_announcement_unread_count,
    list_admin_announcements,
    list_seller_announcements,
    mark_seller_announcement_read,
)
from route_helpers import raise_from_announcement_service, trusted_profile_id

router = APIRouter(tags=["Announcements"])


@router.post("/admin/announcements", status_code=status.HTTP_201_CREATED)
def admin_publish_announcement(
    body: AdminAnnouncementCreateRequest,
    context: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """Duyuru ve explicit seller hedeflerini atomik olarak hemen yayımlar."""
    result = publish_announcement(
        trusted_profile_id(context, error_code="announcement_unavailable"),
        body,
    )
    if not result.get("ok"):
        raise_from_announcement_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/admin/announcements")
def admin_announcement_list(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """Admin duyurularını hedef ve okundu sayılarıyla listeler."""
    result = list_admin_announcements(limit=limit, offset=offset)
    if not result.get("ok"):
        raise_from_announcement_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/admin/announcements/{announcement_id}")
def admin_announcement_detail(
    announcement_id: PositiveInt,
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """Admin duyuru detayını ve seçili kitle hedef özetlerini döndürür."""
    result = get_admin_announcement_item(announcement_id)
    if not result.get("ok"):
        raise_from_announcement_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/announcements/unread-count")
def seller_announcement_unread_count(
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller zil rozeti için tenant-scoped gerçek okunmamış sayıyı döndürür."""
    result = get_seller_announcement_unread_count(context.seller_id)
    if not result.get("ok"):
        raise_from_announcement_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.post("/seller/announcements/{announcement_id}/read")
def seller_mark_announcement_read(
    announcement_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'a özel okundu zamanını ilk çağrıda yazar; tekrarları idempotenttir."""
    result = mark_seller_announcement_read(context.seller_id, announcement_id)
    if not result.get("ok"):
        raise_from_announcement_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/announcements/{announcement_id}")
def seller_announcement_detail(
    announcement_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Hedeflenmeyen veya başka tenant'a ait duyuruyu 404 olarak gizler."""
    result = get_seller_announcement_item(context.seller_id, announcement_id)
    if not result.get("ok"):
        raise_from_announcement_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


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
        raise_from_announcement_service(result)
    return {key: value for key, value in result.items() if key != "ok"}

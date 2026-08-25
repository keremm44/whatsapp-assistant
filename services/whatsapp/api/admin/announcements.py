from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import PositiveInt

from announcement_service import (
    AdminAnnouncementCreateRequest,
    create_announcement as publish_announcement,
    get_admin_announcement as get_admin_announcement_item,
    list_admin_announcements,
)
from auth_service import AuthContext, require_admin


ROUTE_PATHS = frozenset(
    {
        "/admin/announcements",
        "/admin/announcements/{announcement_id}",
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


def _trusted_profile_id(
    context: AuthContext,
    *,
    error_code: str = "announcement_unavailable",
) -> int:
    profile_id = context.profile.get("id")
    if not isinstance(profile_id, int) or isinstance(profile_id, bool) or profile_id < 1:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": error_code,
                "message": "Kullanıcı profili doğrulanamadı.",
            },
        )
    return profile_id


@router.post(
    "/admin/announcements",
    status_code=status.HTTP_201_CREATED,
)
def admin_publish_announcement(
    body: AdminAnnouncementCreateRequest,
    context: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """Duyuru ve explicit seller hedeflerini atomik olarak hemen yayımlar."""
    result = publish_announcement(
        _trusted_profile_id(context, error_code="announcement_unavailable"),
        body,
    )
    if not result.get("ok"):
        _raise_from_announcement_service(result)
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
        _raise_from_announcement_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/admin/announcements/{announcement_id}")
def admin_announcement_detail(
    announcement_id: PositiveInt,
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """Admin duyuru detayını ve seçili kitle hedef özetlerini döndürür."""
    result = get_admin_announcement_item(announcement_id)
    if not result.get("ok"):
        _raise_from_announcement_service(result)
    return {key: value for key, value in result.items() if key != "ok"}

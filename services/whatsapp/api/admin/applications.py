from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import PositiveInt

from auth_service import AuthContext, require_admin
from database import get_seller_applications
from seller_invitation_service import (
    AdminSellerInvitationRequest,
    invite_seller_from_application,
)


logger = logging.getLogger(__name__)

ROUTE_PATHS = frozenset(
    {
        "/admin/applications",
        "/admin/applications/{application_id}/invite",
    }
)

router = APIRouter(tags=["Protected API"])


def _raise_from_database_result(
    result: dict[str, Any],
    *,
    default_message: str,
) -> None:
    durum = result.get("durum")

    if durum == "bulunamadı":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=result.get("mesaj") or default_message,
        )

    if durum == "doğrulama_hatası":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "message": result.get("mesaj") or default_message,
                "errors": result.get("errors") or [],
            },
        )

    if durum in {
        "kilitli",
        "sıra_hatası",
        "reddedildi",
        "admin_onayı_gerekli",
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=result.get("mesaj") or default_message,
        )

    logger.error(
        "Veritabanı işlemi başarısız: durum=%r result=%r",
        durum,
        result,
    )
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=default_message,
    )


def _raise_from_seller_invitation_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
        "partial_failure": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


@router.get("/admin/applications")
def admin_applications(
    application_status: str | None = Query(
        default=None,
        alias="status",
    ),
    limit: int = Query(default=100, ge=1, le=500),
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """Admin için satıcı başvurularını listeler."""
    result = get_seller_applications(
        status=application_status,
        limit=limit,
    )

    if result.get("durum") != "başarılı":
        _raise_from_database_result(
            result,
            default_message="Satıcı başvuruları okunamadı.",
        )

    return result


@router.post("/admin/applications/{application_id}/invite")
def admin_invite_seller_application(
    application_id: PositiveInt,
    body: AdminSellerInvitationRequest,
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """Başvuruyu seller hesabına çevirir ve Supabase Auth daveti gönderir."""
    result = invite_seller_from_application(application_id, body)
    if not result.get("ok"):
        _raise_from_seller_invitation_service(result)
    return {key: value for key, value in result.items() if key != "ok"}

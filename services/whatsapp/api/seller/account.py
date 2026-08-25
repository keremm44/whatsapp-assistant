from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from auth_service import AuthContext, require_seller
from database import get_seller_by_id


logger = logging.getLogger(__name__)

ROUTE_PATHS = frozenset({"/seller/me"})

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


@router.get("/seller/me")
def seller_me(
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Satıcının kendi işletme kaydını döndürür."""
    result = get_seller_by_id(context.seller_id)

    if result.get("durum") != "başarılı":
        _raise_from_database_result(
            result,
            default_message="Satıcı işletmesi okunamadı.",
        )

    seller = result["satıcı"]

    return {
        "seller": seller,
        "access": {
            "role": context.role,
            "seller_id": context.seller_id,
            "onboarding_completed": seller.get("onboarding_completed"),
            "system_status": seller.get("system_status"),
            "ai_enabled": seller.get("ai_enabled"),
        },
    }

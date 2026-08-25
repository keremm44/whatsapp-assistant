from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth_service import AuthContext, require_admin
from database import activate_seller


logger = logging.getLogger(__name__)

ROUTE_PATHS = frozenset({"/admin/sellers/{seller_id}/activate"})

router = APIRouter(tags=["Protected API"])


class SellerActivationRequest(BaseModel):
    approved: bool = True


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


@router.post("/admin/sellers/{seller_id}/activate")
def admin_activate_seller(
    seller_id: int,
    body: SellerActivationRequest,
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """İlk beta satıcılarını admin onayıyla aktifleştirir."""
    if not body.approved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aktivasyon için approved=true gönderilmelidir.",
        )

    result = activate_seller(
        seller_id=seller_id,
        activated_by_admin=True,
    )

    if result.get("durum") != "başarılı":
        _raise_from_database_result(
            result,
            default_message="Satıcı aktifleştirilemedi.",
        )

    return result

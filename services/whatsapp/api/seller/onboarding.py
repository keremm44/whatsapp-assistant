from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth_service import AuthContext, require_seller
from onboarding_service import get_onboarding_schema
from database import (
    complete_onboarding_step,
    get_onboarding_status,
    start_onboarding_step,
)


logger = logging.getLogger(__name__)

ROUTE_PATHS = frozenset(
    {
        "/seller/onboarding/schema",
        "/seller/onboarding",
        "/seller/onboarding/{step_order}/start",
        "/seller/onboarding/{step_order}/complete",
    }
)

router = APIRouter(tags=["Protected API"])


class OnboardingStepCompleteRequest(BaseModel):
    step_data: dict[str, Any]


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


@router.get("/seller/onboarding/schema")
def seller_onboarding_schema(
    _: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Frontend için 10 adımın doğrulama sözleşmesini döndürür."""
    return get_onboarding_schema()


@router.get("/seller/onboarding")
def seller_onboarding(
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Satıcının yalnızca kendi onboarding durumunu döndürür."""
    result = get_onboarding_status(context.seller_id)

    if result.get("durum") != "başarılı":
        _raise_from_database_result(
            result,
            default_message="Onboarding durumu okunamadı.",
        )

    return result


@router.post("/seller/onboarding/{step_order}/start")
def seller_onboarding_start(
    step_order: int,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Açık olan onboarding adımını başlatır."""
    if step_order < 1 or step_order > 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Onboarding adımı 1 ile 10 arasında olmalıdır.",
        )

    result = start_onboarding_step(
        seller_id=context.seller_id,
        step_order=step_order,
    )

    if result.get("durum") not in {"başarılı", "tamamlanmış"}:
        _raise_from_database_result(
            result,
            default_message="Onboarding adımı başlatılamadı.",
        )

    return result


@router.post("/seller/onboarding/{step_order}/complete")
def seller_onboarding_complete(
    step_order: int,
    body: OnboardingStepCompleteRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Mevcut adımı tamamlar ve sıradaki adımı açar."""
    if step_order < 1 or step_order > 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Onboarding adımı 1 ile 10 arasında olmalıdır.",
        )

    result = complete_onboarding_step(
        seller_id=context.seller_id,
        step_order=step_order,
        step_data=body.step_data,
    )

    if result.get("durum") != "başarılı":
        _raise_from_database_result(
            result,
            default_message="Onboarding adımı tamamlanamadı.",
        )

    return result

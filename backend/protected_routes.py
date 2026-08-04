from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from auth_service import AuthContext, get_current_auth_context, require_admin, require_seller
from database import (
    activate_seller,
    complete_onboarding_step,
    get_onboarding_status,
    get_seller_applications,
    get_seller_by_id,
    start_onboarding_step,
)


router = APIRouter(tags=["Protected API"])


class OnboardingStepCompleteRequest(BaseModel):
    step_data: dict[str, Any] = Field(default_factory=dict)


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

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=result.get("mesaj") or default_message,
    )


@router.get("/auth/me")
def auth_me(
    context: AuthContext = Depends(get_current_auth_context),
) -> dict[str, Any]:
    """Giriş yapan kullanıcının güvenilir uygulama kimliğini döndürür."""
    return {
        "auth_user_id": context.auth_user_id,
        "email": context.email,
        "role": context.role,
        "status": context.profile_status,
        "seller_id": context.seller_id,
        "profile": context.profile,
    }


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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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

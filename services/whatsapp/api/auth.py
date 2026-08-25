from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials

from auth_service import (
    AuthContext,
    _extract_access_token,
    bearer_scheme,
    complete_invited_profile_from_access_token,
    get_current_auth_context,
)


ROUTE_PATHS = frozenset(
    {
        "/auth/complete-invite",
        "/auth/me",
    }
)

router = APIRouter(tags=["Protected API"])


@router.post("/auth/complete-invite")
def complete_invite(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
) -> dict[str, Any]:
    """Geçerli davet oturumunu uygulama profilinde aktif eder."""
    access_token = _extract_access_token(credentials)
    result = complete_invited_profile_from_access_token(access_token)

    if result.get("durum") == "başarılı":
        return result

    if result.get("durum") == "geçersiz_token":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=result.get("mesaj") or "Davet oturumu geçersiz.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if result.get("durum") == "bulunamadı":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=result.get("mesaj") or "Davetli profil bulunamadı.",
        )

    if result.get("durum") == "reddedildi":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=result.get("mesaj") or "Davet tamamlanamadı.",
        )

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=result.get("mesaj") or "Davet tamamlanamadı.",
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

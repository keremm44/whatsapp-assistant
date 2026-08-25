"""
seller_core_routes.py — Auth, seller kimlik, ayarlar, kurallar, ürünler,
onboarding ve admin uygulamaları endpointleri.

Route'lar:
  POST /auth/complete-invite
  GET  /auth/me
  GET  /seller/me
  GET  /seller/settings
  PATCH /seller/settings
  GET  /seller/rules
  POST /seller/rules
  PATCH /seller/rules/{rule_id}
  DELETE /seller/rules/{rule_id}
  GET  /seller/products
  POST /seller/products
  PATCH /seller/products/{product_id}
  GET  /seller/onboarding/schema
  GET  /seller/onboarding
  POST /seller/onboarding/{step_order}/start
  POST /seller/onboarding/{step_order}/complete
  GET  /admin/applications
  POST /admin/applications/{application_id}/invite
  POST /admin/sellers/{seller_id}/activate
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, PositiveInt

from auth_service import (
    AuthContext,
    _extract_access_token,
    bearer_scheme,
    complete_invited_profile_from_access_token,
    get_current_auth_context,
    require_admin,
    require_seller,
)
from database import (
    activate_seller,
    complete_onboarding_step,
    get_onboarding_status,
    get_seller_applications,
    get_seller_by_id,
    start_onboarding_step,
)
from onboarding_service import get_onboarding_schema
from seller_invitation_service import (
    AdminSellerInvitationRequest,
    invite_seller_from_application,
)
from seller_product_service import (
    SellerProductCreateRequest,
    SellerProductUpdateRequest,
    create_product as create_seller_product,
    list_products as list_seller_products,
    update_product as update_seller_product,
)
from seller_settings_service import (
    SellerRuleCreateRequest,
    SellerRuleUpdateRequest,
    SellerSettingsUpdateRequest,
    create_rule as create_seller_rule,
    deactivate_rule as deactivate_seller_rule,
    get_settings as get_seller_settings,
    list_rules as list_seller_rules,
    update_rule as update_seller_rule,
    update_settings as update_seller_settings,
)
from route_helpers import (
    raise_from_database_result,
    raise_from_seller_invitation_service,
    raise_from_seller_product_service,
    raise_from_seller_settings_service,
)

router = APIRouter(tags=["Seller Core"])


# ── Request modelleri ──────────────────────────────────────────────────────


class OnboardingStepCompleteRequest(BaseModel):
    step_data: dict[str, Any]


class SellerActivationRequest(BaseModel):
    approved: bool = True


# ── Auth ───────────────────────────────────────────────────────────────────


@router.post("/auth/complete-invite")
def complete_invite(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
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


# ── Seller kimlik ──────────────────────────────────────────────────────────


@router.get("/seller/me")
def seller_me(
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Satıcının kendi işletme kaydını döndürür."""
    result = get_seller_by_id(context.seller_id)
    if result.get("durum") != "başarılı":
        raise_from_database_result(result, default_message="Satıcı işletmesi okunamadı.")
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


# ── Seller ayarları ────────────────────────────────────────────────────────


@router.get("/seller/settings")
def seller_settings(
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın panelden değiştirebildiği güvenli işletme/ürün ayarlarını döndürür."""
    result = get_seller_settings(context.seller_id)
    if result.get("ok") is not True:
        raise_from_seller_settings_service(result)
    return {"settings": result["settings"]}


@router.patch("/seller/settings")
def seller_update_settings(
    body: SellerSettingsUpdateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller ayarlarını optimistic concurrency ile günceller."""
    result = update_seller_settings(context.seller_id, body)
    if result.get("ok") is not True:
        raise_from_seller_settings_service(result)
    return {"settings": result["settings"]}


# ── Seller kuralları ───────────────────────────────────────────────────────


@router.get("/seller/rules")
def seller_rules(
    active: bool | None = Query(default=None),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın hazır yanıt kurallarını listeler."""
    result = list_seller_rules(context.seller_id, active=active)
    if result.get("ok") is not True:
        raise_from_seller_settings_service(result)
    return {"rules": result["rules"]}


@router.post("/seller/rules", status_code=status.HTTP_201_CREATED)
def seller_create_rule(
    body: SellerRuleCreateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Gelecek müşteri mesajlarında kullanılabilecek yeni hazır yanıt kuralı oluşturur."""
    result = create_seller_rule(context.seller_id, body)
    if result.get("ok") is not True:
        raise_from_seller_settings_service(result)
    return {"rule": result["rule"]}


@router.patch("/seller/rules/{rule_id}")
def seller_update_rule(
    rule_id: PositiveInt,
    body: SellerRuleUpdateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller rule'ını tenant scope + version kontrolüyle günceller."""
    result = update_seller_rule(context.seller_id, rule_id, body)
    if result.get("ok") is not True:
        raise_from_seller_settings_service(result)
    return {"rule": result["rule"]}


@router.delete("/seller/rules/{rule_id}")
def seller_delete_rule(
    rule_id: PositiveInt,
    expected_version: PositiveInt = Query(...),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Rule geçmişini koruyarak kuralı yalnız gelecekteki cevaplar için devre dışı bırakır."""
    result = deactivate_seller_rule(context.seller_id, rule_id, expected_version)
    if result.get("ok") is not True:
        raise_from_seller_settings_service(result)
    return {"changed": result.get("changed") is True, "rule": result["rule"]}


# ── Seller ürünler ─────────────────────────────────────────────────────────


@router.get("/seller/products")
def seller_products(
    include_inactive: bool = Query(default=False),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın ürünlerini listeler; varsayılan olarak pasif ürünleri gizler."""
    result = list_seller_products(context.seller_id, include_inactive=include_inactive)
    if result.get("ok") is not True:
        raise_from_seller_product_service(result)
    return {"products": result["products"], "total": result["total"]}


@router.post("/seller/products", status_code=status.HTTP_201_CREATED)
def seller_create_product(
    body: SellerProductCreateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller için yeni ürün oluşturur."""
    result = create_seller_product(context.seller_id, body)
    if result.get("ok") is not True:
        raise_from_seller_product_service(result)
    return {"changed": result.get("changed") is True, "product": result["product"]}


@router.patch("/seller/products/{product_id}")
def seller_update_product(
    product_id: PositiveInt,
    body: SellerProductUpdateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Ürünü version kontrolüyle günceller veya is_active=false ile devre dışı bırakır."""
    result = update_seller_product(context.seller_id, product_id, body)
    if result.get("ok") is not True:
        raise_from_seller_product_service(result)
    return {"changed": result.get("changed") is True, "product": result["product"]}


# ── Onboarding ─────────────────────────────────────────────────────────────


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
        raise_from_database_result(result, default_message="Onboarding durumu okunamadı.")
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
    result = start_onboarding_step(seller_id=context.seller_id, step_order=step_order)
    if result.get("durum") not in {"başarılı", "tamamlanmış"}:
        raise_from_database_result(result, default_message="Onboarding adımı başlatılamadı.")
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
        raise_from_database_result(result, default_message="Onboarding adımı tamamlanamadı.")
    return result


# ── Admin uygulamaları ─────────────────────────────────────────────────────


@router.get("/admin/applications")
def admin_applications(
    application_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """Admin için satıcı başvurularını listeler."""
    result = get_seller_applications(status=application_status, limit=limit)
    if result.get("durum") != "başarılı":
        raise_from_database_result(result, default_message="Satıcı başvuruları okunamadı.")
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
        raise_from_seller_invitation_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


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
    result = activate_seller(seller_id=seller_id, activated_by_admin=True)
    if result.get("durum") != "başarılı":
        raise_from_database_result(result, default_message="Satıcı aktifleştirilemedi.")
    return result

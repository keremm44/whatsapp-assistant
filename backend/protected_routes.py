from __future__ import annotations

import logging
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PositiveInt,
    field_validator,
    model_validator,
)

from auth_service import (
    AuthContext,
    _extract_access_token,
    bearer_scheme,
    complete_invited_profile_from_access_token,
    get_current_auth_context,
    require_admin,
    require_seller,
)
from onboarding_service import get_onboarding_schema
from database import (
    activate_seller,
    complete_onboarding_step,
    get_onboarding_status,
    get_seller_applications,
    get_seller_by_id,
    start_onboarding_step,
)
from conversation_control_service import (
    ConversationControlAction,
    mutate_conversation_control,
    read_conversation_control,
    read_conversation_control_history,
)
from order_service import (
    get_field_definition,
    get_order_with_fields,
    list_seller_orders,
)
from return_issue_service import (
    get_seller_return_issue_request_detail,
    get_seller_return_issue_settings,
    list_seller_return_issue_requests,
    mark_seller_return_issue_handled,
    update_seller_return_issue_setting,
)
from unanswered_question_service import (
    dismiss_seller_unanswered_question,
    get_seller_unanswered_question_detail,
    list_seller_unanswered_questions,
    present_group_summary,
    set_seller_answer,
)
from seller_media_service import get_seller_message_media
from seller_panel_service import (
    get_conversation_detail as get_seller_panel_conversation_detail,
    list_conversations as list_seller_panel_conversations,
    list_dashboard_tasks as list_seller_panel_dashboard_tasks,
)
from seller_invitation_service import (
    AdminSellerInvitationRequest,
    invite_seller_from_application,
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
from seller_product_service import (
    SellerProductCreateRequest,
    SellerProductUpdateRequest,
    create_product as create_seller_product,
    list_products as list_seller_products,
    update_product as update_seller_product,
)
from feedback_service import (
    AdminFeedbackUpdateRequest,
    FeedbackCategory,
    FeedbackStatus,
    SellerFeedbackCreateRequest,
    get_admin_feedback as get_admin_feedback_item,
    get_seller_feedback as get_seller_feedback_item,
    list_admin_feedback,
    list_seller_feedback,
    submit_feedback,
    update_admin_feedback as update_admin_feedback_item,
)
from announcement_service import (
    AdminAnnouncementCreateRequest,
    create_announcement as publish_announcement,
    get_admin_announcement as get_admin_announcement_item,
    get_seller_announcement as get_seller_announcement_item,
    list_admin_announcements,
    list_seller_announcements,
    mark_seller_announcement_read,
)
from database import (
    ORDER_DISPLAY_STATUS,
    ORDER_STATUS_COLLECTING,
    ORDER_STATUS_COMPLETE,
    ORDER_STATUS_SELLER_REVIEW_REQUIRED,
    create_order_field_definition,
    get_order_field_definitions,
    get_product_by_id,
    update_order_field_definition,
)


logger = logging.getLogger(__name__)

router = APIRouter(tags=["Protected API"])


class OnboardingStepCompleteRequest(BaseModel):
    step_data: dict[str, Any]


class SellerActivationRequest(BaseModel):
    approved: bool = True


class ConversationControlRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    action: ConversationControlAction
    expected_version: Annotated[int, Field(strict=True, gt=0)]
    reason_note: str | None = Field(default=None, max_length=500)

    @field_validator("reason_note")
    @classmethod
    def normalize_reason_note(cls, value: str | None) -> str | None:
        return value or None


def _raise_from_control_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])



def _raise_from_seller_panel_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def _raise_from_media_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "unsupported": status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        "upstream": status.HTTP_502_BAD_GATEWAY,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


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


def _raise_from_seller_settings_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def _raise_from_seller_product_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def _trusted_profile_id(
    context: AuthContext,
    *,
    error_code: str = "conversation_control_unavailable",
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


@router.get("/seller/settings")
def seller_settings(
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın panelden değiştirebildiği güvenli işletme/ürün ayarlarını döndürür."""
    result = get_seller_settings(context.seller_id)
    if result.get("ok") is not True:
        _raise_from_seller_settings_service(result)
    return {"settings": result["settings"]}


@router.patch("/seller/settings")
def seller_update_settings(
    body: SellerSettingsUpdateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller ayarlarını optimistic concurrency ile günceller."""
    result = update_seller_settings(context.seller_id, body)
    if result.get("ok") is not True:
        _raise_from_seller_settings_service(result)
    return {"settings": result["settings"]}


@router.get("/seller/rules")
def seller_rules(
    active: bool | None = Query(default=None),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın hazır yanıt kurallarını listeler."""
    result = list_seller_rules(context.seller_id, active=active)
    if result.get("ok") is not True:
        _raise_from_seller_settings_service(result)
    return {"rules": result["rules"]}


@router.post("/seller/rules", status_code=status.HTTP_201_CREATED)
def seller_create_rule(
    body: SellerRuleCreateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Gelecek müşteri mesajlarında kullanılabilecek yeni hazır yanıt kuralı oluşturur."""
    result = create_seller_rule(context.seller_id, body)
    if result.get("ok") is not True:
        _raise_from_seller_settings_service(result)
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
        _raise_from_seller_settings_service(result)
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
        _raise_from_seller_settings_service(result)
    return {
        "changed": result.get("changed") is True,
        "rule": result["rule"],
    }


@router.get("/seller/products")
def seller_products(
    include_inactive: bool = Query(default=False),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın ürünlerini listeler; varsayılan olarak pasif ürünleri gizler."""
    result = list_seller_products(
        context.seller_id,
        include_inactive=include_inactive,
    )
    if result.get("ok") is not True:
        _raise_from_seller_product_service(result)
    return {"products": result["products"], "total": result["total"]}


@router.post("/seller/products", status_code=status.HTTP_201_CREATED)
def seller_create_product(
    body: SellerProductCreateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller için yeni ürün oluşturur."""
    result = create_seller_product(context.seller_id, body)
    if result.get("ok") is not True:
        _raise_from_seller_product_service(result)
    return {
        "changed": result.get("changed") is True,
        "product": result["product"],
    }


@router.patch("/seller/products/{product_id}")
def seller_update_product(
    product_id: PositiveInt,
    body: SellerProductUpdateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Ürünü version kontrolüyle günceller veya is_active=false ile devre dışı bırakır."""
    result = update_seller_product(context.seller_id, product_id, body)
    if result.get("ok") is not True:
        _raise_from_seller_product_service(result)
    return {
        "changed": result.get("changed") is True,
        "product": result["product"],
    }


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


@router.get("/seller/conversations")
def seller_conversations(
    attention_only: bool = Query(default=False),
    control_state: Literal[
        "ASSISTANT_ACTIVE",
        "SELLER_TAKEN_OVER",
        "RETURN_REVIEW",
        "ASSISTANT_PAUSED",
    ]
    | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın konuşmalarını panel read modelinde listeler."""
    result = list_seller_panel_conversations(
        context.seller_id,
        attention_only=attention_only,
        control_state=control_state,
        limit=limit,
        offset=offset,
    )
    if not result.get("ok"):
        _raise_from_seller_panel_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/conversations/{customer_id}")
def seller_conversation_detail(
    customer_id: PositiveInt,
    message_limit: int = Query(default=50, ge=1, le=100),
    before_message_id: int | None = Query(default=None, ge=1),
    control_history_limit: int = Query(default=20, ge=1, le=100),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Tek konuşmanın mesaj ve aktif iş bağlamını tenant scope'unda döndürür."""
    result = get_seller_panel_conversation_detail(
        context.seller_id,
        customer_id,
        message_limit=message_limit,
        before_message_id=before_message_id,
        control_history_limit=control_history_limit,
    )
    if not result.get("ok"):
        _raise_from_seller_panel_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/messages/{message_id}/media")
def seller_message_media(
    message_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> Response:
    """Satıcının kendi mesajına ait görseli kimlikli proxy üzerinden döndürür.

    Ham sağlayıcı URL'si istemciye hiçbir biçimde verilmez; içerik sunucu
    tarafında yalnızca güvenilir sağlayıcı hostundan HTTPS ile indirilir.
    """
    result = get_seller_message_media(context.seller_id, message_id)
    if not result.get("ok"):
        _raise_from_media_service(result)
    return Response(
        content=result["content"],
        media_type=result["content_type"],
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/seller/dashboard/tasks")
def seller_dashboard_tasks(
    task_type: str | None = Query(
        default=None,
        alias="type",
        pattern="^(return_review|order_review|unanswered_question)$",
    ),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Bugün ilgilenmeniz gerekenler iş kuyruğunu döndürür."""
    result = list_seller_panel_dashboard_tasks(
        context.seller_id,
        task_type=task_type,
        limit=limit,
        offset=offset,
    )
    if not result.get("ok"):
        _raise_from_seller_panel_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/conversations/{customer_id}/control")
def seller_conversation_control(
    customer_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    result = read_conversation_control(context.seller_id, customer_id)
    if not result.get("ok"):
        _raise_from_control_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.post("/seller/conversations/{customer_id}/control")
def seller_mutate_conversation_control(
    customer_id: PositiveInt,
    body: ConversationControlRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    result = mutate_conversation_control(
        seller_id=context.seller_id,
        customer_id=customer_id,
        actor_profile_id=_trusted_profile_id(context),
        action=body.action,
        expected_version=body.expected_version,
        reason_note=body.reason_note,
    )
    if not result.get("ok"):
        _raise_from_control_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/conversations/{customer_id}/control-history")
def seller_conversation_control_history(
    customer_id: PositiveInt,
    limit: int = Query(default=20, ge=1, le=100),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    result = read_conversation_control_history(
        context.seller_id,
        customer_id,
        limit,
    )
    if not result.get("ok"):
        _raise_from_control_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


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


# =====================================================
# SELLER SİPARİŞ ENDPOINTLERİ
# =====================================================

def _raise_from_order_service(
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
            detail=result.get("mesaj") or default_message,
        )

    if durum == "çakışma":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=result.get("mesaj") or default_message,
        )

    logger.error(
        "Sipariş işlemi başarısız: durum=%r result=%r",
        durum,
        result,
    )
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=default_message,
    )


def _present_order_summary(order: dict[str, Any]) -> dict[str, Any]:
    """Sipariş listesi için güvenli özet üretir."""
    status_value = order.get("status")
    display_status = ORDER_DISPLAY_STATUS.get(
        status_value,
        status_value or "Bilinmiyor",
    )

    return {
        "id": order.get("id"),
        "external_order_number": order.get("external_order_number"),
        "product_id": order.get("product_id"),
        "product_name_snapshot": order.get("product_name_snapshot"),
        "customer_id": order.get("customer_id"),
        "customer_phone_snapshot": order.get("customer_phone_snapshot"),
        "status": status_value,
        "display_status": display_status,
        "image_message_id": order.get("image_message_id"),
        "has_image": order.get("image_message_id") is not None,
        "custom_text": order.get("custom_text"),
        "review_reason_code": order.get("review_reason_code"),
        "review_reason_note": order.get("review_reason_note"),
        "version": order.get("version"),
        "created_at": order.get("created_at"),
        "updated_at": order.get("updated_at"),
        "completed_at": order.get("completed_at"),
        "seller_action_required": (
            status_value == ORDER_STATUS_SELLER_REVIEW_REQUIRED
        ),
    }


@router.get("/seller/orders")
def seller_orders(
    view: str = Query(default="all", pattern="^(action_required|collecting|all)$"),
    status_filter: str | None = Query(default=None, alias="status"),
    product_id: int | None = Query(default=None, ge=1),
    image_missing: bool | None = Query(default=None),
    customer_id: int | None = Query(default=None, ge=1),
    external_order_number: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Satıcının siparişlerini tenant scope'unda listeler."""
    result = list_seller_orders(
        context.seller_id,
        view=view,
        status=status_filter,
        product_id=product_id,
        image_missing=image_missing,
        customer_id=customer_id,
        external_order_number=external_order_number,
        limit=limit,
        offset=offset,
    )

    if result.get("durum") != "başarılı":
        _raise_from_order_service(
            result,
            default_message="Siparişler okunamadı.",
        )

    return {
        "view": view,
        "toplam": result["toplam"],
        "limit": limit,
        "offset": offset,
        "orders": [
            _present_order_summary(order)
            for order in result["orders"]
        ],
    }


@router.get("/seller/orders/{order_id}")
def seller_order_detail(
    order_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Sipariş detayını snapshot alanları ve değerleriyle döndürür."""
    result = get_order_with_fields(context.seller_id, order_id)

    if result.get("durum") != "başarılı":
        _raise_from_order_service(
            result,
            default_message="Sipariş detayı okunamadı.",
        )

    order = result["order"]
    status_value = order.get("status")
    display_status = ORDER_DISPLAY_STATUS.get(
        status_value,
        status_value or "Bilinmiyor",
    )

    return {
        "order": {
            "id": order.get("id"),
            "external_order_number": order.get("external_order_number"),
            "product_id": order.get("product_id"),
            "product_name_snapshot": order.get("product_name_snapshot"),
            "customer_id": order.get("customer_id"),
            "customer_phone_snapshot": order.get("customer_phone_snapshot"),
            "customer_note": order.get("customer_note"),
            "image_message_id": order.get("image_message_id"),
            "custom_text": order.get("custom_text"),
            "status": status_value,
            "display_status": display_status,
            "review_reason_code": order.get("review_reason_code"),
            "review_reason_note": order.get("review_reason_note"),
            "created_from_message_id": order.get("created_from_message_id"),
            "last_source_message_id": order.get("last_source_message_id"),
            "version": order.get("version"),
            "created_at": order.get("created_at"),
            "updated_at": order.get("updated_at"),
            "completed_at": order.get("completed_at"),
            "closed_at": order.get("closed_at"),
        },
        "fields": result["fields"],
    }


# =====================================================
# SELLER DİNAMİK ALAN ENDPOINTLERİ
# =====================================================

class OrderFieldDefinitionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    product_id: int | None = Field(default=None, ge=1)
    field_key: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=120)
    field_type: str
    is_required: bool = False
    sort_order: int = Field(default=0, ge=0)
    options: list[dict[str, Any]] | None = None
    validation_config: dict[str, Any] | None = None

    @field_validator("field_key")
    @classmethod
    def validate_field_key(cls, value: str) -> str:
        import re

        if not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", value):
            raise ValueError(
                "field_key küçük harf/rakam/alt çizgi içeren geçerli bir anahtar olmalıdır."
            )
        return value


class OrderFieldDefinitionUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    expected_version: Annotated[int, Field(strict=True, gt=0)]
    label: str | None = Field(default=None, min_length=1, max_length=120)
    is_required: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = Field(default=None, ge=0)


@router.get("/seller/order-field-definitions")
def seller_order_field_definitions(
    product_id: int | None = Query(default=None, ge=1),
    include_inactive: bool = Query(default=False),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Satıcının dinamik alan tanımlarını listeler."""
    result = get_order_field_definitions(
        context.seller_id,
        product_id=product_id,
        include_inactive=include_inactive,
    )

    if result.get("durum") != "başarılı":
        _raise_from_order_service(
            result,
            default_message="Alan tanımları okunamadı.",
        )

    return {
        "toplam": result["toplam"],
        "definitions": result["definitions"],
    }


@router.post("/seller/order-field-definitions")
def seller_create_order_field_definition(
    body: OrderFieldDefinitionCreateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Yeni dinamik alan tanımı oluşturur."""
    if body.product_id is not None:
        product_result = get_product_by_id(
            context.seller_id,
            body.product_id,
        )

        if product_result.get("durum") != "başarılı":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ürün bu satıcı kapsamında bulunamadı.",
            )

    result = create_order_field_definition(
        context.seller_id,
        field_key=body.field_key,
        label=body.label,
        field_type=body.field_type,
        is_required=body.is_required,
        sort_order=body.sort_order,
        product_id=body.product_id,
        options=body.options,
        validation_config=body.validation_config,
    )

    if result.get("durum") != "başarılı":
        _raise_from_order_service(
            result,
            default_message="Alan tanımı oluşturulamadı.",
        )

    return {"definition": result["definition"]}


@router.patch("/seller/order-field-definitions/{field_id}")
def seller_update_order_field_definition(
    field_id: PositiveInt,
    body: OrderFieldDefinitionUpdateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Dinamik alan tanımını optimistic concurrency ile günceller."""
    result = update_order_field_definition(
        context.seller_id,
        field_id,
        expected_version=body.expected_version,
        label=body.label,
        is_required=body.is_required,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )

    if result.get("durum") != "başarılı":
        _raise_from_order_service(
            result,
            default_message="Alan tanımı güncellenemedi.",
        )

    return {"definition": result["definition"]}

# =====================================================
# SELLER İADE / SORUN TALEBİ ENDPOINTLERİ
# =====================================================


def _raise_from_return_issue_service(
    result: dict[str, Any],
    *,
    default_message: str,
) -> None:
    kind = result.get("kind")

    if kind == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=result.get("mesaj") or default_message,
        )

    if kind == "validation":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=result.get("mesaj") or default_message,
        )

    if kind == "conflict":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=result.get("mesaj") or default_message,
        )

    logger.error(
        "İade/sorun işlemi başarısız: kind=%r result=%r",
        kind,
        result,
    )
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=default_message,
    )


class ReturnIssueActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    action: Literal["mark_handled"]
    expected_version: Annotated[int, Field(strict=True, gt=0)]
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        return value or None


class ReturnIssueSettingUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    expected_version: Annotated[int, Field(strict=True, gt=0)]
    image_requirement: Literal["REQUIRED", "OPTIONAL", "NOT_REQUESTED"]


@router.get("/seller/return-issue-requests")
def seller_return_issue_requests(
    view: str = Query(
        default="all",
        pattern="^(action_required|collecting|handled|all)$",
    ),
    customer_id: int | None = Query(default=None, ge=1),
    issue_type: str | None = Query(default=None, max_length=48),
    external_order_number: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Satıcının kalıcı iade/sorun taleplerini tenant scope'unda listeler."""
    result = list_seller_return_issue_requests(
        context.seller_id,
        view=view,
        customer_id=customer_id,
        issue_type=issue_type,
        external_order_number=external_order_number,
        limit=limit,
        offset=offset,
    )

    if result.get("durum") != "başarılı":
        _raise_from_return_issue_service(
            result,
            default_message="İade/sorun talepleri okunamadı.",
        )

    return {
        "view": view,
        "toplam": result["toplam"],
        "limit": limit,
        "offset": offset,
        "requests": result["requests"],
    }


@router.get("/seller/return-issue-requests/{request_id}")
def seller_return_issue_request_detail(
    request_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Tek iade/sorun talebinin güvenli seller detayını döndürür."""
    result = get_seller_return_issue_request_detail(
        context.seller_id,
        request_id,
    )

    if result.get("durum") != "başarılı":
        _raise_from_return_issue_service(
            result,
            default_message="İade/sorun talebi okunamadı.",
        )

    return {
        "request": result["request"],
        "customer": result.get("customer"),
        "order": result.get("order"),
        "evidence": result.get("evidence") or [],
        "missing_fields": result.get("missing_fields") or [],
    }


@router.post("/seller/return-issue-requests/{request_id}/actions")
def seller_return_issue_request_action(
    request_id: PositiveInt,
    body: ReturnIssueActionRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın talebi operasyonel olarak handled işaretlemesini sağlar."""
    actor_profile_id = _trusted_profile_id(context)

    result = mark_seller_return_issue_handled(
        context.seller_id,
        request_id,
        actor_profile_id,
        body.expected_version,
        note=body.note,
    )

    if result.get("durum") != "başarılı":
        _raise_from_return_issue_service(
            result,
            default_message="İade/sorun talebi güncellenemedi.",
        )

    return {
        "action": body.action,
        "changed": result.get("changed") is True,
        "request": result["request"],
    }


@router.get("/seller/return-issue-settings")
def seller_return_issue_settings(
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Tüm canonical issue type'lar için seller görsel ayarlarını döndürür."""
    result = get_seller_return_issue_settings(context.seller_id)

    if result.get("durum") != "başarılı":
        _raise_from_return_issue_service(
            result,
            default_message="İade/sorun ayarları okunamadı.",
        )

    return {"settings": result["settings"]}


@router.patch("/seller/return-issue-settings/{issue_type}")
def seller_update_return_issue_setting(
    issue_type: str,
    body: ReturnIssueSettingUpdateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Issue-type görsel gereksinimini optimistic concurrency ile günceller."""
    result = update_seller_return_issue_setting(
        context.seller_id,
        issue_type,
        body.image_requirement,
        body.expected_version,
    )

    if result.get("durum") != "başarılı":
        _raise_from_return_issue_service(
            result,
            default_message="İade/sorun ayarı güncellenemedi.",
        )

    return {
        "changed": result.get("changed") is True,
        "setting": result["setting"],
    }

# =====================================================
# SELLER CEVAPLANAMAYAN SORU ENDPOINTLERİ
# =====================================================


def _raise_from_unanswered_question_service(
    result: dict[str, Any],
    *,
    default_message: str,
) -> None:
    kind = result.get("kind")

    if kind == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=result.get("mesaj") or default_message,
        )

    if kind == "validation":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=result.get("mesaj") or default_message,
        )

    if kind == "conflict":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=result.get("mesaj") or default_message,
        )

    logger.error(
        "Cevaplanamayan soru işlemi başarısız: kind=%r result=%r",
        kind,
        result,
    )
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=default_message,
    )


class UnansweredQuestionActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    action: Literal["set_answer", "dismiss"]
    expected_version: Annotated[int, Field(strict=True, gt=0)]
    answer: str | None = Field(default=None, max_length=4000)
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("answer", "note")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return value or None

    @model_validator(mode="after")
    def validate_action_payload(self) -> "UnansweredQuestionActionRequest":
        if self.action == "set_answer":
            if self.answer is None:
                raise ValueError("set_answer için answer zorunludur.")
            if self.note is not None:
                raise ValueError("set_answer aksiyonunda note gönderilemez.")
        elif self.action == "dismiss":
            if self.answer is not None:
                raise ValueError("dismiss aksiyonunda answer gönderilemez.")
        return self


@router.get("/seller/unanswered-questions")
def seller_unanswered_questions(
    view: str = Query(
        default="all",
        pattern="^(action_required|answered|dismissed|all)$",
    ),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın cevaplanamayan soru gruplarını tenant scope'unda listeler."""
    result = list_seller_unanswered_questions(
        context.seller_id,
        view=view,
        limit=limit,
        offset=offset,
    )

    if result.get("durum") != "başarılı":
        _raise_from_unanswered_question_service(
            result,
            default_message="Cevaplanamayan sorular okunamadı.",
        )

    return {
        "view": view,
        "toplam": result["toplam"],
        "limit": limit,
        "offset": offset,
        "questions": [present_group_summary(group) for group in result["groups"]],
    }


@router.get("/seller/unanswered-questions/{group_id}")
def seller_unanswered_question_detail(
    group_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Tek unanswered group ve güvenli occurrence geçmişini döndürür."""
    result = get_seller_unanswered_question_detail(context.seller_id, group_id)

    if result.get("durum") != "başarılı":
        _raise_from_unanswered_question_service(
            result,
            default_message="Cevaplanamayan soru detayı okunamadı.",
        )

    return {
        "question": result["group"],
        "occurrences": result.get("occurrences") or [],
    }


@router.post("/seller/unanswered-questions/{group_id}/actions")
def seller_unanswered_question_action(
    group_id: PositiveInt,
    body: UnansweredQuestionActionRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller cevabı veya dismiss işlemi; geçmiş mesajlara outgoing göndermez."""
    actor_profile_id = _trusted_profile_id(context)

    if body.action == "set_answer":
        result = set_seller_answer(
            context.seller_id,
            group_id,
            actor_profile_id,
            body.expected_version,
            body.answer or "",
        )
    else:
        result = dismiss_seller_unanswered_question(
            context.seller_id,
            group_id,
            actor_profile_id,
            body.expected_version,
            note=body.note,
        )

    if result.get("durum") != "başarılı":
        _raise_from_unanswered_question_service(
            result,
            default_message="Cevaplanamayan soru güncellenemedi.",
        )

    return {
        "action": body.action,
        "changed": result.get("changed") is True,
        "question": result["group"],
    }


# =====================================================
# SELLER -> ADMIN FEEDBACK ENDPOINTLERİ
# =====================================================


def _raise_from_feedback_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


@router.post(
    "/seller/feedback",
    status_code=status.HTTP_201_CREATED,
)
def seller_submit_feedback(
    body: SellerFeedbackCreateRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller adına kategorili feedback oluşturur; seller_id auth context'ten gelir."""
    result = submit_feedback(context.seller_id, body)
    if not result.get("ok"):
        _raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/feedback")
def seller_feedback_list(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın yalnız kendi feedback kayıtlarını en yeniden eskiye listeler."""
    result = list_seller_feedback(
        context.seller_id,
        limit=limit,
        offset=offset,
    )
    if not result.get("ok"):
        _raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/feedback/{feedback_id}")
def seller_feedback_detail(
    feedback_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Tenant dışı feedback kayıtlarını 404 olarak görünmez tutar."""
    result = get_seller_feedback_item(context.seller_id, feedback_id)
    if not result.get("ok"):
        _raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/admin/feedback")
def admin_feedback_list(
    feedback_status: FeedbackStatus | None = Query(default=None, alias="status"),
    category: FeedbackCategory | None = Query(default=None),
    seller_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """Admin workflow kuyruğunu güvenli seller özeti ve filtrelerle listeler."""
    result = list_admin_feedback(
        status=feedback_status,
        category=category,
        seller_id=seller_id,
        limit=limit,
        offset=offset,
    )
    if not result.get("ok"):
        _raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/admin/feedback/{feedback_id}")
def admin_feedback_detail(
    feedback_id: PositiveInt,
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    result = get_admin_feedback_item(feedback_id)
    if not result.get("ok"):
        _raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.patch("/admin/feedback/{feedback_id}")
def admin_update_feedback(
    feedback_id: PositiveInt,
    body: AdminFeedbackUpdateRequest,
    _: AuthContext = Depends(require_admin),
) -> dict[str, Any]:
    """Admin workflow alanlarını expected_version ile atomik günceller."""
    result = update_admin_feedback_item(feedback_id, body)
    if not result.get("ok"):
        _raise_from_feedback_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


# =====================================================
# UYGULAMA İÇİ DUYURU ENDPOINTLERİ
# =====================================================


def _raise_from_announcement_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


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
    offset: int = Query(default=0, ge=0),
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


@router.get("/seller/announcements")
def seller_announcement_list(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
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

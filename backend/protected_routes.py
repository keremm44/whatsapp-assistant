from __future__ import annotations

import logging
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
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


def _trusted_profile_id(context: AuthContext) -> int:
    profile_id = context.profile.get("id")
    if not isinstance(profile_id, int) or isinstance(profile_id, bool) or profile_id < 1:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "conversation_control_unavailable",
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

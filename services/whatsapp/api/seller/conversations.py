from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, PositiveInt, field_validator

from auth_service import AuthContext, require_seller
from conversation_control_service import (
    ConversationControlAction,
    mutate_conversation_control,
    read_conversation_control,
    read_conversation_control_history,
)
from seller_cache import seller_read_cache
from seller_list_v2_service import list_conversations_v2
from seller_media_service import get_seller_message_media
from seller_panel_service import (
    get_conversation_detail as get_seller_panel_conversation_detail,
    list_conversations as list_seller_panel_conversations,
)


ROUTE_PATHS = frozenset(
    {
        "/seller/conversations",
        "/seller/conversations/v2",
        "/seller/conversations/{customer_id}",
        "/seller/messages/{message_id}/media",
        "/seller/conversations/{customer_id}/control",
        "/seller/conversations/{customer_id}/control-history",
    }
)

router = APIRouter(tags=["Protected API"])


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


def _raise_from_seller_list_v2_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def _seller_list_v2_public(result: dict[str, Any]) -> dict[str, Any]:
    if not result.get("ok"):
        _raise_from_seller_list_v2_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


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
    offset: int = Query(default=0, ge=0, le=10_000),
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


@router.get("/seller/conversations/v2")
def seller_conversations_v2(
    attention_only: bool = Query(default=False),
    control_state: Literal[
        "ASSISTANT_ACTIVE",
        "SELLER_TAKEN_OVER",
        "RETURN_REVIEW",
        "ASSISTANT_PAUSED",
    ]
    | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=2048),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller panel conversation list'ini stabil activity cursor ile listeler."""
    result = list_conversations_v2(
        context.seller_id,
        attention_only=attention_only,
        control_state=control_state,
        limit=limit,
        cursor=cursor,
    )
    return _seller_list_v2_public(result)


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
    seller_read_cache.invalidate_seller(context.seller_id)
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

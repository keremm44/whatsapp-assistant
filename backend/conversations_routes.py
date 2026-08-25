"""
conversations_routes.py — Seller konuşma, mesaj ve konuşma kontrolü endpointleri.

Buraya taşınan route'lar:
  GET  /seller/conversations
  GET  /seller/conversations/v2
  GET  /seller/conversations/{customer_id}
  GET  /seller/messages/{message_id}/media
  GET  /seller/dashboard/tasks
  GET  /seller/sidebar-summary
  GET  /seller/conversations/{customer_id}/control
  POST /seller/conversations/{customer_id}/control
  GET  /seller/conversations/{customer_id}/control-history
"""

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
    list_dashboard_tasks as list_seller_panel_dashboard_tasks,
)
from seller_sidebar_service import get_seller_sidebar_summary
from route_helpers import (
    raise_from_control_service,
    raise_from_media_service,
    raise_from_seller_panel_service,
    raise_from_sidebar_service,
    seller_list_v2_public,
    trusted_profile_id,
)

router = APIRouter(tags=["Conversations"])


class ConversationControlRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    action: ConversationControlAction
    expected_version: Annotated[int, Field(strict=True, gt=0)]
    reason_note: str | None = Field(default=None, max_length=500)

    @field_validator("reason_note")
    @classmethod
    def normalize_reason_note(cls, value: str | None) -> str | None:
        return value or None


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
        raise_from_seller_panel_service(result)
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
    return seller_list_v2_public(result)


@router.get("/seller/conversations/{customer_id}/control")
def seller_conversation_control(
    customer_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    result = read_conversation_control(context.seller_id, customer_id)
    if not result.get("ok"):
        raise_from_control_service(result)
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
        actor_profile_id=trusted_profile_id(context),
        action=body.action,
        expected_version=body.expected_version,
        reason_note=body.reason_note,
    )
    if not result.get("ok"):
        raise_from_control_service(result)
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
        raise_from_control_service(result)
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
        raise_from_seller_panel_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/messages/{message_id}/media")
def seller_message_media(
    message_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> Response:
    """Satıcının kendi mesajına ait görseli kimlikli proxy üzerinden döndürür."""
    result = get_seller_message_media(context.seller_id, message_id)
    if not result.get("ok"):
        raise_from_media_service(result)
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
    offset: int = Query(default=0, ge=0, le=10_000),
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
        raise_from_seller_panel_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


@router.get("/seller/sidebar-summary")
def seller_sidebar_summary(
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller sidebar için hafif, güvenilir action-count özetini döndürür."""
    result = get_seller_sidebar_summary(context.seller_id)
    if not result.get("ok"):
        raise_from_sidebar_service(result)
    return {key: value for key, value in result.items() if key != "ok"}

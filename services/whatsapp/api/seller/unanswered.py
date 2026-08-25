from __future__ import annotations

import logging
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, PositiveInt, field_validator, model_validator

from auth_service import AuthContext, require_seller
from database import UNANSWERED_STATUS_OPEN
from seller_cache import seller_read_cache
from seller_list_v2_service import list_unanswered_v2
from unanswered_question_service import (
    dismiss_seller_unanswered_question,
    get_seller_unanswered_question_detail,
    list_seller_unanswered_questions,
    present_group_summary,
    set_seller_answer,
)


logger = logging.getLogger(__name__)

ROUTE_PATHS = frozenset(
    {
        "/seller/unanswered-questions",
        "/seller/unanswered-questions/v2",
        "/seller/unanswered-questions/{group_id}",
        "/seller/unanswered-questions/{group_id}/actions",
    }
)

router = APIRouter(tags=["Protected API"])


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
    offset: int = Query(default=0, ge=0, le=10_000),
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


@router.get("/seller/unanswered-questions/v2")
def seller_unanswered_questions_v2(
    view: str = Query(
        default="all",
        pattern="^(action_required|answered|dismissed|all)$",
    ),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=2048),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Cevaplanamayan soru gruplarını (last_seen_at, id) keyset cursor ile listeler."""
    result = list_unanswered_v2(
        context.seller_id,
        view=view,
        limit=limit,
        cursor=cursor,
    )
    return _seller_list_v2_public(result)


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

    group = result["group"]
    if isinstance(group, dict) and "seller_action_required" not in group:
        group = {
            **group,
            "seller_action_required": group.get("status") == UNANSWERED_STATUS_OPEN,
        }

    return {
        "question": group,
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
    seller_read_cache.invalidate_seller(context.seller_id)

    group = result["group"]
    if isinstance(group, dict) and "seller_action_required" not in group:
        group = {
            **group,
            "seller_action_required": group.get("status") == UNANSWERED_STATUS_OPEN,
        }

    return {
        "action": body.action,
        "changed": result.get("changed") is True,
        "question": group,
    }

"""
returns_routes.py — Seller iade/sorun talebi endpointleri.

Route'lar:
  GET   /seller/return-issue-requests
  GET   /seller/return-issue-requests/v2
  GET   /seller/return-issue-requests/{request_id}
  GET   /seller/return-issue-requests/{request_id}/evidence
  POST  /seller/return-issue-requests/{request_id}/actions
  GET   /seller/return-issue-settings
  PATCH /seller/return-issue-settings/{issue_type}
"""

from __future__ import annotations

import logging
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, PositiveInt, field_validator

from auth_service import AuthContext, require_seller
from return_issue_service import (
    get_seller_return_issue_request_detail,
    get_seller_return_issue_settings,
    list_seller_return_issue_evidence,
    list_seller_return_issue_requests,
    mark_seller_return_issue_handled,
    update_seller_return_issue_setting,
)
from seller_cache import seller_read_cache
from seller_list_v2_service import list_returns_v2
from route_helpers import seller_list_v2_public, trusted_profile_id

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Returns"])


# ── Yardımcı ──────────────────────────────────────────────────────────────


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
    logger.error("İade/sorun işlemi başarısız: kind=%r result=%r", kind, result)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=default_message,
    )


# ── Request modelleri ──────────────────────────────────────────────────────


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


# ── Endpointler ────────────────────────────────────────────────────────────


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
    offset: int = Query(default=0, ge=0, le=10_000),
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
            result, default_message="İade/sorun talepleri okunamadı."
        )
    return {
        "view": view,
        "toplam": result["toplam"],
        "limit": limit,
        "offset": offset,
        "requests": result["requests"],
    }


@router.get("/seller/return-issue-requests/v2")
def seller_return_issue_requests_v2(
    view: str = Query(
        default="all",
        pattern="^(action_required|collecting|handled|all)$",
    ),
    customer_id: int | None = Query(default=None, ge=1),
    issue_type: str | None = Query(default=None, max_length=48),
    external_order_number: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=2048),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """İade/sorun taleplerini (updated_at, id) keyset cursor ile listeler."""
    result = list_returns_v2(
        context.seller_id,
        view=view,
        customer_id=customer_id,
        issue_type=issue_type,
        external_order_number=external_order_number,
        limit=limit,
        cursor=cursor,
    )
    return seller_list_v2_public(result)


@router.get("/seller/return-issue-requests/{request_id}/evidence")
def seller_return_issue_evidence_page(
    request_id: PositiveInt,
    limit: int = Query(default=24, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Bounded evidence metadata page; media remains lazy via its proxy."""
    result = list_seller_return_issue_evidence(
        context.seller_id, request_id, limit=limit, offset=offset
    )
    if result.get("durum") != "başarılı":
        _raise_from_return_issue_service(result, default_message="Kanıtlar okunamadı.")
    return {
        "evidence": result["evidence"],
        "limit": result["limit"],
        "offset": result["offset"],
        "has_more": result["has_more"],
    }


@router.post("/seller/return-issue-requests/{request_id}/actions")
def seller_return_issue_request_action(
    request_id: PositiveInt,
    body: ReturnIssueActionRequest,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Seller'ın talebi operasyonel olarak handled işaretlemesini sağlar."""
    actor_profile_id = trusted_profile_id(context)
    result = mark_seller_return_issue_handled(
        context.seller_id,
        request_id,
        actor_profile_id,
        body.expected_version,
        note=body.note,
    )
    if result.get("durum") != "başarılı":
        _raise_from_return_issue_service(
            result, default_message="İade/sorun talebi güncellenemedi."
        )
    seller_read_cache.invalidate_seller(context.seller_id)
    return {
        "action": body.action,
        "changed": result.get("changed") is True,
        "request": result["request"],
    }


@router.get("/seller/return-issue-requests/{request_id}")
def seller_return_issue_request_detail(
    request_id: PositiveInt,
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Tek iade/sorun talebinin güvenli seller detayını döndürür."""
    result = get_seller_return_issue_request_detail(context.seller_id, request_id)
    if result.get("durum") != "başarılı":
        _raise_from_return_issue_service(
            result, default_message="İade/sorun talebi okunamadı."
        )
    return {
        "request": result["request"],
        "customer": result.get("customer"),
        "order": result.get("order"),
        "evidence": result.get("evidence") or [],
        "evidence_has_more": result.get("evidence_has_more") is True,
        "missing_fields": result.get("missing_fields") or [],
    }


@router.get("/seller/return-issue-settings")
def seller_return_issue_settings(
    context: AuthContext = Depends(require_seller),
) -> dict[str, Any]:
    """Tüm canonical issue type'lar için seller görsel ayarlarını döndürür."""
    result = get_seller_return_issue_settings(context.seller_id)
    if result.get("durum") != "başarılı":
        _raise_from_return_issue_service(
            result, default_message="İade/sorun ayarları okunamadı."
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
            result, default_message="İade/sorun ayarı güncellenemedi."
        )
    return {
        "changed": result.get("changed") is True,
        "setting": result["setting"],
    }

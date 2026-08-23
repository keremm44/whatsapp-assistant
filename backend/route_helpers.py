"""
route_helpers.py — Tüm domain router'larının paylaştığı yardımcı fonksiyonlar.

Bu modül yalnızca:
  - Servis/DB sonuçlarını HTTP exception'a çeviren _raise_from_* fonksiyonları
  - AuthContext'ten güvenli profile_id okuyan _trusted_profile_id
  - Veritabanı durum string'lerini HTTP kodlarına çeviren _raise_from_database_result

Yeni domain router'ları (conversations_routes.py, orders_routes.py vb.)
buradan import eder. protected_routes.py geriye uyumluluk için
bu fonksiyonları yeniden export etmeye devam eder.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, status

from auth_service import AuthContext

logger = logging.getLogger(__name__)


# ── Servis katmanı → HTTP exception çeviriciler ─────────────────────────────


def raise_from_control_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def raise_from_seller_panel_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def raise_from_media_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "unsupported": status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        "upstream": status.HTTP_502_BAD_GATEWAY,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def raise_from_seller_invitation_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
        "partial_failure": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def raise_from_seller_settings_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def raise_from_seller_product_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def raise_from_sidebar_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def raise_from_order_service(result: dict[str, Any]) -> None:
    """order_service / order field sonuçlarını HTTP'ye çevirir."""
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def raise_from_return_service(result: dict[str, Any]) -> None:
    """return_issue_service sonuçlarını HTTP'ye çevirir."""
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def raise_from_unanswered_service(result: dict[str, Any]) -> None:
    """unanswered_question_service sonuçlarını HTTP'ye çevirir."""
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def raise_from_feedback_service(result: dict[str, Any]) -> None:
    """feedback_service sonuçlarını HTTP'ye çevirir."""
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def raise_from_seller_list_v2_service(result: dict[str, Any]) -> None:
    kind = result.get("kind")
    status_code = {
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


def seller_list_v2_public(result: dict[str, Any]) -> dict[str, Any]:
    """v2 cursor liste servis sonucunu ok alanı olmadan döndürür."""
    if not result.get("ok"):
        raise_from_seller_list_v2_service(result)
    return {key: value for key, value in result.items() if key != "ok"}


def raise_from_announcement_service(result: dict[str, Any]) -> None:
    """announcement_service sonuçlarını HTTP'ye çevirir."""
    kind = result.get("kind")
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "validation": status.HTTP_422_UNPROCESSABLE_CONTENT,
        "conflict": status.HTTP_409_CONFLICT,
        "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }.get(kind, status.HTTP_503_SERVICE_UNAVAILABLE)
    raise HTTPException(status_code=status_code, detail=result["error"])


# ── AuthContext yardımcıları ────────────────────────────────────────────────


def trusted_profile_id(
    context: AuthContext,
    *,
    error_code: str = "conversation_control_unavailable",
) -> int:
    """AuthContext'ten güvenli integer profile_id okur; yoksa 503 fırlatır."""
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


# ── Veritabanı durum string'leri → HTTP ────────────────────────────────────


def raise_from_database_result(
    result: dict[str, Any],
    *,
    default_message: str,
) -> None:
    """
    Türkçe 'durum' alanlarını HTTP exception'a çevirir.
    Sırasıyla: bulunamadı → 404, doğrulama_hatası → 422,
    kilitli/sıra_hatası/reddedildi/admin_onayı_gerekli → 409,
    diğerleri → 500.
    """
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

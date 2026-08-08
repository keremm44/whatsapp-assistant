from __future__ import annotations

import re
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, field_validator

from auth_service import create_seller_invite_auth_user, delete_invited_auth_user
from database import (
    finalize_seller_invitation_from_application,
    get_seller_application_by_id,
    get_seller_by_id,
    get_user_profile_by_seller_id,
)


_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class AdminSellerInvitationRequest(BaseModel):
    """Adminin başvuruyu seller davetine çevirmek için gönderebildiği alanlar."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    email: str | None = Field(default=None, max_length=254)
    admin_note: str | None = Field(default=None, max_length=1000)
    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if not normalized:
            return None
        if not _EMAIL_RE.fullmatch(normalized):
            raise ValueError("Geçerli bir e-posta adresi girilmelidir.")
        return normalized

    @field_validator("admin_note")
    @classmethod
    def normalize_admin_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

def _failure(code: str, message: str, *, kind: str) -> dict[str, Any]:
    return {
        "ok": False,
        "kind": kind,
        "error": {"code": code, "message": message},
    }


def _public_profile(profile: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in profile.items()
        if key != "auth_user_id"
    }


def _success_payload(
    application: dict[str, Any],
    seller: dict[str, Any],
    profile: dict[str, Any],
    *,
    already_processed: bool,
    invitation_sent: bool,
    warning: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ok": True,
        "status": "already_invited" if already_processed else "invited",
        "already_processed": already_processed,
        "invitation_sent": invitation_sent,
        "application": application,
        "seller": seller,
        "profile": _public_profile(profile),
    }
    if warning:
        payload["warning"] = warning
    return payload


def _load_approved_application(
    application: dict[str, Any],
) -> dict[str, Any]:
    seller_id = application.get("approved_seller_id")
    if not isinstance(seller_id, int) or isinstance(seller_id, bool) or seller_id < 1:
        return _failure(
            "seller_invitation_inconsistent",
            "Onaylanmış başvurunun seller bağlantısı eksik.",
            kind="unavailable",
        )

    seller_result = get_seller_by_id(seller_id)
    profile_result = get_user_profile_by_seller_id(seller_id)
    if (
        seller_result.get("durum") != "başarılı"
        or profile_result.get("durum") != "başarılı"
    ):
        return _failure(
            "seller_invitation_inconsistent",
            "Onaylanmış başvurunun seller hesabı eksik veya okunamıyor.",
            kind="unavailable",
        )

    return _success_payload(
        application,
        seller_result["satıcı"],
        profile_result["profile"],
        already_processed=True,
        invitation_sent=False,
    )


def _cleanup_new_auth_user(auth_user_id: str) -> bool:
    return delete_invited_auth_user(auth_user_id).get("durum") == "başarılı"


def _reconcile_after_finalize_failure(
    application_id: int,
    auth_user_id: str,
) -> dict[str, Any] | None:
    """RPC cevabı belirsizse DB'de commit olmuş olma ihtimalini kontrol eder."""
    latest_result = get_seller_application_by_id(application_id)
    if latest_result.get("durum") != "başarılı":
        return None

    application = latest_result["application"]
    if application.get("status") != "approved":
        return None

    existing = _load_approved_application(application)
    if not existing.get("ok"):
        return existing

    seller_id = application.get("approved_seller_id")
    profile_result = get_user_profile_by_seller_id(seller_id)
    profile = profile_result.get("profile") if profile_result.get("durum") == "başarılı" else None
    if not isinstance(profile, dict):
        return existing

    existing_auth_user_id = str(profile.get("auth_user_id") or "")
    if existing_auth_user_id and existing_auth_user_id != auth_user_id:
        cleanup_ok = _cleanup_new_auth_user(auth_user_id)
        if not cleanup_ok:
            existing["warning"] = (
                "Başvuru başka bir davetle tamamlandı ancak bu denemede oluşturulan "
                "fazladan Auth kullanıcısı otomatik temizlenemedi."
            )
    else:
        # Aynı auth_user_id DB'ye bağlandıysa RPC cevabı kaybolmuş olsa bile
        # davetin başarılı olduğu güvenle kabul edilir.
        existing["status"] = "invited"
        existing["already_processed"] = False
        existing["invitation_sent"] = True

    return existing


def invite_seller_from_application(
    application_id: int,
    request: AdminSellerInvitationRequest,
) -> dict[str, Any]:
    """Başvuruyu admin kontrollü seller davetine dönüştürür."""
    if (
        not isinstance(application_id, int)
        or isinstance(application_id, bool)
        or application_id < 1
    ):
        return _failure(
            "seller_application_validation_error",
            "application_id pozitif tam sayı olmalıdır.",
            kind="validation",
        )

    application_result = get_seller_application_by_id(application_id)
    durum = application_result.get("durum")
    if durum == "bulunamadı":
        return _failure(
            "seller_application_not_found",
            "Başvuru bulunamadı.",
            kind="not_found",
        )
    if durum != "başarılı":
        return _failure(
            "seller_application_unavailable",
            "Başvuru şu anda okunamıyor.",
            kind="unavailable",
        )

    application = application_result["application"]
    application_status = str(application.get("status") or "")

    if application_status == "approved":
        return _load_approved_application(application)

    if application_status not in {"pending", "contacted"}:
        return _failure(
            "seller_application_not_invitable",
            "Yalnızca pending veya contacted başvurular davet edilebilir.",
            kind="conflict",
        )

    resolved_email = request.email or str(application.get("email") or "").strip().lower() or None
    if resolved_email is None or not _EMAIL_RE.fullmatch(resolved_email):
        return _failure(
            "seller_invitation_email_required",
            "Seller daveti için geçerli bir e-posta adresi zorunludur.",
            kind="validation",
        )

    full_name = str(application.get("full_name") or "").strip()
    if not full_name:
        return _failure(
            "seller_application_incomplete",
            "Başvurunun ad soyad bilgisi eksik.",
            kind="unavailable",
        )

    auth_result = create_seller_invite_auth_user(
        resolved_email,
        full_name,
        application_id=application_id,
        redirect_to=None,
    )
    auth_status = auth_result.get("durum")
    if auth_status == "çakışma":
        return _failure(
            "seller_invitation_auth_conflict",
            "Bu e-posta için zaten bir Auth hesabı bulunuyor.",
            kind="conflict",
        )
    if auth_status == "doğrulama_hatası":
        return _failure(
            "seller_invitation_validation_error",
            auth_result.get("mesaj") or "Davet bilgileri geçersiz.",
            kind="validation",
        )
    if auth_status != "başarılı":
        return _failure(
            "seller_invitation_auth_unavailable",
            "Seller daveti şu anda oluşturulamıyor.",
            kind="unavailable",
        )

    auth_user_id = str(auth_result.get("auth_user_id") or "").strip()
    if not auth_user_id:
        return _failure(
            "seller_invitation_auth_unavailable",
            "Seller daveti oluşturuldu ancak Auth kullanıcı kimliği alınamadı.",
            kind="unavailable",
        )

    finalize_result = finalize_seller_invitation_from_application(
        application_id=application_id,
        auth_user_id=auth_user_id,
        invite_email=resolved_email,
        admin_note=request.admin_note,
    )
    finalize_status = finalize_result.get("durum")

    if finalize_status == "başarılı":
        return _success_payload(
            finalize_result["application"],
            finalize_result["seller"],
            finalize_result["profile"],
            already_processed=False,
            invitation_sent=True,
        )

    if finalize_status == "zaten_davet_edildi":
        profile = finalize_result["profile"]
        existing_auth_user_id = str(profile.get("auth_user_id") or "")
        warning = None
        if existing_auth_user_id != auth_user_id and not _cleanup_new_auth_user(auth_user_id):
            warning = (
                "Başvuru zaten tamamlanmıştı; bu denemede oluşturulan fazladan "
                "Auth kullanıcısı otomatik temizlenemedi."
            )
        return _success_payload(
            finalize_result["application"],
            finalize_result["seller"],
            profile,
            already_processed=True,
            invitation_sent=False,
            warning=warning,
        )

    if finalize_status == "hata":
        reconciled = _reconcile_after_finalize_failure(application_id, auth_user_id)
        if reconciled is not None:
            return reconciled

    cleanup_ok = _cleanup_new_auth_user(auth_user_id)
    if not cleanup_ok:
        return _failure(
            "seller_invitation_partial_failure",
            (
                "Auth daveti oluşturuldu fakat seller hesabı tamamlanamadı ve "
                "Auth kullanıcısı otomatik temizlenemedi."
            ),
            kind="partial_failure",
        )

    if finalize_status == "bulunamadı":
        return _failure(
            "seller_application_not_found",
            "Başvuru bulunamadı.",
            kind="not_found",
        )
    if finalize_status == "çakışma":
        return _failure(
            "seller_invitation_conflict",
            finalize_result.get("mesaj") or "Başvuru davet işlemiyle çakıştı.",
            kind="conflict",
        )
    if finalize_status == "doğrulama_hatası":
        return _failure(
            "seller_invitation_validation_error",
            finalize_result.get("mesaj") or "Davet bilgileri geçersiz.",
            kind="validation",
        )

    return _failure(
        "seller_invitation_finalize_unavailable",
        "Seller hesabı şu anda tamamlanamıyor.",
        kind="unavailable",
    )

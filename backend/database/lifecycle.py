from __future__ import annotations

from datetime import timedelta
from typing import Any


def get_supabase():
    import database
    return database.get_supabase()


def utc_now():
    import database
    return database.utc_now()


def utc_iso() -> str:
    import database
    return database.utc_iso()


def get_seller_by_id(seller_id: int) -> dict[str, Any]:
    import database
    return database.get_seller_by_id(seller_id)


def configure_founder_beta(seller_id: int, beta_days: int = 30) -> dict[str, Any]:
    if beta_days < 1:
        return {"durum": "hata", "mesaj": "Beta süresi en az 1 gün olmalıdır."}
    try:
        result = (
            get_supabase().table("sellers")
            .update({
                "account_type": "founder_beta",
                "system_status": "onboarding",
                "payment_required": False,
                "special_pricing": True,
                "activation_requires_admin": True,
                "beta_duration_days": beta_days,
                "beta_started_at": None,
                "beta_ends_at": None,
                "ai_enabled": False,
            })
            .eq("id", seller_id).execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Satıcı bulunamadı."}
        return {"durum": "başarılı", "seller": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def activate_seller(
    seller_id: int,
    activated_by_admin: bool = False,
) -> dict[str, Any]:
    try:
        seller_result = get_seller_by_id(seller_id)
        if seller_result.get("durum") != "başarılı":
            return seller_result
        seller = seller_result["satıcı"]
        if not seller.get("onboarding_completed"):
            return {"durum": "reddedildi", "mesaj": "Onboarding tamamlanmadan satıcı aktif edilemez."}
        if bool(seller.get("activation_requires_admin")) and not activated_by_admin:
            return {"durum": "admin_onayı_gerekli", "mesaj": "Bu hesap admin onayı olmadan aktif edilemez."}

        account_type = seller.get("account_type")
        update_data: dict[str, Any] = {
            "status": "active",
            "activated_at": seller.get("activated_at") or utc_iso(),
            "ai_enabled": True,
            "emergency_paused": False,
            "emergency_paused_at": None,
            "emergency_pause_reason": None,
        }
        if account_type == "founder_beta":
            next_status = "beta_active"
            if not seller.get("beta_started_at") or not seller.get("beta_ends_at"):
                beta_start = utc_now()
                beta_days = int(seller.get("beta_duration_days") or 30)
                beta_end = beta_start + timedelta(days=beta_days)
                update_data["beta_started_at"] = beta_start.isoformat()
                update_data["beta_ends_at"] = beta_end.isoformat()
        else:
            next_status = "active"
        update_data["system_status"] = next_status

        result = (
            get_supabase().table("sellers").update(update_data)
            .eq("id", seller_id).execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Satıcı aktifleştirilemedi veya bulunamadı."}
        return {"durum": "başarılı", "seller": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def pause_seller_ai(seller_id: int, reason: str) -> dict[str, Any]:
    try:
        result = (
            get_supabase().table("sellers")
            .update({
                "ai_enabled": False,
                "emergency_paused": True,
                "emergency_paused_at": utc_iso(),
                "emergency_pause_reason": reason.strip(),
            })
            .eq("id", seller_id).execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Satıcı bulunamadı."}
        return {"durum": "başarılı", "seller": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def resume_seller_ai(seller_id: int) -> dict[str, Any]:
    try:
        seller_result = get_seller_by_id(seller_id)
        if seller_result.get("durum") != "başarılı":
            return seller_result
        seller = seller_result["satıcı"]
        if seller.get("system_status") not in {"active", "beta_active"}:
            return {"durum": "reddedildi", "mesaj": "Aktif olmayan satıcıda AI yeniden açılamaz."}
        result = (
            get_supabase().table("sellers")
            .update({
                "ai_enabled": True,
                "emergency_paused": False,
                "emergency_paused_at": None,
                "emergency_pause_reason": None,
            })
            .eq("id", seller_id).execute()
        )
        return {"durum": "başarılı", "seller": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}

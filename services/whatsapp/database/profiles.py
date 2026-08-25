from __future__ import annotations

from typing import Any


def get_supabase():
    import database
    return database.get_supabase()


VALID_USER_ROLES = {"admin", "seller"}
VALID_USER_STATUSES = {"invited", "active", "suspended", "deactivated"}


def create_user_profile(
    auth_user_id: str,
    email: str,
    full_name: str,
    role: str,
    seller_id: int | None = None,
    status: str = "invited",
) -> dict[str, Any]:
    if role not in VALID_USER_ROLES:
        return {"durum": "hata", "mesaj": f"Geçersiz kullanıcı rolü: {role}"}
    if status not in VALID_USER_STATUSES:
        return {"durum": "hata", "mesaj": f"Geçersiz kullanıcı durumu: {status}"}
    if role == "seller" and seller_id is None:
        return {"durum": "hata", "mesaj": "Satıcı rolü için seller_id zorunludur."}
    if role == "admin" and seller_id is not None:
        return {"durum": "hata", "mesaj": "Admin rolü seller_id ile bağlanamaz."}

    try:
        data: dict[str, Any] = {
            "auth_user_id": auth_user_id,
            "email": email.strip().lower(),
            "full_name": full_name.strip(),
            "role": role,
            "status": status,
            "seller_id": seller_id,
        }
        result = get_supabase().table("user_profiles").insert(data).execute()
        return {"durum": "başarılı", "profile": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def get_user_profile_by_auth_user_id(auth_user_id: str) -> dict[str, Any]:
    try:
        result = (
            get_supabase().table("user_profiles")
            .select("*").eq("auth_user_id", auth_user_id).limit(1).execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Kullanıcı profili bulunamadı."}
        return {"durum": "başarılı", "profile": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def get_user_profile_by_seller_id(seller_id: int) -> dict[str, Any]:
    if not isinstance(seller_id, int) or isinstance(seller_id, bool) or seller_id < 1:
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id pozitif tam sayı olmalıdır."}
    try:
        result = (
            get_supabase().table("user_profiles")
            .select("*").eq("seller_id", seller_id).eq("role", "seller").limit(1).execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Seller kullanıcı profili bulunamadı."}
        return {"durum": "başarılı", "profile": result.data[0]}
    except Exception:
        return {"durum": "hata", "mesaj": "Seller kullanıcı profili okunamadı."}


def update_user_profile_status(profile_id: int, status: str) -> dict[str, Any]:
    if status not in VALID_USER_STATUSES:
        return {"durum": "hata", "mesaj": f"Geçersiz kullanıcı durumu: {status}"}
    try:
        result = (
            get_supabase().table("user_profiles")
            .update({"status": status}).eq("id", profile_id).execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Kullanıcı profili bulunamadı."}
        return {"durum": "başarılı", "profile": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}

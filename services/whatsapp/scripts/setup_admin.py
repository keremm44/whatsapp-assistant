from __future__ import annotations

import getpass
from typing import Any

from auth_service import create_admin_profile
from database import get_supabase


def object_to_dict(value: Any) -> dict[str, Any]:
    if value is None:
        return {}

    if isinstance(value, dict):
        return value

    model_dump = getattr(value, "model_dump", None)

    if callable(model_dump):
        result = model_dump()
        return result if isinstance(result, dict) else {}

    as_dict = getattr(value, "dict", None)

    if callable(as_dict):
        result = as_dict()
        return result if isinstance(result, dict) else {}

    raw = getattr(value, "__dict__", None)

    if isinstance(raw, dict):
        return {
            key: item
            for key, item in raw.items()
            if not key.startswith("_")
        }

    return {}


def extract_user(response: Any) -> dict[str, Any]:
    if response is None:
        return {}

    if isinstance(response, dict):
        if response.get("user") is not None:
            return object_to_dict(response["user"])

        data = response.get("data")

        if isinstance(data, dict) and data.get("user") is not None:
            return object_to_dict(data["user"])

        return {}

    direct_user = getattr(response, "user", None)

    if direct_user is not None:
        return object_to_dict(direct_user)

    data = getattr(response, "data", None)

    if data is not None:
        nested_user = getattr(data, "user", None)

        if nested_user is not None:
            return object_to_dict(nested_user)

        data_dict = object_to_dict(data)

        if data_dict.get("user") is not None:
            return object_to_dict(data_dict["user"])

    return {}


def find_auth_user_by_email(email: str) -> dict[str, Any] | None:
    """
    Auth kullanıcılarını sayfalayarak e-posta ile arar.

    Bu fonksiyon yalnızca backend service/secret anahtarıyla çalıştırılmalıdır.
    """
    supabase = get_supabase()
    page = 1
    per_page = 100

    while True:
        response = supabase.auth.admin.list_users(
            page=page,
            per_page=per_page,
        )

        response_dict = object_to_dict(response)
        users_raw = response_dict.get("users")

        if users_raw is None:
            users_raw = getattr(response, "users", None)

        users = users_raw or []

        for item in users:
            user = object_to_dict(item)

            if str(user.get("email") or "").strip().lower() == email:
                return user

        if len(users) < per_page:
            return None

        page += 1


def create_or_get_admin_auth_user(
    email: str,
    password: str,
    full_name: str,
) -> dict[str, Any]:
    supabase = get_supabase()

    existing = find_auth_user_by_email(email)

    if existing:
        print("Auth kullanıcısı zaten mevcut.")
        return existing

    response = supabase.auth.admin.create_user(
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {
                "full_name": full_name,
                "app_role": "admin",
            },
        }
    )

    user = extract_user(response)

    if not user.get("id"):
        raise RuntimeError(
            "Auth kullanıcısı oluşturuldu ancak kullanıcı UUID alınamadı."
        )

    print("Auth kullanıcısı oluşturuldu.")
    return user


def create_or_get_admin_profile(
    auth_user_id: str,
    email: str,
    full_name: str,
) -> dict[str, Any]:
    supabase = get_supabase()

    existing = (
        supabase.table("user_profiles")
        .select("*")
        .eq("auth_user_id", auth_user_id)
        .limit(1)
        .execute()
    )

    if existing.data:
        profile = existing.data[0]

        if profile.get("role") != "admin":
            raise RuntimeError(
                "Bu Auth kullanıcısına bağlı profil admin rolünde değil."
            )

        if profile.get("seller_id") is not None:
            raise RuntimeError(
                "Admin profilinde seller_id bulunmamalıdır."
            )

        if profile.get("status") != "active":
            updated = (
                supabase.table("user_profiles")
                .update({"status": "active"})
                .eq("id", profile["id"])
                .execute()
            )

            if updated.data:
                profile = updated.data[0]

        print("Admin profili zaten mevcut.")
        return {
            "durum": "başarılı",
            "profile": profile,
            "zaten_mevcut": True,
        }

    result = create_admin_profile(
        auth_user_id=auth_user_id,
        email=email,
        full_name=full_name,
    )

    if result.get("durum") != "başarılı":
        raise RuntimeError(
            f"Admin profili oluşturulamadı: {result}"
        )

    print("Admin profili oluşturuldu.")
    return result


def main() -> None:
    print("=" * 72)
    print("İLK ADMIN HESABI KURULUMU")
    print("=" * 72)
    print(
        "Bu işlem Supabase Auth kullanıcısı ve user_profiles admin "
        "kaydı oluşturur."
    )

    email = input("Admin e-posta: ").strip().lower()
    full_name = input("Admin ad soyad: ").strip()
    password = getpass.getpass(
        "Admin şifresi (en az 8 karakter): "
    )
    password_again = getpass.getpass("Şifre tekrar: ")

    if not email:
        raise ValueError("E-posta boş olamaz.")

    if not full_name:
        raise ValueError("Ad soyad boş olamaz.")

    if len(password) < 8:
        raise ValueError("Şifre en az 8 karakter olmalıdır.")

    if password != password_again:
        raise ValueError("Şifreler eşleşmiyor.")

    auth_user = create_or_get_admin_auth_user(
        email=email,
        password=password,
        full_name=full_name,
    )

    auth_user_id = str(auth_user["id"])

    profile_result = create_or_get_admin_profile(
        auth_user_id=auth_user_id,
        email=email,
        full_name=full_name,
    )

    print("\n" + "=" * 72)
    print("ADMIN KURULUMU BAŞARILI")
    print("=" * 72)
    print(f"Auth UUID : {auth_user_id}")
    print(f"E-posta   : {email}")
    print(f"Rol       : {profile_result['profile']['role']}")
    print(f"Durum     : {profile_result['profile']['status']}")
    print(
        "\nŞimdi API çalışırken şu komutu çalıştır: "
        "python -m tests.live.live_check_auth"
    )


if __name__ == "__main__":
    main()

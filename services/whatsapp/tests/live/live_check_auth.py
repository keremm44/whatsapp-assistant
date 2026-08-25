from __future__ import annotations

import getpass
import os
from typing import Any

import httpx
from dotenv import load_dotenv
from supabase import create_client


load_dotenv()


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


def extract_session(response: Any) -> dict[str, Any]:
    if response is None:
        return {}

    if isinstance(response, dict):
        session = response.get("session")

        if session is not None:
            return object_to_dict(session)

        data = response.get("data")

        if isinstance(data, dict) and data.get("session") is not None:
            return object_to_dict(data["session"])

        return {}

    direct_session = getattr(response, "session", None)

    if direct_session is not None:
        return object_to_dict(direct_session)

    data = getattr(response, "data", None)

    if data is not None:
        nested_session = getattr(data, "session", None)

        if nested_session is not None:
            return object_to_dict(nested_session)

        data_dict = object_to_dict(data)

        if data_dict.get("session") is not None:
            return object_to_dict(data_dict["session"])

    return {}


def main() -> None:
    supabase_url = os.getenv("SUPABASE_URL")
    public_key = (
        os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("SUPABASE_PUBLISHABLE_KEY")
    )
    api_base_url = os.getenv(
        "LOCAL_API_URL",
        "http://127.0.0.1:8000",
    ).rstrip("/")

    if not supabase_url:
        raise RuntimeError("SUPABASE_URL bulunamadı.")

    if not public_key:
        raise RuntimeError(
            "SUPABASE_ANON_KEY veya SUPABASE_PUBLISHABLE_KEY bulunamadı.\n"
            "Supabase Dashboard > Project Settings > API bölümündeki "
            "public/anon anahtarını .env dosyasına ekle."
        )

    print("=" * 72)
    print("GERÇEK SUPABASE AUTH VE KORUMALI API TESTİ")
    print("=" * 72)

    email = input("Admin e-posta: ").strip().lower()
    password = getpass.getpass("Admin şifresi: ")

    public_client = create_client(
        supabase_url,
        public_key,
    )

    sign_in = public_client.auth.sign_in_with_password(
        {
            "email": email,
            "password": password,
        }
    )

    session = extract_session(sign_in)
    access_token = session.get("access_token")

    if not access_token:
        raise RuntimeError(
            "Giriş başarılı görünmesine rağmen access token alınamadı."
        )

    print("Supabase Auth girişi başarılı.")
    print(f"Access token alındı: {access_token[:20]}...")

    headers = {
        "Authorization": f"Bearer {access_token}",
    }

    with httpx.Client(
        base_url=api_base_url,
        timeout=20.0,
    ) as client:
        auth_me = client.get(
            "/auth/me",
            headers=headers,
        )

        print(f"\nGET /auth/me -> {auth_me.status_code}")
        print(auth_me.json())

        if auth_me.status_code != 200:
            raise RuntimeError("/auth/me gerçek token testi başarısız.")

        auth_body = auth_me.json()

        if auth_body.get("role") != "admin":
            raise RuntimeError(
                "Gerçek kullanıcı admin rolüyle çözümlenmedi."
            )

        applications = client.get(
            "/admin/applications",
            headers=headers,
        )

        print(
            "\nGET /admin/applications "
            f"-> {applications.status_code}"
        )
        print(applications.json())

        if applications.status_code != 200:
            raise RuntimeError(
                "/admin/applications gerçek admin testi başarısız."
            )

        seller_endpoint = client.get(
            "/seller/me",
            headers=headers,
        )

        print(
            f"\nGET /seller/me -> {seller_endpoint.status_code}"
        )
        print(seller_endpoint.json())

        if seller_endpoint.status_code != 403:
            raise RuntimeError(
                "Admin hesabı seller endpointinden 403 almalıydı."
            )

    print("\n" + "=" * 72)
    print("GERÇEK AUTH VE ROL KORUMASI TESTİ BAŞARILI")
    print("=" * 72)


if __name__ == "__main__":
    main()

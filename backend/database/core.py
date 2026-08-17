from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client
import os


load_dotenv()

_supabase_client: Client | None = None


def get_supabase() -> Client:
    """Supabase istemcisini ihtiyaç anında oluşturup döndürür.

    Modül import edilirken bağlantı kurulmaz. Böylece unit testleri ve
    dokümantasyon araçları gerçek ortam anahtarlarına ihtiyaç duymaz.
    """
    global _supabase_client

    if _supabase_client is not None:
        return _supabase_client

    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_KEY")

    if not supabase_url:
        raise RuntimeError("SUPABASE_URL ortam değişkeni bulunamadı.")

    if not service_key:
        raise RuntimeError("SUPABASE_SERVICE_KEY ortam değişkeni bulunamadı.")

    _supabase_client = create_client(supabase_url, service_key)
    return _supabase_client


def reset_supabase_client() -> None:
    """Supabase istemci önbelleğini temizler."""
    global _supabase_client
    _supabase_client = None


def utc_now() -> datetime:
    """UTC zamanını timezone bilgili olarak döndürür."""
    return datetime.now(timezone.utc)


def utc_iso() -> str:
    """Supabase için ISO formatında UTC zamanı döndürür."""
    return utc_now().isoformat()


def test_connection() -> dict[str, Any]:
    """Supabase bağlantısını test eder."""
    try:
        (
            get_supabase()
            .table("sellers")
            .select("id")
            .limit(1)
            .execute()
        )

        return {
            "durum": "başarılı",
            "bağlantı": True,
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }

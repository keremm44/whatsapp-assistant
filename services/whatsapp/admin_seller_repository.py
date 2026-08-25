from __future__ import annotations

from typing import Any

from database import get_supabase


_ADMIN_SELLER_SELECT = (
    "id,name,store_name,store_link,system_status,onboarding_status,"
    "onboarding_completed,ai_enabled,created_at,updated_at"
)


def _normalize_search(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.strip().split()).casefold()
    return normalized or None


def _matches_search(row: dict[str, Any], search: str) -> bool:
    return any(
        search in str(row.get(field) or "").casefold()
        for field in ("name", "store_name")
    )


def list_admin_seller_records(
    *,
    q: str | None = None,
    system_status: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    """Admin seller directory için yalnız güvenli seller alanlarını okur.

    Serbest metin araması bilinçli olarak Python tarafında güvenli projection
    üzerinde yapılır. Böylece PostgREST filter syntax'ına kullanıcı girdisi
    interpolate edilmez; SQL-looking metinler sıradan arama verisi olarak kalır.
    """
    try:
        query = (
            get_supabase()
            .table("sellers")
            .select(_ADMIN_SELLER_SELECT)
        )

        if system_status is not None:
            query = query.eq("system_status", system_status)

        result = (
            query
            .order("created_at", desc=True)
            .order("id", desc=True)
            .execute()
        )
        rows = result.data
        if not isinstance(rows, list):
            return {
                "durum": "hata",
                "mesaj": "Admin seller directory geçersiz yanıt döndürdü.",
            }

        search = _normalize_search(q)
        if search is not None:
            rows = [
                row
                for row in rows
                if isinstance(row, dict) and _matches_search(row, search)
            ]

        total = len(rows)
        page = rows[offset : offset + limit]
        return {
            "durum": "başarılı",
            "total": total,
            "sellers": page,
        }
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Admin seller directory şu anda okunamıyor.",
        }


def get_admin_seller_record(seller_id: int) -> dict[str, Any]:
    """Tek seller için yalnız admin directory projection'ını döndürür."""
    try:
        result = (
            get_supabase()
            .table("sellers")
            .select(_ADMIN_SELLER_SELECT)
            .eq("id", seller_id)
            .limit(1)
            .execute()
        )
        rows = result.data
        if not isinstance(rows, list):
            return {
                "durum": "hata",
                "mesaj": "Admin seller directory geçersiz yanıt döndürdü.",
            }
        if not rows:
            return {
                "durum": "bulunamadı",
                "mesaj": "Seller bulunamadı.",
            }
        return {
            "durum": "başarılı",
            "seller": rows[0],
        }
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Admin seller directory şu anda okunamıyor.",
        }

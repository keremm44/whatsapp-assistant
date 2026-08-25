from __future__ import annotations

from typing import Any


def get_supabase():
    import database
    return database.get_supabase()


def list_seller_entitlements(seller_id: int) -> dict[str, Any]:
    if not isinstance(seller_id, int) or isinstance(seller_id, bool) or seller_id < 1:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id pozitif tam sayı olmalıdır.",
            "entitlements": [],
        }

    try:
        result = (
            get_supabase()
            .table("seller_entitlements")
            .select("product_key,status,created_at,updated_at")
            .eq("seller_id", seller_id)
            .order("product_key")
            .execute()
        )
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Ürün yetkileri okunamadı.",
            "entitlements": [],
        }

    rows = result.data if isinstance(result.data, list) else []
    return {
        "durum": "başarılı",
        "entitlements": rows,
    }

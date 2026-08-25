from __future__ import annotations

from typing import Any


def get_supabase():
    import database
    return database.get_supabase()


SELLER_SETTINGS_SELECT = (
    "id,name,phone,store_name,store_link,product_info,settings_version,updated_at"
)


def get_seller_settings_record(seller_id: int) -> dict[str, Any]:
    try:
        result = (
            get_supabase().table("sellers").select(SELLER_SETTINGS_SELECT)
            .eq("id", seller_id).limit(1).execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Satıcı bulunamadı."}
        return {"durum": "başarılı", "seller": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def update_seller_settings_record(
    seller_id: int,
    expected_version: int,
    *,
    seller_patch: dict[str, Any],
    product_info: dict[str, Any],
) -> dict[str, Any]:
    payload = dict(seller_patch)
    payload["product_info"] = product_info
    payload["settings_version"] = expected_version + 1
    try:
        result = (
            get_supabase().table("sellers").update(payload)
            .eq("id", seller_id).eq("settings_version", expected_version).execute()
        )
        if result.data:
            return {"durum": "başarılı", "seller": result.data[0]}
        current = get_seller_settings_record(seller_id)
        if current.get("durum") == "bulunamadı":
            return current
        return {"durum": "conflict", "mesaj": "Ayarlar başka bir işlem tarafından değiştirildi."}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def _seller_product_rpc_response(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        return {"durum": "hata", "mesaj": "Ürün RPC cevabı geçersiz."}
    rpc_status = data.get("status")
    if rpc_status == "success":
        result: dict[str, Any] = {"durum": "başarılı"}
        for key in ("products", "product", "total", "changed"):
            if key in data:
                result[key] = data[key]
        return result
    if rpc_status == "not_found":
        return {"durum": "bulunamadı", "mesaj": "Ürün veya satıcı bulunamadı."}
    if rpc_status == "conflict":
        return {
            "durum": "conflict",
            "mesaj": "Ürün başka bir işlem tarafından değiştirildi.",
            "reason": data.get("reason"),
            "current_version": data.get("current_version"),
        }
    if rpc_status == "error":
        return {"durum": "doğrulama_hatası", "mesaj": data.get("message") or "Ürün bilgileri geçersiz."}
    return {"durum": "hata", "mesaj": "Ürün RPC işlemi tamamlanamadı."}


def list_seller_product_records(
    seller_id: int,
    *,
    include_inactive: bool = False,
) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "get_seller_products",
            {"target_seller_id": seller_id, "include_inactive": include_inactive},
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Ürünler getirilemedi."}
    return _seller_product_rpc_response(result.data)


def create_seller_product_record(seller_id: int, *, name: str) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "create_seller_product",
            {"target_seller_id": seller_id, "name_value": name},
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Ürün oluşturulamadı."}
    return _seller_product_rpc_response(result.data)


def update_seller_product_record(
    seller_id: int,
    product_id: int,
    expected_version: int,
    *,
    name: str | None,
    is_active: bool | None,
) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "update_seller_product",
            {
                "target_seller_id": seller_id,
                "target_product_id": product_id,
                "expected_version": expected_version,
                "name_value": name,
                "is_active_value": is_active,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Ürün güncellenemedi."}
    return _seller_product_rpc_response(result.data)

from __future__ import annotations

from typing import Any

from .common import is_positive_int as _is_positive_int


def get_supabase():
    import database
    return database.get_supabase()


def utc_iso() -> str:
    import database
    return database.utc_iso()


ORDER_FIELD_TYPES = {
    "short_text",
    "long_text",
    "number",
    "single_choice",
    "multi_choice",
    "boolean",
    "image",
}


def get_order_field_definitions(
    seller_id: int,
    *,
    product_id: int | None = None,
    include_inactive: bool = False,
) -> dict[str, Any]:
    try:
        query = (
            get_supabase().table("order_field_definitions")
            .select("*").eq("seller_id", seller_id).order("sort_order").order("id")
        )
        if product_id is not None:
            query = query.eq("product_id", product_id)
        if not include_inactive:
            query = query.eq("is_active", True)
        result = query.execute()
        return {"durum": "başarılı", "toplam": len(result.data), "definitions": result.data}
    except Exception:
        return {"durum": "hata", "mesaj": "Alan tanımları okunamadı."}


def create_order_field_definition(
    seller_id: int,
    *,
    field_key: str,
    label: str,
    field_type: str,
    is_required: bool,
    sort_order: int,
    product_id: int | None = None,
    options: list[dict[str, Any]] | None = None,
    validation_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if field_type not in ORDER_FIELD_TYPES:
        return {"durum": "doğrulama_hatası", "mesaj": f"Geçersiz alan tipi: {field_type}"}
    if sort_order < 0:
        return {"durum": "doğrulama_hatası", "mesaj": "sort_order negatif olamaz."}
    try:
        data: dict[str, Any] = {
            "seller_id": seller_id,
            "field_key": field_key,
            "label": label,
            "field_type": field_type,
            "is_required": is_required,
            "is_active": True,
            "sort_order": sort_order,
            "options": options or [],
            "validation_config": validation_config or {},
        }
        if product_id is not None:
            data["product_id"] = product_id
        result = get_supabase().table("order_field_definitions").insert(data).execute()
        return {"durum": "başarılı", "definition": result.data[0]}
    except Exception as exc:
        error_text = str(exc)
        if "duplicate key" in error_text.lower() or "23505" in error_text:
            return {"durum": "çakışma", "mesaj": "Bu alan anahtarı bu satıcı için zaten kullanılıyor."}
        return {"durum": "hata", "mesaj": "Alan tanımı oluşturulamadı."}


def update_order_field_definition(
    seller_id: int,
    field_id: int,
    *,
    expected_version: int,
    label: str | None = None,
    is_required: bool | None = None,
    is_active: bool | None = None,
    sort_order: int | None = None,
) -> dict[str, Any]:
    if not _is_positive_int(field_id):
        return {"durum": "doğrulama_hatası", "mesaj": "field_id pozitif tam sayı olmalıdır."}
    if not _is_positive_int(expected_version):
        return {"durum": "doğrulama_hatası", "mesaj": "expected_version pozitif tam sayı olmalıdır."}
    try:
        current_result = (
            get_supabase().table("order_field_definitions")
            .select("*").eq("id", field_id).eq("seller_id", seller_id).limit(1).execute()
        )
        if not current_result.data:
            return {"durum": "bulunamadı", "mesaj": "Alan tanımı bulunamadı."}
        current = current_result.data[0]
        if int(current.get("version") or 0) != expected_version:
            return {
                "durum": "çakışma",
                "mesaj": "Alan tanımı başka bir işlemle değişti.",
                "definition": current,
            }

        update_data: dict[str, Any] = {
            "version": expected_version + 1,
            "updated_at": utc_iso(),
        }
        if label is not None:
            update_data["label"] = label
        if is_required is not None:
            update_data["is_required"] = is_required
        if is_active is not None:
            update_data["is_active"] = is_active
        if sort_order is not None:
            if sort_order < 0:
                return {"durum": "doğrulama_hatası", "mesaj": "sort_order negatif olamaz."}
            update_data["sort_order"] = sort_order

        result = (
            get_supabase().table("order_field_definitions").update(update_data)
            .eq("id", field_id).eq("seller_id", seller_id).eq("version", expected_version).execute()
        )
        if not result.data:
            return {"durum": "çakışma", "mesaj": "Alan tanımı başka bir işlemle değişti."}
        return {"durum": "başarılı", "definition": result.data[0]}
    except Exception:
        return {"durum": "hata", "mesaj": "Alan tanımı güncellenemedi."}


def get_order_field_definition_by_id(
    seller_id: int,
    field_id: int,
) -> dict[str, Any]:
    if not _is_positive_int(field_id):
        return {"durum": "doğrulama_hatası", "mesaj": "field_id pozitif tam sayı olmalıdır."}
    try:
        result = (
            get_supabase().table("order_field_definitions")
            .select("*").eq("id", field_id).eq("seller_id", seller_id).limit(1).execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Alan tanımı bulunamadı."}
        return {"durum": "başarılı", "definition": result.data[0]}
    except Exception:
        return {"durum": "hata", "mesaj": "Alan tanımı okunamadı."}


def get_product_by_id(seller_id: int, product_id: int) -> dict[str, Any]:
    if not _is_positive_int(product_id):
        return {"durum": "doğrulama_hatası", "mesaj": "product_id pozitif tam sayı olmalıdır."}
    try:
        result = (
            get_supabase().table("products").select("*")
            .eq("id", product_id).eq("seller_id", seller_id).limit(1).execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Ürün bulunamadı."}
        return {"durum": "başarılı", "product": result.data[0]}
    except Exception:
        return {"durum": "hata", "mesaj": "Ürün okunamadı."}

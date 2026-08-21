from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload
from .common import is_positive_int as _is_positive_int


def get_supabase():
    import database
    return database.get_supabase()


ORDER_STATUS_COLLECTING = "COLLECTING"
ORDER_STATUS_COMPLETE = "COMPLETE"
ORDER_STATUS_SELLER_REVIEW_REQUIRED = "SELLER_REVIEW_REQUIRED"

VALID_ORDER_STATUSES = {
    ORDER_STATUS_COLLECTING,
    ORDER_STATUS_COMPLETE,
    ORDER_STATUS_SELLER_REVIEW_REQUIRED,
}

ORDER_DISPLAY_STATUS = {
    ORDER_STATUS_COLLECTING: "Bilgi toplanıyor",
    ORDER_STATUS_COMPLETE: "Bilgiler tamamlandı",
    ORDER_STATUS_SELLER_REVIEW_REQUIRED: "Satıcı incelemesi gerekiyor",
}


def _order_rpc_response(data: Any) -> dict[str, Any]:
    payload = _extract_rpc_payload(data)
    if payload is None:
        return {"durum": "hata", "mesaj": "Sipariş işlemi geçersiz yanıt döndürdü."}

    status = payload.get("status")
    if status == "not_found":
        return {"durum": "bulunamadı", "mesaj": "Sipariş bulunamadı."}
    if status == "forbidden":
        return {"durum": "reddedildi", "mesaj": "Sipariş işlemi bu tenant için geçersiz."}
    if status == "conflict":
        response: dict[str, Any] = {
            "durum": "çakışma",
            "mesaj": payload.get("message") or "Sipariş kaydı değişti.",
        }
        if payload.get("order"):
            response["order"] = payload["order"]
        return response
    if status == "order_product_change_requires_review":
        response = {
            "durum": "ürün_değişikliği_inceleme_gerekli",
            "mesaj": (
                "Değer toplanmaya başlanmış siparişte ürün değişikliği "
                "satıcı incelemesi gerektirir."
            ),
        }
        if payload.get("order"):
            response["order"] = payload["order"]
        return response
    if status == "error":
        return {"durum": "hata", "mesaj": payload.get("message") or "Sipariş işlemi tamamlanamadı."}
    if status != "success" or not payload.get("order"):
        return {"durum": "hata", "mesaj": "Sipariş işlemi geçersiz yanıt döndürdü."}

    response: dict[str, Any] = {"durum": "başarılı", "order": payload["order"]}
    if payload.get("changed") is not None:
        response["changed"] = payload["changed"] is True
    if payload.get("created") is not None:
        response["created"] = payload["created"] is True
    if payload.get("completed") is not None:
        response["completed"] = payload["completed"] is True
    if payload.get("idempotent") is not None:
        response["idempotent"] = payload["idempotent"] is True
    if payload.get("snapshot_count") is not None:
        response["snapshot_count"] = payload["snapshot_count"]
    if payload.get("race_resolved") is not None:
        response["race_resolved"] = payload["race_resolved"] is True
    return response


def get_or_create_active_order(
    seller_id: int,
    customer_id: int,
    source_message_id: int,
) -> dict[str, Any]:
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id ve customer_id pozitif tam sayı olmalıdır."}
    if not _is_positive_int(source_message_id):
        return {"durum": "doğrulama_hatası", "mesaj": "source_message_id pozitif tam sayı olmalıdır."}
    try:
        result = get_supabase().rpc(
            "get_or_create_active_order",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "source_message_id": source_message_id,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Aktif sipariş işlemi tamamlanamadı."}
    return _order_rpc_response(result.data)


def initialize_order_collection(
    seller_id: int,
    customer_id: int,
    source_message_id: int,
) -> dict[str, Any]:
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id ve customer_id pozitif tam sayı olmalıdır."}
    if not _is_positive_int(source_message_id):
        return {"durum": "doğrulama_hatası", "mesaj": "source_message_id pozitif tam sayı olmalıdır."}
    try:
        result = get_supabase().rpc(
            "initialize_order_collection",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "source_message_id": source_message_id,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Sipariş toplama başlangıcı tamamlanamadı."}
    return _order_rpc_response(result.data)


def set_order_product_and_snapshot_fields(
    seller_id: int,
    customer_id: int,
    order_id: int,
    product_id: int,
    expected_version: int | None = None,
) -> dict[str, Any]:
    if not _is_positive_int(order_id) or not _is_positive_int(product_id):
        return {"durum": "doğrulama_hatası", "mesaj": "order_id ve product_id pozitif tam sayı olmalıdır."}
    if expected_version is not None and not _is_positive_int(expected_version):
        return {"durum": "doğrulama_hatası", "mesaj": "expected_version pozitif tam sayı olmalıdır."}
    try:
        result = get_supabase().rpc(
            "set_order_product_and_snapshot_fields",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_order_id": order_id,
                "target_product_id": product_id,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Ürün ve alan snapshot işlemi tamamlanamadı."}
    return _order_rpc_response(result.data)


def record_order_field_value(
    seller_id: int,
    customer_id: int,
    order_id: int,
    field_snapshot_id: int,
    value: Any,
    source_message_id: int,
    expected_version: int | None = None,
) -> dict[str, Any]:
    if not _is_positive_int(field_snapshot_id):
        return {"durum": "doğrulama_hatası", "mesaj": "field_snapshot_id pozitif tam sayı olmalıdır."}
    if expected_version is not None and not _is_positive_int(expected_version):
        return {"durum": "doğrulama_hatası", "mesaj": "expected_version pozitif tam sayı olmalıdır."}
    try:
        result = get_supabase().rpc(
            "record_order_field_value",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_order_id": order_id,
                "target_field_snapshot_id": field_snapshot_id,
                "value_jsonb": value,
                "source_message_id": source_message_id,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Sipariş alan değeri kaydedilemedi."}
    return _order_rpc_response(result.data)


def update_order_core(
    seller_id: int,
    customer_id: int,
    order_id: int,
    external_order_number: str | None = None,
    customer_phone_snapshot: str | None = None,
    customer_note: str | None = None,
    image_message_id: int | None = None,
    custom_text: str | None = None,
    clear_custom_text: bool = False,
    expected_version: int | None = None,
) -> dict[str, Any]:
    if expected_version is not None and not _is_positive_int(expected_version):
        return {"durum": "doğrulama_hatası", "mesaj": "expected_version pozitif tam sayı olmalıdır."}
    try:
        result = get_supabase().rpc(
            "update_order_core",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_order_id": order_id,
                "new_external_order_number": external_order_number,
                "new_customer_phone_snapshot": customer_phone_snapshot,
                "new_customer_note": customer_note,
                "new_image_message_id": image_message_id,
                "new_custom_text": custom_text,
                "clear_custom_text": clear_custom_text,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Sipariş core alanları güncellenemedi."}
    return _order_rpc_response(result.data)


def update_order_core_from_message(
    seller_id: int,
    customer_id: int,
    order_id: int,
    source_message_id: int,
    external_order_number: str | None = None,
    customer_phone_snapshot: str | None = None,
    customer_note: str | None = None,
    image_message_id: int | None = None,
    custom_text: str | None = None,
    clear_custom_text: bool = False,
    expected_version: int | None = None,
) -> dict[str, Any]:
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
        or not _is_positive_int(order_id)
        or not _is_positive_int(source_message_id)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id, customer_id, order_id ve source_message_id pozitif tam sayı olmalıdır.",
        }
    if image_message_id is not None and not _is_positive_int(image_message_id):
        return {"durum": "doğrulama_hatası", "mesaj": "image_message_id pozitif tam sayı olmalıdır."}
    if expected_version is not None and not _is_positive_int(expected_version):
        return {"durum": "doğrulama_hatası", "mesaj": "expected_version pozitif tam sayı olmalıdır."}
    try:
        result = get_supabase().rpc(
            "update_order_core_from_message",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_order_id": order_id,
                "source_message_id": source_message_id,
                "new_external_order_number": external_order_number,
                "new_customer_phone_snapshot": customer_phone_snapshot,
                "new_customer_note": customer_note,
                "new_image_message_id": image_message_id,
                "new_custom_text": custom_text,
                "clear_custom_text": clear_custom_text,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Sipariş core alanları kaynak mesajla güncellenemedi."}
    return _order_rpc_response(result.data)


def flag_order_review(
    seller_id: int,
    customer_id: int,
    order_id: int,
    review_code: str,
    review_note: str | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    if expected_version is not None and not _is_positive_int(expected_version):
        return {"durum": "doğrulama_hatası", "mesaj": "expected_version pozitif tam sayı olmalıdır."}
    try:
        result = get_supabase().rpc(
            "flag_order_review",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_order_id": order_id,
                "review_code": review_code,
                "review_note": review_note,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Sipariş inceleme durumuna alınamadı."}
    return _order_rpc_response(result.data)


def get_order_by_id(seller_id: int, order_id: int) -> dict[str, Any]:
    if not _is_positive_int(order_id):
        return {"durum": "doğrulama_hatası", "mesaj": "order_id pozitif tam sayı olmalıdır."}
    try:
        result = (
            get_supabase().table("orders").select("*")
            .eq("id", order_id).eq("seller_id", seller_id).limit(1).execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Sipariş bulunamadı."}
        return {"durum": "başarılı", "order": result.data[0]}
    except Exception:
        return {"durum": "hata", "mesaj": "Sipariş okunamadı."}


def get_order_detail(seller_id: int, order_id: int) -> dict[str, Any]:
    import database
    order_result = database.get_order_by_id(seller_id, order_id)
    if order_result.get("durum") != "başarılı":
        return order_result
    order = order_result["order"]
    try:
        snapshots_result = (
            get_supabase().table("order_field_snapshots")
            .select("*").eq("order_id", order_id).order("sort_order_snapshot").execute()
        )
        snapshots = snapshots_result.data or []
        values_result = (
            get_supabase().table("order_field_values")
            .select("*").eq("order_id", order_id).execute()
        )
        values_by_snapshot: dict[int, dict[str, Any]] = {}
        for value_row in values_result.data or []:
            snapshot_id = value_row.get("field_snapshot_id")
            if _is_positive_int(snapshot_id):
                values_by_snapshot[snapshot_id] = value_row

        fields: list[dict[str, Any]] = []
        for snapshot in snapshots:
            snapshot_id = snapshot.get("id")
            value_row = values_by_snapshot.get(snapshot_id)
            fields.append({
                "id": snapshot_id,
                "source_definition_id": snapshot.get("source_definition_id"),
                "definition_version": snapshot.get("definition_version"),
                "field_key": snapshot.get("field_key"),
                "label": snapshot.get("label_snapshot"),
                "field_type": snapshot.get("field_type_snapshot"),
                "is_required": snapshot.get("is_required_snapshot"),
                "sort_order": snapshot.get("sort_order_snapshot"),
                "options": snapshot.get("options_snapshot") or [],
                "validation_config": snapshot.get("validation_snapshot") or {},
                "value": value_row.get("value") if value_row is not None else None,
                "source_message_id": value_row.get("source_message_id") if value_row is not None else None,
                "completed": value_row is not None,
            })
        return {"durum": "başarılı", "order": order, "fields": fields}
    except Exception:
        return {"durum": "hata", "mesaj": "Sipariş detayı okunamadı."}


def list_orders(
    seller_id: int,
    *,
    view: str = "all",
    status: str | None = None,
    product_id: int | None = None,
    image_missing: bool | None = None,
    customer_id: int | None = None,
    external_order_number: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    if view not in {"action_required", "collecting", "all"}:
        return {"durum": "doğrulama_hatası", "mesaj": "view değeri geçersiz."}
    if limit < 1 or limit > 100:
        return {"durum": "doğrulama_hatası", "mesaj": "limit 1 ile 100 arasında olmalıdır."}
    if offset < 0 or offset > 10_000:
        return {"durum": "doğrulama_hatası", "mesaj": "offset 0 ile 10.000 arasında olmalıdır."}
    try:
        query = (
            get_supabase().table("orders")
            .select("id,seller_id,customer_id,product_id,product_name_snapshot,external_order_number,customer_phone_snapshot,image_message_id,custom_text,status,review_reason_code,review_reason_note,version,created_at,updated_at,completed_at")
            .eq("seller_id", seller_id)
            .order("updated_at", desc=True).range(offset, offset + limit - 1)
        )
        if view == "action_required":
            query = query.eq("status", ORDER_STATUS_SELLER_REVIEW_REQUIRED)
        elif view == "collecting":
            query = query.eq("status", ORDER_STATUS_COLLECTING)
        if status is not None:
            if status not in VALID_ORDER_STATUSES:
                return {"durum": "doğrulama_hatası", "mesaj": f"Geçersiz sipariş durumu: {status}"}
            query = query.eq("status", status)
        if product_id is not None:
            query = query.eq("product_id", product_id)
        if image_missing is not None:
            if image_missing:
                query = query.is_("image_message_id", "null")
            else:
                query = query.not_.is_("image_message_id", "null")
        if customer_id is not None:
            query = query.eq("customer_id", customer_id)
        if external_order_number:
            query = query.eq("external_order_number", external_order_number)
        result = query.execute()
        return {"durum": "başarılı", "toplam": len(result.data), "orders": result.data}
    except Exception:
        return {"durum": "hata", "mesaj": "Siparişler okunamadı."}

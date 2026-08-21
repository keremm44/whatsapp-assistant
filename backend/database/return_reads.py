from __future__ import annotations

from typing import Any

from .common import is_positive_int as _is_positive_int
from .returns import (
    RETURN_ISSUE_STATUS_COLLECTING,
    RETURN_ISSUE_STATUS_HANDLED,
    RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED,
    RETURN_ISSUE_TYPES,
)


def get_supabase():
    import database
    return database.get_supabase()


def get_active_return_issue_request(
    seller_id: int,
    customer_id: int,
) -> dict[str, Any]:
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id ve customer_id pozitif tam sayı olmalıdır."}
    try:
        result = (
            get_supabase().table("return_issue_requests").select("*")
            .eq("seller_id", seller_id).eq("customer_id", customer_id)
            .in_("status", [RETURN_ISSUE_STATUS_COLLECTING, RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED])
            .order("id").limit(1).execute()
        )
        return {"durum": "başarılı", "request": result.data[0] if result.data else None}
    except Exception:
        return {"durum": "hata", "mesaj": "Açık iade/sorun talebi okunamadı."}


def get_return_issue_request_by_id(seller_id: int, request_id: int) -> dict[str, Any]:
    if not _is_positive_int(seller_id) or not _is_positive_int(request_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id ve request_id pozitif tam sayı olmalıdır."}
    try:
        result = (
            get_supabase().table("return_issue_requests").select("*")
            .eq("id", request_id).eq("seller_id", seller_id).limit(1).execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "İade/sorun talebi bulunamadı."}
        return {"durum": "başarılı", "request": result.data[0]}
    except Exception:
        return {"durum": "hata", "mesaj": "İade/sorun talebi okunamadı."}


def get_return_issue_request_detail(seller_id: int, request_id: int) -> dict[str, Any]:
    import database
    request_result = database.get_return_issue_request_by_id(seller_id, request_id)
    if request_result.get("durum") != "başarılı":
        return request_result
    request_row = request_result["request"]
    try:
        evidence_result = (
            get_supabase().table("return_issue_request_evidence")
            .select("id,seller_id,request_id,message_id,created_at")
            .eq("seller_id", seller_id).eq("request_id", request_id)
            .order("created_at").order("id").execute()
        )
        customer_result = (
            get_supabase().table("customers")
            .select("id,seller_id,whatsapp_number,name")
            .eq("id", request_row["customer_id"]).eq("seller_id", seller_id)
            .limit(1).execute()
        )
        order_row = None
        if request_row.get("order_id") is not None:
            order_result = (
                get_supabase().table("orders")
                .select("id,seller_id,customer_id,external_order_number,product_name_snapshot,status,version")
                .eq("id", request_row["order_id"]).eq("seller_id", seller_id)
                .limit(1).execute()
            )
            order_row = order_result.data[0] if order_result.data else None
        return {
            "durum": "başarılı",
            "request": request_row,
            "customer": customer_result.data[0] if customer_result.data else None,
            "order": order_row,
            "evidence": evidence_result.data,
        }
    except Exception:
        return {"durum": "hata", "mesaj": "İade/sorun talebi detayı okunamadı."}


def list_return_issue_requests(
    seller_id: int,
    *,
    view: str = "all",
    customer_id: int | None = None,
    issue_type: str | None = None,
    external_order_number: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    if not _is_positive_int(seller_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id pozitif tam sayı olmalıdır."}
    view_status = {
        "action_required": RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED,
        "collecting": RETURN_ISSUE_STATUS_COLLECTING,
        "handled": RETURN_ISSUE_STATUS_HANDLED,
        "all": None,
    }
    if view not in view_status:
        return {"durum": "doğrulama_hatası", "mesaj": "view değeri geçersiz."}
    if not _is_positive_int(limit) or limit > 100:
        return {"durum": "doğrulama_hatası", "mesaj": "limit 1 ile 100 arasında olmalıdır."}
    if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0 or offset > 10_000:
        return {"durum": "doğrulama_hatası", "mesaj": "offset 0 ile 10.000 arasında tam sayı olmalıdır."}
    if customer_id is not None and not _is_positive_int(customer_id):
        return {"durum": "doğrulama_hatası", "mesaj": "customer_id pozitif tam sayı olmalıdır."}
    if issue_type is not None and issue_type not in RETURN_ISSUE_TYPES:
        return {"durum": "doğrulama_hatası", "mesaj": f"Geçersiz iade/sorun tipi: {issue_type}"}
    try:
        query = (
            get_supabase().table("return_issue_requests").select("*")
            .eq("seller_id", seller_id).order("updated_at", desc=True)
            .order("id", desc=True).range(offset, offset + limit - 1)
        )
        if view_status[view] is not None:
            query = query.eq("status", view_status[view])
        if customer_id is not None:
            query = query.eq("customer_id", customer_id)
        if issue_type is not None:
            query = query.eq("issue_type", issue_type)
        if external_order_number:
            query = query.eq("external_order_number_snapshot", external_order_number)
        result = query.execute()
        return {"durum": "başarılı", "toplam": len(result.data), "requests": result.data}
    except Exception:
        return {"durum": "hata", "mesaj": "İade/sorun talepleri okunamadı."}


def get_return_issue_type_settings(seller_id: int) -> dict[str, Any]:
    if not _is_positive_int(seller_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id pozitif tam sayı olmalıdır."}
    try:
        result = (
            get_supabase().table("return_issue_type_settings")
            .select("issue_type,image_requirement,version,updated_at")
            .eq("seller_id", seller_id).order("issue_type").execute()
        )
        return {"durum": "başarılı", "settings": result.data}
    except Exception:
        return {"durum": "hata", "mesaj": "İade/sorun ayarları okunamadı."}

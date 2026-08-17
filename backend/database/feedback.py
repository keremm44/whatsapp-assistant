from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload


def get_supabase():
    import database
    return database.get_supabase()


def _feedback_rpc_response(data: Any) -> dict[str, Any]:
    payload = _extract_rpc_payload(data)
    if payload is None:
        return {"durum": "hata", "mesaj": "Feedback işlemi geçersiz yanıt döndürdü."}
    rpc_status = payload.get("status")
    if rpc_status == "success":
        response: dict[str, Any] = {"durum": "başarılı"}
        for key in ("feedback", "total", "changed"):
            if key in payload:
                response[key] = payload[key]
        return response
    if rpc_status == "not_found":
        return {"durum": "bulunamadı", "mesaj": "Feedback bulunamadı."}
    if rpc_status == "conflict":
        return {
            "durum": "conflict",
            "mesaj": "Feedback başka bir işlem tarafından değiştirildi.",
            "reason": payload.get("reason"),
            "current_version": payload.get("current_version"),
        }
    if rpc_status == "error":
        return {"durum": "doğrulama_hatası", "mesaj": payload.get("message") or "Feedback bilgileri geçersiz."}
    return {"durum": "hata", "mesaj": "Feedback işlemi tamamlanamadı."}


def create_seller_feedback_record(
    seller_id: int,
    *,
    category: str,
    subject: str,
    message: str,
) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "create_seller_feedback",
            {
                "target_seller_id": seller_id,
                "category_value": category,
                "subject_value": subject,
                "message_value": message,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Feedback oluşturulamadı."}
    return _feedback_rpc_response(result.data)


def list_seller_feedback_records(
    seller_id: int,
    *,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "get_seller_feedback_list",
            {
                "target_seller_id": seller_id,
                "result_limit": limit,
                "result_offset": offset,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Feedback listesi okunamadı."}
    return _feedback_rpc_response(result.data)


def get_seller_feedback_record(seller_id: int, feedback_id: int) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "get_seller_feedback_detail",
            {"target_seller_id": seller_id, "target_feedback_id": feedback_id},
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Feedback detayı okunamadı."}
    return _feedback_rpc_response(result.data)


def list_admin_feedback_records(
    *,
    status: str | None = None,
    category: str | None = None,
    seller_id: int | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "get_admin_feedback_list",
            {
                "status_filter": status,
                "category_filter": category,
                "seller_id_filter": seller_id,
                "result_limit": limit,
                "result_offset": offset,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Admin feedback listesi okunamadı."}
    return _feedback_rpc_response(result.data)


def get_admin_feedback_record(feedback_id: int) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "get_admin_feedback_detail",
            {"target_feedback_id": feedback_id},
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Admin feedback detayı okunamadı."}
    return _feedback_rpc_response(result.data)


def update_admin_feedback_record(
    feedback_id: int,
    expected_version: int,
    *,
    status: str | None,
    admin_note: str | None,
    update_status: bool,
    update_admin_note: bool,
) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "update_admin_feedback",
            {
                "target_feedback_id": feedback_id,
                "expected_version_value": expected_version,
                "update_status": update_status,
                "status_value": status,
                "update_admin_note": update_admin_note,
                "admin_note_value": admin_note,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Feedback güncellenemedi."}
    return _feedback_rpc_response(result.data)

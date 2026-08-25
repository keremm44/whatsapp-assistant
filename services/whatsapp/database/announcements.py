from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload


def get_supabase():
    import database
    return database.get_supabase()


def _announcement_rpc_response(data: Any) -> dict[str, Any]:
    payload = _extract_rpc_payload(data)
    if payload is None:
        return {"durum": "hata", "mesaj": "Duyuru işlemi geçersiz yanıt döndürdü."}
    rpc_status = payload.get("status")
    if rpc_status == "success":
        response: dict[str, Any] = {"durum": "başarılı"}
        for key in (
            "announcement",
            "announcements",
            "total",
            "unread_count",
            "announcement_id",
            "is_read",
            "read_at",
            "changed",
        ):
            if key in payload:
                response[key] = payload[key]
        return response
    if rpc_status == "not_found":
        return {"durum": "bulunamadı", "mesaj": "Duyuru bulunamadı."}
    if rpc_status == "error":
        return {"durum": "doğrulama_hatası", "mesaj": payload.get("message") or "Duyuru bilgileri geçersiz."}
    return {"durum": "hata", "mesaj": "Duyuru işlemi tamamlanamadı."}


def create_announcement_record(
    creator_profile_id: int,
    *,
    title: str,
    message: str,
    importance: str,
    image_url: str | None,
    audience_type: str,
    seller_ids: list[int] | None,
) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "create_announcement",
            {
                "creator_profile_id": creator_profile_id,
                "title_value": title,
                "message_value": message,
                "importance_value": importance,
                "image_url_value": image_url,
                "audience_type_value": audience_type,
                "seller_ids_value": seller_ids,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Duyuru yayımlanamadı."}
    return _announcement_rpc_response(result.data)


def list_admin_announcement_records(
    *,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "get_admin_announcements_list",
            {"result_limit": limit, "result_offset": offset},
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Duyuru listesi okunamadı."}
    return _announcement_rpc_response(result.data)


def get_admin_announcement_record(announcement_id: int) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "get_admin_announcement_detail",
            {"target_announcement_id": announcement_id},
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Duyuru detayı okunamadı."}
    return _announcement_rpc_response(result.data)


def list_seller_announcement_records(
    seller_id: int,
    *,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "get_seller_announcements_list",
            {
                "target_seller_id": seller_id,
                "result_limit": limit,
                "result_offset": offset,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Duyurular okunamadı."}
    return _announcement_rpc_response(result.data)


def get_seller_announcement_record(
    seller_id: int,
    announcement_id: int,
) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "get_seller_announcement_detail",
            {
                "target_seller_id": seller_id,
                "target_announcement_id": announcement_id,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Duyuru detayı okunamadı."}
    return _announcement_rpc_response(result.data)


def mark_seller_announcement_read_record(
    seller_id: int,
    announcement_id: int,
) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "mark_seller_announcement_read",
            {
                "target_seller_id": seller_id,
                "target_announcement_id": announcement_id,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Duyuru okundu olarak işaretlenemedi."}
    return _announcement_rpc_response(result.data)


def get_seller_announcement_unread_count_record(
    seller_id: int,
) -> dict[str, Any]:
    try:
        result = get_supabase().rpc(
            "get_seller_announcements_unread_count",
            {"target_seller_id": seller_id},
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Okunmamış duyuru sayısı okunamadı."}
    return _announcement_rpc_response(result.data)

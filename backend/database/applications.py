from __future__ import annotations

from typing import Any
from uuid import UUID

from .common import extract_rpc_payload as _extract_rpc_payload


def get_supabase():
    import database
    return database.get_supabase()


def utc_iso() -> str:
    import database
    return database.utc_iso()


VALID_APPLICATION_STATUSES = {
    "pending",
    "contacted",
    "approved",
    "rejected",
    "cancelled",
}


def create_seller_application(
    full_name: str,
    email: str | None,
    phone: str,
    store_name: str,
    store_link: str | None = None,
    notes: str | None = None,
    product_category: str | None = None,
) -> dict[str, Any]:
    normalized_name = full_name.strip()
    normalized_email = email.strip().lower() if email and email.strip() else None
    normalized_phone = phone.strip()
    normalized_store_name = store_name.strip()
    normalized_store_link = store_link.strip() if store_link and store_link.strip() else None
    normalized_notes = notes.strip() if notes and notes.strip() else None
    normalized_category = product_category.strip() if product_category and product_category.strip() else None

    if not normalized_name:
        return {"durum": "doğrulama_hatası", "mesaj": "Ad soyad zorunludur."}
    if not normalized_phone:
        return {"durum": "doğrulama_hatası", "mesaj": "Telefon zorunludur."}
    if not normalized_store_name:
        return {"durum": "doğrulama_hatası", "mesaj": "Mağaza adı zorunludur."}

    try:
        data: dict[str, Any] = {
            "full_name": normalized_name,
            "phone": normalized_phone,
            "store_name": normalized_store_name,
            "status": "pending",
        }
        if normalized_email is not None:
            data["email"] = normalized_email
        if normalized_store_link is not None:
            data["store_link"] = normalized_store_link
        if normalized_notes is not None:
            data["notes"] = normalized_notes
        if normalized_category is not None:
            data["product_category"] = normalized_category

        result = get_supabase().table("seller_applications").insert(data).execute()
        if not result.data:
            return {"durum": "hata", "mesaj": "Başvuru kaydı oluşturulamadı."}
        return {"durum": "başarılı", "application": result.data[0]}
    except Exception as exc:
        error_text = str(exc)
        if "duplicate key" in error_text.lower() or "23505" in error_text:
            return {"durum": "duplicate", "mesaj": "Açık bir başvuru zaten bulunuyor."}
        return {"durum": "hata", "mesaj": error_text}


def get_seller_application_by_id(application_id: int) -> dict[str, Any]:
    try:
        result = (
            get_supabase().table("seller_applications")
            .select("*").eq("id", application_id).limit(1).execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Başvuru bulunamadı."}
        return {"durum": "başarılı", "application": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def get_seller_applications(
    status: str | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    if status is not None and status not in VALID_APPLICATION_STATUSES:
        return {
            "durum": "hata",
            "mesaj": f"Geçersiz başvuru durumu: {status}",
            "applications": [],
        }
    try:
        query = (
            get_supabase().table("seller_applications")
            .select("*").order("created_at", desc=True).limit(limit)
        )
        if status is not None:
            query = query.eq("status", status)
        result = query.execute()
        return {"durum": "başarılı", "toplam": len(result.data), "applications": result.data}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc), "applications": []}


def update_seller_application_status(
    application_id: int,
    status: str,
    admin_note: str | None = None,
    approved_seller_id: int | None = None,
) -> dict[str, Any]:
    if status not in VALID_APPLICATION_STATUSES:
        return {"durum": "hata", "mesaj": f"Geçersiz başvuru durumu: {status}"}
    try:
        update_data: dict[str, Any] = {"status": status}
        if admin_note is not None:
            update_data["admin_note"] = admin_note.strip() or None
        if status == "contacted":
            update_data["contacted_at"] = utc_iso()
        if status == "approved":
            if approved_seller_id is None:
                return {"durum": "hata", "mesaj": "Onaylanan başvuru için approved_seller_id zorunludur."}
            update_data["approved_at"] = utc_iso()
            update_data["approved_seller_id"] = approved_seller_id
        if status == "rejected":
            update_data["rejected_at"] = utc_iso()

        result = (
            get_supabase().table("seller_applications")
            .update(update_data).eq("id", application_id).execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Başvuru bulunamadı."}
        return {"durum": "başarılı", "application": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def finalize_seller_invitation_from_application(
    application_id: int,
    auth_user_id: str,
    invite_email: str,
    admin_note: str | None = None,
) -> dict[str, Any]:
    if not isinstance(application_id, int) or isinstance(application_id, bool) or application_id < 1:
        return {"durum": "doğrulama_hatası", "mesaj": "application_id pozitif tam sayı olmalıdır."}
    try:
        normalized_auth_user_id = str(UUID(str(auth_user_id).strip()))
    except (TypeError, ValueError, AttributeError):
        return {"durum": "doğrulama_hatası", "mesaj": "auth_user_id geçerli UUID olmalıdır."}

    normalized_email = invite_email.strip().lower()
    if not normalized_email:
        return {"durum": "doğrulama_hatası", "mesaj": "invite_email zorunludur."}
    normalized_admin_note = admin_note.strip() or None if admin_note is not None else None

    try:
        result = get_supabase().rpc(
            "finalize_seller_invitation_from_application",
            {
                "target_application_id": application_id,
                "target_auth_user_id": normalized_auth_user_id,
                "invite_email": normalized_email,
                "admin_note_value": normalized_admin_note,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Seller davet kaydı finalize edilemedi."}

    payload = _extract_rpc_payload(result.data)
    if payload is None:
        return {"durum": "hata", "mesaj": "Seller davet RPC yanıtı geçersiz."}
    status_value = payload.get("status")
    if status_value == "not_found":
        return {"durum": "bulunamadı", "mesaj": "Başvuru bulunamadı."}
    if status_value == "conflict":
        return {"durum": "çakışma", "mesaj": payload.get("message") or "Başvuru davet işlemiyle çakıştı."}
    if status_value == "error":
        return {"durum": "doğrulama_hatası", "mesaj": payload.get("message") or "Davet bilgileri geçersiz."}
    if status_value not in {"success", "already_invited"}:
        return {"durum": "hata", "mesaj": "Seller davet RPC yanıtı geçersiz."}

    application = payload.get("application")
    seller = payload.get("seller")
    profile = payload.get("profile")
    if not all(isinstance(item, dict) for item in (application, seller, profile)):
        return {"durum": "hata", "mesaj": "Seller davet RPC yanıtı eksik."}
    return {
        "durum": "zaten_davet_edildi" if status_value == "already_invited" else "başarılı",
        "application": application,
        "seller": seller,
        "profile": profile,
    }

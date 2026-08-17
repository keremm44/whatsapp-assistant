from __future__ import annotations

from typing import Any


def get_supabase():
    import database

    return database.get_supabase()


def utc_iso() -> str:
    import database

    return database.utc_iso()


VALID_NOTIFICATION_TYPES = {
    "new_order",
    "unanswered_question",
    "violation",
    "return_request",
    "complex_question",
    "system",
}

VALID_NOTIFICATION_SEVERITIES = {
    "info",
    "warning",
    "urgent",
}


def create_seller_notification(
    seller_id: int,
    notification_type: str,
    title: str,
    message: str,
    severity: str = "info",
    customer_id: int | None = None,
    related_entity_type: str | None = None,
    related_entity_id: int | None = None,
    action_url: str | None = None,
    expires_at: str | None = None,
) -> dict[str, Any]:
    """Satıcı için kalıcı panel bildirimi oluşturur."""
    if notification_type not in VALID_NOTIFICATION_TYPES:
        return {
            "durum": "hata",
            "mesaj": f"Geçersiz bildirim tipi: {notification_type}",
        }
    if severity not in VALID_NOTIFICATION_SEVERITIES:
        return {
            "durum": "hata",
            "mesaj": f"Geçersiz bildirim seviyesi: {severity}",
        }

    try:
        data: dict[str, Any] = {
            "seller_id": seller_id,
            "type": notification_type,
            "severity": severity,
            "title": title,
            "message": message,
        }
        optional_fields = {
            "customer_id": customer_id,
            "related_entity_type": related_entity_type,
            "related_entity_id": related_entity_id,
            "action_url": action_url,
            "expires_at": expires_at,
        }
        for key, value in optional_fields.items():
            if value is not None:
                data[key] = value

        result = (
            get_supabase().table("seller_notifications")
            .insert(data)
            .execute()
        )
        return {"durum": "başarılı", "notification": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def get_unread_notifications(
    seller_id: int,
    limit: int = 50,
) -> dict[str, Any]:
    """Satıcının okunmamış bildirimlerini getirir."""
    try:
        result = (
            get_supabase().table("seller_notifications")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("is_read", False)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {
            "durum": "başarılı",
            "toplam": len(result.data),
            "bildirimler": result.data,
        }
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def mark_notification_as_read(notification_id: int) -> dict[str, Any]:
    """Bildirimi okundu olarak işaretler."""
    try:
        result = (
            get_supabase().table("seller_notifications")
            .update({"is_read": True, "read_at": utc_iso()})
            .eq("id", notification_id)
            .execute()
        )
        return {
            "durum": "başarılı",
            "notification": result.data[0] if result.data else None,
        }
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}

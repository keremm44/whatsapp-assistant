from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload
from .common import is_positive_int as _is_positive_int


def get_supabase():
    import database

    return database.get_supabase()


def save_message(
    seller_id: int,
    customer_id: int,
    direction: str,
    content: str | None,
    message_type: str = "text",
    media_url: str | None = None,
    was_auto_replied: bool = False,
    ai_confidence: float | None = None,
    provider: str = "internal",
    provider_message_id: str | None = None,
) -> dict[str, Any]:
    """Persist one message and its incoming customer metrics atomically."""
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id ve customer_id pozitif tam sayı olmalıdır.",
        }
    if not isinstance(direction, str) or not direction.strip():
        return {"durum": "doğrulama_hatası", "mesaj": "direction zorunludur."}
    if not isinstance(message_type, str) or not message_type.strip():
        return {"durum": "doğrulama_hatası", "mesaj": "message_type zorunludur."}
    if not isinstance(provider, str) or not provider.strip():
        return {"durum": "doğrulama_hatası", "mesaj": "provider zorunludur."}

    try:
        result = get_supabase().rpc(
            "persist_message_with_customer_metrics",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "direction_value": direction,
                "content_value": content,
                "message_type_value": message_type,
                "media_url_value": media_url,
                "was_auto_replied_value": was_auto_replied,
                "ai_confidence_value": ai_confidence,
                "provider_value": provider,
                "provider_message_id_value": provider_message_id,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Mesaj güvenli biçimde kaydedilemedi."}

    payload = _extract_rpc_payload(result.data)
    if payload is None:
        return {"durum": "hata", "mesaj": "Mesaj kaydı geçersiz yanıt döndürdü."}

    status = payload.get("status")
    message = payload.get("message")
    if status == "duplicate":
        return {
            "durum": "duplicate",
            "message": message if isinstance(message, dict) else None,
            "mesaj": "Mesaj daha önce işlendi.",
        }
    if status != "success" or not isinstance(message, dict):
        return {"durum": "hata", "mesaj": "Mesaj kaydı tamamlanamadı."}
    if not _is_positive_int(message.get("id")):
        return {"durum": "hata", "mesaj": "Mesaj kaydı geçersiz kayıt döndürdü."}
    if message.get("seller_id") != seller_id or message.get("customer_id") != customer_id:
        return {"durum": "hata", "mesaj": "Mesaj tenant kimliği doğrulanamadı."}

    return {"durum": "başarılı", "message": message}


def increment_customer_message_count(customer_id: int) -> dict[str, Any]:
    """Legacy public helper: reconcile metrics from durable incoming messages."""
    if not _is_positive_int(customer_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "customer_id pozitif tam sayı olmalıdır.",
        }

    try:
        result = get_supabase().rpc(
            "reconcile_customer_message_metrics",
            {"target_customer_id": customer_id},
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Müşteri mesaj metrikleri güvenli biçimde uzlaştırılamadı.",
        }

    payload = _extract_rpc_payload(result.data)
    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "Müşteri mesaj metrikleri geçersiz yanıt döndürdü.",
        }
    if payload.get("status") == "not_found":
        return {"durum": "bulunamadı", "mesaj": "Müşteri bulunamadı."}
    if payload.get("status") != "success":
        return {"durum": "hata", "mesaj": "Müşteri mesaj metrikleri uzlaştırılamadı."}

    customer = payload.get("customer")
    if not isinstance(customer, dict) or customer.get("id") != customer_id:
        return {
            "durum": "hata",
            "mesaj": "Müşteri mesaj metrikleri geçersiz kayıt döndürdü.",
        }
    return {"durum": "başarılı", "customer": customer}

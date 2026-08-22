from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload
from .common import is_positive_int as _is_positive_int


_MAX_WHATSAPP_NUMBER_LENGTH = 64
_MAX_CUSTOMER_NAME_LENGTH = 255


def get_supabase():
    import database

    return database.get_supabase()


def get_or_create_customer(
    seller_id: int,
    whatsapp_number: str,
    name: str | None = None,
) -> dict[str, Any]:
    """Return one canonical customer identity using the atomic DB invariant."""
    normalized_number = (
        whatsapp_number.strip() if isinstance(whatsapp_number, str) else ""
    )
    normalized_name = name.strip() if isinstance(name, str) else None
    if normalized_name == "":
        normalized_name = None

    if (
        not _is_positive_int(seller_id)
        or not normalized_number
        or len(normalized_number) > _MAX_WHATSAPP_NUMBER_LENGTH
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Geçersiz müşteri kimliği.",
        }

    if normalized_name is not None and len(normalized_name) > _MAX_CUSTOMER_NAME_LENGTH:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Müşteri adı çok uzun.",
        }

    try:
        result = get_supabase().rpc(
            "get_or_create_customer_identity",
            {
                "target_seller_id": seller_id,
                "whatsapp_number_value": normalized_number,
                "name_value": normalized_name,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Müşteri kimliği güvenli biçimde çözülemedi.",
        }

    payload = _extract_rpc_payload(result.data)
    if payload is None or payload.get("status") != "success":
        return {
            "durum": "hata",
            "mesaj": "Müşteri kimliği işlemi tamamlanamadı.",
        }

    customer = payload.get("customer")
    if not isinstance(customer, dict) or not _is_positive_int(customer.get("id")):
        return {
            "durum": "hata",
            "mesaj": "Müşteri kimliği işlemi geçersiz kayıt döndürdü.",
        }
    if customer.get("seller_id") != seller_id:
        return {
            "durum": "hata",
            "mesaj": "Müşteri tenant kimliği doğrulanamadı.",
        }
    if customer.get("whatsapp_number") != normalized_number:
        return {
            "durum": "hata",
            "mesaj": "Müşteri WhatsApp kimliği doğrulanamadı.",
        }

    return {
        "durum": (
            "yeni_oluşturuldu"
            if payload.get("created") is True
            else "mevcut"
        ),
        "customer": customer,
    }

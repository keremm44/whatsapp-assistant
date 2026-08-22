from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload


def get_supabase():
    import database

    return database.get_supabase()


def recover_stale_whatsapp_delivery_outbox() -> dict[str, Any]:
    """Move delivery-ambiguous stale SENDING rows to UNKNOWN in the database."""
    try:
        result = get_supabase().rpc(
            "recover_stale_whatsapp_delivery_outbox",
            {},
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Stale WhatsApp outbox kayıtları toparlanamadı.",
        }

    payload = _extract_rpc_payload(result.data)
    if payload is None or payload.get("status") != "success":
        return {
            "durum": "hata",
            "mesaj": "Stale WhatsApp outbox recovery geçersiz yanıt döndürdü.",
        }

    recovered_count = payload.get("recovered_count")
    if (
        not isinstance(recovered_count, int)
        or isinstance(recovered_count, bool)
        or recovered_count < 0
    ):
        return {
            "durum": "hata",
            "mesaj": "Stale WhatsApp outbox recovery sayacı geçersiz.",
        }

    return {
        "durum": "başarılı",
        "recovered_count": recovered_count,
    }

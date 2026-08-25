from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload
from .common import is_positive_int as _is_positive_int


def get_supabase():
    import database

    return database.get_supabase()


def poll_whatsapp_delivery_outbox() -> dict[str, Any]:
    """Recover stale sends and discover one due outbox row in one RPC."""
    try:
        result = get_supabase().rpc(
            "next_whatsapp_delivery_outbox_id",
            {},
        ).execute()
    except Exception:
        return {"durum": "hata"}

    payload = _extract_rpc_payload(result.data)
    if payload is None or payload.get("status") != "success":
        return {"durum": "hata"}

    recovered_stale_count = payload.get("recovered_stale_count")
    if (
        not isinstance(recovered_stale_count, int)
        or isinstance(recovered_stale_count, bool)
        or recovered_stale_count < 0
    ):
        return {"durum": "hata"}

    outbox_id = payload.get("outbox_id")
    if outbox_id is None:
        return {
            "durum": "boş",
            "recovered_stale_count": recovered_stale_count,
        }
    if not _is_positive_int(outbox_id):
        return {"durum": "hata"}

    return {
        "durum": "başarılı",
        "outbox_id": outbox_id,
        "recovered_stale_count": recovered_stale_count,
    }

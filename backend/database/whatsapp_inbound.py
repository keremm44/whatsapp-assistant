from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload
from .common import is_positive_int as _is_positive_int


VALID_INBOUND_OUTCOMES = frozenset({"NO_REPLY", "REPLY"})


def get_supabase():
    import database

    return database.get_supabase()


def _normalize_reason(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalized[:64]


def ensure_whatsapp_inbound_outcome(
    *,
    channel_id: int,
    seller_id: int,
    customer_id: int,
    incoming_message_id: int,
    outcome: str,
    outgoing_message_id: int | None = None,
    reason_code: str | None = None,
) -> dict[str, Any]:
    if not all(
        _is_positive_int(value)
        for value in (channel_id, seller_id, customer_id, incoming_message_id)
    ):
        return {"durum": "doğrulama_hatası", "mesaj": "Inbound outcome kimlikleri geçersiz."}

    normalized_outcome = outcome.strip().upper() if isinstance(outcome, str) else ""
    if normalized_outcome not in VALID_INBOUND_OUTCOMES:
        return {"durum": "doğrulama_hatası", "mesaj": "Inbound outcome geçersiz."}
    if normalized_outcome == "REPLY":
        if not _is_positive_int(outgoing_message_id):
            return {"durum": "doğrulama_hatası", "mesaj": "REPLY outcome outgoing mesaj gerektirir."}
    elif outgoing_message_id is not None:
        return {"durum": "doğrulama_hatası", "mesaj": "NO_REPLY outcome outgoing mesaj içeremez."}

    try:
        result = get_supabase().rpc(
            "ensure_whatsapp_inbound_outcome",
            {
                "target_channel_id": channel_id,
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_incoming_message_id": incoming_message_id,
                "outcome_value": normalized_outcome,
                "target_outgoing_message_id": outgoing_message_id,
                "reason_code_value": _normalize_reason(reason_code),
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "WhatsApp inbound outcome kaydedilemedi."}

    payload = _extract_rpc_payload(result.data)
    if payload is None:
        return {"durum": "hata", "mesaj": "WhatsApp inbound outcome geçersiz yanıt döndürdü."}
    status = payload.get("status")
    if status == "not_found":
        response: dict[str, Any] = {"durum": "bulunamadı"}
        if isinstance(payload.get("resource"), str):
            response["resource"] = payload["resource"]
        return response
    if status == "conflict":
        response = {"durum": "çakışma"}
        if isinstance(payload.get("reason"), str):
            response["reason"] = payload["reason"]
        return response
    if status != "success" or not isinstance(payload.get("outcome"), dict):
        return {"durum": "hata", "mesaj": "WhatsApp inbound outcome doğrulanamadı."}
    return {
        "durum": "başarılı",
        "created": payload.get("created") is True,
        "outcome": payload["outcome"],
    }


def get_whatsapp_inbound_outcome(
    *,
    seller_id: int,
    customer_id: int,
    incoming_message_id: int,
) -> dict[str, Any]:
    if not all(
        _is_positive_int(value)
        for value in (seller_id, customer_id, incoming_message_id)
    ):
        return {"durum": "doğrulama_hatası", "mesaj": "Inbound outcome kimlikleri geçersiz."}

    try:
        result = (
            get_supabase()
            .table("whatsapp_inbound_outcomes")
            .select("id,channel_id,seller_id,customer_id,incoming_message_id,outcome,outgoing_message_id,reason_code")
            .eq("seller_id", seller_id)
            .eq("customer_id", customer_id)
            .eq("incoming_message_id", incoming_message_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return {"durum": "hata", "mesaj": "WhatsApp inbound outcome okunamadı."}

    rows = result.data or []
    if not rows:
        return {"durum": "bulunamadı", "outcome": None}
    row = rows[0]
    if (
        row.get("seller_id") != seller_id
        or row.get("customer_id") != customer_id
        or row.get("incoming_message_id") != incoming_message_id
        or row.get("outcome") not in VALID_INBOUND_OUTCOMES
    ):
        return {"durum": "hata", "mesaj": "WhatsApp inbound outcome geçersiz veri döndürdü."}
    return {"durum": "başarılı", "outcome": row}

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload
from .common import is_positive_int as _is_positive_int
from .conversations import STATE_TYPES, VALID_REASON_CODES, VALID_STATES


def get_supabase():
    import database

    return database.get_supabase()


def utc_now():
    import database

    return database.utc_now()


def _public_state(record: Any) -> dict[str, Any] | None:
    if not isinstance(record, dict):
        return None
    current_state = record.get("current_state")
    state_type = record.get("state_type")
    state_data = record.get("state_data")
    seller_id = record.get("seller_id")
    customer_id = record.get("customer_id")
    if (
        current_state not in VALID_STATES
        or state_type != STATE_TYPES[current_state]
        or not isinstance(state_data, dict)
        or not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
    ):
        return None
    return {
        "seller_id": seller_id,
        "customer_id": customer_id,
        "current_state": current_state,
        "state_type": state_type,
        "state_data": state_data,
        "expires_at": record.get("expires_at"),
    }


def _fetch_state_record(seller_id: int, customer_id: int) -> dict[str, Any] | None:
    result = (
        get_supabase()
        .table("conversation_states")
        .select(
            "seller_id,customer_id,current_state,state_type,state_data,expires_at,"
            "state_version,state_last_message_id"
        )
        .eq("seller_id", seller_id)
        .eq("customer_id", customer_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def get_state(seller_id: int, customer_id: int) -> dict[str, Any]:
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id):
        return {"durum": "doğrulama_hatası", "mesaj": "Geçersiz konuşma kimliği."}
    try:
        record = _fetch_state_record(seller_id, customer_id)
    except Exception:
        return {"durum": "hata", "mesaj": "Konuşma state kaydı okunamadı."}

    if record is None:
        return {
            "durum": "başarılı",
            "state": {
                "seller_id": seller_id,
                "customer_id": customer_id,
                "current_state": "NORMAL",
                "state_type": "no_lock",
                "state_data": {},
                "expires_at": None,
            },
            "database_record_exists": False,
        }

    state = _public_state(record)
    if state is None:
        return {"durum": "hata", "mesaj": "Konuşma state kaydı geçersiz."}

    expires_at = state.get("expires_at")
    if expires_at:
        try:
            expires_datetime = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            expires_datetime = None
        if expires_datetime is not None and expires_datetime <= utc_now():
            expired_state = state["current_state"]
            result = transition_state(
                seller_id=seller_id,
                customer_id=customer_id,
                to_state="NORMAL",
                reason_code="timeout",
                state_data={},
                metadata={"expired_state": expired_state},
            )
            if result.get("durum") != "başarılı":
                return result
            return {
                "durum": "başarılı",
                "state": result["state"],
                "expired": True,
                "database_record_exists": True,
            }

    return {
        "durum": "başarılı",
        "state": state,
        "database_record_exists": True,
    }


def transition_state(
    seller_id: int,
    customer_id: int,
    to_state: str,
    reason_code: str,
    trigger_message_id: int | None = None,
    state_data: dict[str, Any] | None = None,
    expires_in_hours: int | None = None,
    metadata: dict[str, Any] | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id):
        return {"durum": "doğrulama_hatası", "mesaj": "Geçersiz konuşma kimliği."}
    if to_state not in VALID_STATES:
        return {"durum": "doğrulama_hatası", "mesaj": f"Geçersiz hedef state: {to_state}"}
    if reason_code not in VALID_REASON_CODES:
        return {"durum": "doğrulama_hatası", "mesaj": f"Geçersiz reason_code: {reason_code}"}
    if trigger_message_id is not None and not _is_positive_int(trigger_message_id):
        return {"durum": "doğrulama_hatası", "mesaj": "trigger_message_id geçersiz."}
    if expected_version is not None and not _is_positive_int(expected_version):
        return {"durum": "doğrulama_hatası", "mesaj": "expected_version geçersiz."}
    if state_data is not None and not isinstance(state_data, dict):
        return {"durum": "doğrulama_hatası", "mesaj": "state_data nesne olmalıdır."}
    if metadata is not None and not isinstance(metadata, dict):
        return {"durum": "doğrulama_hatası", "mesaj": "metadata nesne olmalıdır."}
    if expires_in_hours is not None and (
        isinstance(expires_in_hours, bool) or not isinstance(expires_in_hours, int)
    ):
        return {"durum": "doğrulama_hatası", "mesaj": "expires_in_hours tam sayı olmalıdır."}

    expires_at = None
    if expires_in_hours is not None:
        expires_at = (utc_now() + timedelta(hours=expires_in_hours)).isoformat()

    try:
        result = get_supabase().rpc(
            "transition_conversation_state",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_state": to_state,
                "transition_reason_code": reason_code,
                "transition_trigger_message_id": trigger_message_id,
                "target_state_data": state_data or {},
                "target_expires_at": expires_at,
                "transition_metadata": metadata or {},
                "expected_state_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Konuşma state işlemi tamamlanamadı."}

    payload = _extract_rpc_payload(result.data)
    if payload is None:
        return {"durum": "hata", "mesaj": "Konuşma state işlemi geçersiz yanıt döndürdü."}

    status = payload.get("status")
    if status == "stale":
        return {
            "durum": "çakışma",
            "error_code": "stale_state_message",
            "mesaj": "Daha eski mesaj konuşma state'ini değiştiremez.",
        }
    if status == "conflict":
        return {
            "durum": "çakışma",
            "error_code": "state_version_conflict",
            "mesaj": "Konuşma state'i başka bir işlemle değişti.",
        }
    if status in {"not_found", "forbidden"}:
        return {"durum": "reddedildi", "mesaj": "Konuşma state işlemi tenant kapsamını doğrulayamadı."}
    if status != "success":
        return {"durum": "hata", "mesaj": "Konuşma state işlemi tamamlanamadı."}

    state = _public_state(payload.get("state"))
    if state is None:
        return {"durum": "hata", "mesaj": "Konuşma state işlemi geçersiz state döndürdü."}

    response: dict[str, Any] = {
        "durum": "başarılı",
        "state": state,
        "changed": payload.get("changed") is True,
    }
    transition = payload.get("transition")
    if isinstance(transition, dict):
        response["transition"] = transition
    return response

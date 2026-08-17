from __future__ import annotations

from datetime import datetime, timedelta
import re
from typing import Any, TypedDict

from .common import extract_rpc_payload as _extract_rpc_payload
from .common import is_positive_int as _is_positive_int


def get_supabase():
    import database

    return database.get_supabase()


def utc_now():
    import database

    return database.utc_now()


def utc_iso() -> str:
    import database

    return database.utc_iso()


# =====================================================
# CONVERSATION CONTROL — KALICI KONTROL DURUMU
# =====================================================

CONTROL_STATE_ASSISTANT_ACTIVE = "ASSISTANT_ACTIVE"
CONTROL_STATE_SELLER_TAKEN_OVER = "SELLER_TAKEN_OVER"
CONTROL_STATE_RETURN_REVIEW = "RETURN_REVIEW"
CONTROL_STATE_ASSISTANT_PAUSED = "ASSISTANT_PAUSED"

VALID_CONTROL_STATES = {
    CONTROL_STATE_ASSISTANT_ACTIVE,
    CONTROL_STATE_SELLER_TAKEN_OVER,
    CONTROL_STATE_RETURN_REVIEW,
    CONTROL_STATE_ASSISTANT_PAUSED,
}

CONTROL_REASON_CODE_MAX_LENGTH = 64
CONTROL_REASON_NOTE_MAX_LENGTH = 500
_CONTROL_REASON_CODE_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")


class ConversationControlSummary(TypedDict):
    """Dış katmanlara döndürülen kararlı konuşma kontrol özeti."""

    state: str
    changed_at: str
    changed_by_profile_id: int | None
    reason_code: str | None
    reason_note: str | None
    resume_after_message_id: int | None
    version: int


def _validate_conversation_identity(
    seller_id: int,
    customer_id: int,
) -> dict[str, Any] | None:
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id ve customer_id pozitif tam sayı olmalıdır.",
        }
    return None


def _validate_optional_positive_id(
    value: int | None,
    field_name: str,
) -> dict[str, Any] | None:
    if value is not None and not _is_positive_int(value):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": f"{field_name} pozitif tam sayı olmalıdır.",
        }
    return None


def _validate_control_reason(
    reason_code: str,
    reason_note: str | None,
) -> dict[str, Any] | None:
    if (
        not isinstance(reason_code, str)
        or not reason_code
        or len(reason_code) > CONTROL_REASON_CODE_MAX_LENGTH
        or _CONTROL_REASON_CODE_PATTERN.fullmatch(reason_code) is None
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": (
                "reason_code küçük harf/rakam/alt çizgi içeren geçerli "
                "bir kod olmalıdır."
            ),
        }

    if reason_note is not None:
        if not isinstance(reason_note, str):
            return {"durum": "doğrulama_hatası", "mesaj": "reason_note metin olmalıdır."}
        if len(reason_note) > CONTROL_REASON_NOTE_MAX_LENGTH:
            return {
                "durum": "doğrulama_hatası",
                "mesaj": (
                    "reason_note en fazla "
                    f"{CONTROL_REASON_NOTE_MAX_LENGTH} karakter olabilir."
                ),
            }
    return None


def _build_conversation_control_summary(
    record: Any,
) -> ConversationControlSummary | None:
    """DB/RPC kaydını kontrollü ve kararlı dış dönüş modeline çevirir."""
    if not isinstance(record, dict):
        return None

    state = record.get("control_state")
    version = record.get("control_version")
    changed_at = record.get("control_changed_at")
    changed_by_profile_id = record.get("control_changed_by_profile_id")
    reason_code = record.get("control_reason_code")
    reason_note = record.get("control_reason_note")
    resume_after_message_id = record.get("resume_after_message_id")

    if (
        state not in VALID_CONTROL_STATES
        or not _is_positive_int(version)
        or not isinstance(changed_at, str)
        or not changed_at
        or (
            changed_by_profile_id is not None
            and not _is_positive_int(changed_by_profile_id)
        )
        or (
            resume_after_message_id is not None
            and not _is_positive_int(resume_after_message_id)
        )
        or (
            reason_code is not None
            and (
                not isinstance(reason_code, str)
                or len(reason_code) > CONTROL_REASON_CODE_MAX_LENGTH
                or _CONTROL_REASON_CODE_PATTERN.fullmatch(reason_code) is None
            )
        )
        or (
            reason_note is not None
            and (
                not isinstance(reason_note, str)
                or len(reason_note) > CONTROL_REASON_NOTE_MAX_LENGTH
            )
        )
    ):
        return None

    return {
        "state": state,
        "changed_at": changed_at,
        "changed_by_profile_id": changed_by_profile_id,
        "reason_code": reason_code,
        "reason_note": reason_note,
        "resume_after_message_id": resume_after_message_id,
        "version": version,
    }


def _conversation_control_rpc_response(data: Any) -> dict[str, Any]:
    payload = _extract_rpc_payload(data)
    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "Konuşma kontrol işlemi geçersiz yanıt döndürdü.",
        }

    status = payload.get("status")
    if status == "not_found":
        return {"durum": "bulunamadı", "mesaj": "Konuşma kontrol kaydı bulunamadı."}
    if status == "forbidden":
        return {
            "durum": "reddedildi",
            "mesaj": "Konuşma kontrol işlemi bu tenant için geçersiz.",
        }

    control = _build_conversation_control_summary(payload.get("control"))
    if status == "conflict":
        response: dict[str, Any] = {
            "durum": "çakışma",
            "mesaj": "Konuşma kontrol kaydı başka bir işlemle değişti.",
        }
        if control is not None:
            response["control"] = control
        return response

    if status != "success" or control is None:
        return {
            "durum": "hata",
            "mesaj": "Konuşma kontrol işlemi geçersiz yanıt döndürdü.",
        }

    response = {
        "durum": "başarılı",
        "changed": payload.get("changed") is True,
        "control": control,
    }
    transition_id = payload.get("transition_id")
    if _is_positive_int(transition_id):
        response["transition_id"] = transition_id
    return response


def get_conversation_control(
    seller_id: int,
    customer_id: int,
) -> dict[str, Any]:
    """Konuşma kontrolünü seller ve customer birlikte scope ederek okur."""
    validation_error = _validate_conversation_identity(seller_id, customer_id)
    if validation_error:
        return validation_error

    try:
        result = (
            get_supabase().table("conversation_states")
            .select(
                "control_state,control_changed_at,"
                "control_changed_by_profile_id,control_reason_code,"
                "control_reason_note,resume_after_message_id,"
                "control_version"
            )
            .eq("seller_id", seller_id)
            .eq("customer_id", customer_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return {"durum": "bulunamadı", "mesaj": "Konuşma kontrol kaydı bulunamadı."}
        control = _build_conversation_control_summary(result.data[0])
        if control is None:
            return {"durum": "hata", "mesaj": "Konuşma kontrol kaydı geçersiz."}
        return {"durum": "başarılı", "control": control}
    except Exception:
        return {"durum": "hata", "mesaj": "Konuşma kontrol kaydı okunamadı."}


def get_conversation_control_history(
    seller_id: int,
    customer_id: int,
    limit: int = 20,
) -> dict[str, Any]:
    """Tenant kapsamındaki kontrol audit kayıtlarını en yeniden eskiye okur."""
    validation_error = _validate_conversation_identity(seller_id, customer_id)
    if validation_error:
        return validation_error
    if not _is_positive_int(limit) or limit > 100:
        return {"durum": "doğrulama_hatası", "mesaj": "limit 1 ile 100 arasında olmalıdır."}

    try:
        result = (
            get_supabase().table("conversation_control_transitions")
            .select(
                "id,from_control_state,to_control_state,reason_code,"
                "reason_note,changed_by_profile_id,trigger_message_id,"
                "new_resume_after_message_id,previous_version,new_version,"
                "created_at"
            )
            .eq("seller_id", seller_id)
            .eq("customer_id", customer_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception:
        return {"durum": "hata", "mesaj": "Konuşma kontrol geçmişi okunamadı."}

    history: list[dict[str, Any]] = []
    for record in result.data or []:
        if not isinstance(record, dict):
            return {"durum": "hata", "mesaj": "Konuşma kontrol geçmişi geçersiz."}
        history.append(
            {
                "id": record.get("id"),
                "from_state": record.get("from_control_state"),
                "to_state": record.get("to_control_state"),
                "reason_code": record.get("reason_code"),
                "reason_note": record.get("reason_note"),
                "changed_by_profile_id": record.get("changed_by_profile_id"),
                "trigger_message_id": record.get("trigger_message_id"),
                "resume_after_message_id": record.get("new_resume_after_message_id"),
                "previous_version": record.get("previous_version"),
                "new_version": record.get("new_version"),
                "created_at": record.get("created_at"),
            }
        )
    return {"durum": "başarılı", "history": history}


def transition_conversation_control(
    seller_id: int,
    customer_id: int,
    to_control_state: str,
    reason_code: str,
    reason_note: str | None = None,
    changed_by_profile_id: int | None = None,
    trigger_message_id: int | None = None,
    resume_after_message_id: int | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """Kontrol değişikliği ile audit kaydını tek atomik RPC'de uygular."""
    validation_error = _validate_conversation_identity(seller_id, customer_id)
    if validation_error:
        return validation_error
    if to_control_state not in VALID_CONTROL_STATES:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": f"Geçersiz kontrol durumu: {to_control_state}",
        }
    validation_error = _validate_control_reason(reason_code, reason_note)
    if validation_error:
        return validation_error

    for value, field_name in (
        (changed_by_profile_id, "changed_by_profile_id"),
        (trigger_message_id, "trigger_message_id"),
        (resume_after_message_id, "resume_after_message_id"),
        (expected_version, "expected_version"),
    ):
        validation_error = _validate_optional_positive_id(value, field_name)
        if validation_error:
            return validation_error

    try:
        result = get_supabase().rpc(
            "transition_conversation_control",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_control_state": to_control_state,
                "transition_reason_code": reason_code,
                "transition_reason_note": reason_note,
                "actor_profile_id": changed_by_profile_id,
                "transition_trigger_message_id": trigger_message_id,
                "target_resume_after_message_id": resume_after_message_id,
                "expected_control_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Konuşma kontrol işlemi tamamlanamadı."}
    return _conversation_control_rpc_response(result.data)


def resume_conversation_assistant(
    seller_id: int,
    customer_id: int,
    reason_code: str = "manual_resume",
    reason_note: str | None = None,
    changed_by_profile_id: int | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """Asistanı, son incoming mesaj cursor'ını atomik alarak geri açar."""
    validation_error = _validate_conversation_identity(seller_id, customer_id)
    if validation_error:
        return validation_error
    validation_error = _validate_control_reason(reason_code, reason_note)
    if validation_error:
        return validation_error

    for value, field_name in (
        (changed_by_profile_id, "changed_by_profile_id"),
        (expected_version, "expected_version"),
    ):
        validation_error = _validate_optional_positive_id(value, field_name)
        if validation_error:
            return validation_error

    try:
        result = get_supabase().rpc(
            "resume_conversation_assistant",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "transition_reason_code": reason_code,
                "transition_reason_note": reason_note,
                "actor_profile_id": changed_by_profile_id,
                "expected_control_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Konuşma kontrol işlemi tamamlanamadı."}
    return _conversation_control_rpc_response(result.data)


# =====================================================
# CONVERSATION STATE — DURUM MAKİNESİ
# =====================================================

VALID_STATES = {
    "NORMAL",
    "AWAITING_ORDER_CONFIRMATION",
    "AWAITING_ORDER_PRODUCT",
    "AWAITING_ORDER_NUMBER",
    "AWAITING_IMAGE",
    "AWAITING_CUSTOM_TEXT",
    "AWAITING_ORDER_FIELD",
    "AWAITING_SELLER",
}

STATE_TYPES = {
    "NORMAL": "no_lock",
    "AWAITING_ORDER_CONFIRMATION": "soft_lock",
    "AWAITING_ORDER_PRODUCT": "soft_lock",
    "AWAITING_ORDER_NUMBER": "soft_lock",
    "AWAITING_IMAGE": "soft_lock",
    "AWAITING_CUSTOM_TEXT": "soft_lock",
    "AWAITING_ORDER_FIELD": "soft_lock",
    "AWAITING_SELLER": "informational",
}

VALID_REASON_CODES = {
    "user_action",
    "timeout",
    "admin_override",
    "escalation",
    "violation",
    "system",
}


def _fetch_state_record(
    seller_id: int,
    customer_id: int,
) -> dict[str, Any] | None:
    """State kaydını doğrudan veritabanından getirir."""
    result = (
        get_supabase().table("conversation_states")
        .select("*")
        .eq("seller_id", seller_id)
        .eq("customer_id", customer_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_state(
    seller_id: int,
    customer_id: int,
) -> dict[str, Any]:
    """Müşterinin aktif konuşma durumunu getirir."""
    try:
        state = _fetch_state_record(seller_id=seller_id, customer_id=customer_id)
        if not state:
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

        expires_at = state.get("expires_at")
        if expires_at:
            try:
                expires_datetime = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
                if expires_datetime <= utc_now():
                    expired_state = state.get("current_state", "NORMAL")
                    state_result = set_state(
                        seller_id=seller_id,
                        customer_id=customer_id,
                        current_state="NORMAL",
                        state_data={},
                        expires_at=None,
                    )
                    if state_result.get("durum") != "başarılı":
                        return state_result

                    transition_data = {
                        "seller_id": seller_id,
                        "customer_id": customer_id,
                        "from_state": expired_state,
                        "to_state": "NORMAL",
                        "reason_code": "timeout",
                        "metadata": {"expired_state": expired_state},
                    }
                    transition_warning = None
                    try:
                        get_supabase().table("state_transitions").insert(transition_data).execute()
                    except Exception as transition_exc:
                        transition_warning = str(transition_exc)

                    response = {
                        "durum": "başarılı",
                        "state": state_result["state"],
                        "expired": True,
                        "database_record_exists": True,
                    }
                    if transition_warning:
                        response["uyarı"] = (
                            "State sıfırlandı ancak timeout geçiş "
                            f"kaydı yazılamadı: {transition_warning}"
                        )
                    return response
            except (TypeError, ValueError):
                pass

        return {
            "durum": "başarılı",
            "state": state,
            "database_record_exists": True,
        }
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def set_state(
    seller_id: int,
    customer_id: int,
    current_state: str,
    state_data: dict[str, Any] | None = None,
    expires_at: str | None = None,
) -> dict[str, Any]:
    """Konuşma durumunu oluşturur veya günceller."""
    if current_state not in VALID_STATES:
        return {"durum": "hata", "mesaj": f"Geçersiz state: {current_state}"}
    try:
        data = {
            "seller_id": seller_id,
            "customer_id": customer_id,
            "current_state": current_state,
            "state_type": STATE_TYPES[current_state],
            "state_data": state_data or {},
            "expires_at": expires_at,
            "updated_at": utc_iso(),
        }
        result = (
            get_supabase().table("conversation_states")
            .upsert(data, on_conflict="seller_id,customer_id")
            .execute()
        )
        return {"durum": "başarılı", "state": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


def transition_state(
    seller_id: int,
    customer_id: int,
    to_state: str,
    reason_code: str,
    trigger_message_id: int | None = None,
    state_data: dict[str, Any] | None = None,
    expires_in_hours: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """State değiştirir ve geçiş kaydı oluşturur."""
    if to_state not in VALID_STATES:
        return {"durum": "hata", "mesaj": f"Geçersiz hedef state: {to_state}"}
    if reason_code not in VALID_REASON_CODES:
        return {"durum": "hata", "mesaj": f"Geçersiz reason_code: {reason_code}"}

    try:
        current_state_record = _fetch_state_record(
            seller_id=seller_id,
            customer_id=customer_id,
        )
    except Exception as exc:
        return {"durum": "hata", "mesaj": f"Mevcut state okunamadı: {exc}"}

    from_state = (
        current_state_record.get("current_state", "NORMAL")
        if current_state_record
        else "NORMAL"
    )
    expires_at = None
    if expires_in_hours is not None:
        expires_at = (utc_now() + timedelta(hours=expires_in_hours)).isoformat()

    state_result = set_state(
        seller_id=seller_id,
        customer_id=customer_id,
        current_state=to_state,
        state_data=state_data,
        expires_at=expires_at,
    )
    if state_result.get("durum") != "başarılı":
        return state_result

    transition_data: dict[str, Any] = {
        "seller_id": seller_id,
        "customer_id": customer_id,
        "from_state": from_state,
        "to_state": to_state,
        "reason_code": reason_code,
        "metadata": metadata or {},
    }
    if trigger_message_id:
        transition_data["trigger_message_id"] = trigger_message_id

    try:
        transition_result = (
            get_supabase().table("state_transitions")
            .insert(transition_data)
            .execute()
        )
        return {
            "durum": "başarılı",
            "state": state_result["state"],
            "transition": transition_result.data[0] if transition_result.data else None,
        }
    except Exception as exc:
        return {
            "durum": "kısmi_başarılı",
            "state": state_result["state"],
            "mesaj": (
                "State güncellendi fakat geçiş kaydı oluşturulamadı: "
                f"{exc}"
            ),
        }

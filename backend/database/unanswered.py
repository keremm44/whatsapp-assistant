from __future__ import annotations

import re
import unicodedata
from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload
from .common import is_positive_int as _is_positive_int


def get_supabase():
    import database

    return database.get_supabase()


def utc_iso() -> str:
    import database

    return database.utc_iso()


# =====================================================
# UNANSWERED QUESTIONS — LEGACY STORAGE
# =====================================================

def normalize_question(question: str) -> str:
    """Soruyu basit gruplama için normalize eder."""
    normalized = question.lower().strip()
    normalized = unicodedata.normalize("NFKC", normalized)
    normalized = re.sub(
        r"[^\wşğıöüç\s]",
        " ",
        normalized,
        flags=re.UNICODE,
    )
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def save_unanswered_question(
    seller_id: int,
    question_text: str,
    category: str = "unclear",
    customer_id: int | None = None,
    source_message_id: int | None = None,
    suggested_field: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Cevaplanamayan soruyu kaydeder veya tekrar sayısını artırır."""
    normalized = normalize_question(question_text)
    try:
        existing_result = (
            get_supabase().table("unanswered_questions")
            .select("id,times_asked")
            .eq("seller_id", seller_id)
            .eq("normalized_question", normalized)
            .eq("is_resolved", False)
            .limit(1)
            .execute()
        )
        if existing_result.data:
            existing = existing_result.data[0]
            update_data: dict[str, Any] = {
                "times_asked": int(existing.get("times_asked") or 1) + 1,
                "last_asked_at": utc_iso(),
            }
            if customer_id is not None:
                update_data["customer_id"] = customer_id
            if source_message_id is not None:
                update_data["source_message_id"] = source_message_id
            if suggested_field:
                update_data["suggested_field"] = suggested_field
            result = (
                get_supabase().table("unanswered_questions")
                .update(update_data)
                .eq("id", existing["id"])
                .execute()
            )
            return {"durum": "güncellendi", "question": result.data[0]}

        data: dict[str, Any] = {
            "seller_id": seller_id,
            "question_text": question_text,
            "normalized_question": normalized,
            "category": category,
            "metadata": metadata or {},
        }
        if customer_id is not None:
            data["customer_id"] = customer_id
        if source_message_id is not None:
            data["source_message_id"] = source_message_id
        if suggested_field:
            data["suggested_field"] = suggested_field

        result = (
            get_supabase().table("unanswered_questions")
            .insert(data)
            .execute()
        )
        return {"durum": "başarılı", "question": result.data[0]}
    except Exception as exc:
        return {"durum": "hata", "mesaj": str(exc)}


# =====================================================
# UNANSWERED QUESTION LIFECYCLE — 017 DOMAIN
# =====================================================

UNANSWERED_STATUS_OPEN = "OPEN"
UNANSWERED_STATUS_ANSWERED = "ANSWERED"
UNANSWERED_STATUS_DISMISSED = "DISMISSED"

VALID_UNANSWERED_STATUSES = {
    UNANSWERED_STATUS_OPEN,
    UNANSWERED_STATUS_ANSWERED,
    UNANSWERED_STATUS_DISMISSED,
}


def _unanswered_rpc_response(data: Any) -> dict[str, Any]:
    """017 unanswered RPC yanıtını güvenli domain sonucuna normalize eder."""
    payload = _extract_rpc_payload(data)
    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "Cevaplanamayan soru işlemi geçersiz yanıt döndürdü.",
        }

    rpc_status = payload.get("status")
    if rpc_status == "not_found":
        return {
            "durum": "bulunamadı",
            "mesaj": "Cevaplanamayan soru kaydı bulunamadı.",
        }
    if rpc_status == "conflict":
        response: dict[str, Any] = {
            "durum": "çakışma",
            "mesaj": payload.get("message")
            or "Cevaplanamayan soru başka bir işlemle değişti.",
        }
        if payload.get("group") is not None:
            response["group"] = payload["group"]
        if payload.get("current_version") is not None:
            response["current_version"] = payload["current_version"]
        return response
    if rpc_status == "answered":
        group = payload.get("group")
        if not isinstance(group, dict):
            return {"durum": "hata", "mesaj": "Kayıtlı seller cevabı doğrulanamadı."}
        return {
            "durum": "cevap_mevcut",
            "group": group,
            "idempotent": payload.get("idempotent") is True,
            "created": False,
            "notification_created": False,
        }
    if rpc_status == "error":
        return {
            "durum": "hata",
            "mesaj": payload.get("message")
            or "Cevaplanamayan soru işlemi tamamlanamadı.",
        }
    if rpc_status != "success":
        return {
            "durum": "hata",
            "mesaj": "Cevaplanamayan soru işlemi geçersiz yanıt döndürdü.",
        }

    response: dict[str, Any] = {"durum": "başarılı"}
    for key in ("group", "occurrence"):
        if payload.get(key) is not None:
            response[key] = payload[key]
    for key in ("changed", "created", "idempotent", "notification_created"):
        if payload.get(key) is not None:
            response[key] = payload[key] is True
    if payload.get("current_version") is not None:
        response["current_version"] = payload["current_version"]
    return response


def record_unanswered_question_occurrence(
    seller_id: int,
    customer_id: int,
    source_message_id: int,
    question_text: str,
    *,
    category: str = "unclear",
    suggested_field: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Yeni incoming unanswered occurrence'ı atomik/idempotent kaydeder."""
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
        or not _is_positive_int(source_message_id)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id, customer_id ve source_message_id pozitif tam sayı olmalıdır.",
        }

    question_text = question_text.strip()
    category = category.strip() or "unclear"
    suggested_field = suggested_field.strip() if suggested_field else None
    if not question_text or len(question_text) > 4000:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "question_text 1 ile 4000 karakter arasında olmalıdır.",
        }
    if len(category) > 50:
        return {"durum": "doğrulama_hatası", "mesaj": "category en fazla 50 karakter olabilir."}
    if suggested_field is not None and len(suggested_field) > 150:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "suggested_field en fazla 150 karakter olabilir.",
        }
    if metadata is not None and not isinstance(metadata, dict):
        return {"durum": "doğrulama_hatası", "mesaj": "metadata nesne olmalıdır."}

    try:
        result = get_supabase().rpc(
            "record_unanswered_question_occurrence",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "source_message_id": source_message_id,
                "question_text_value": question_text,
                "category_value": category,
                "suggested_field_value": suggested_field,
                "metadata_value": metadata or {},
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Cevaplanamayan soru kaydedilemedi."}
    return _unanswered_rpc_response(result.data)


def get_answered_unanswered_question(
    seller_id: int,
    question_text: str,
) -> dict[str, Any]:
    """Raw soruyu DB-authoritative normalization ile ANSWERED group'a eşler."""
    if not _is_positive_int(seller_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id pozitif tam sayı olmalıdır."}
    question_text = question_text.strip()
    if not question_text or len(question_text) > 4000:
        return {"durum": "doğrulama_hatası", "mesaj": "question_text geçersiz."}

    try:
        result = get_supabase().rpc(
            "get_answered_unanswered_question",
            {
                "target_seller_id": seller_id,
                "question_text_value": question_text,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Kayıtlı seller cevabı okunamadı."}

    mapped = _unanswered_rpc_response(result.data)
    if mapped.get("durum") != "başarılı":
        return mapped
    group = mapped.get("group")
    if group is not None:
        answer = group.get("answer_text") if isinstance(group, dict) else None
        if not isinstance(answer, str) or not answer.strip():
            return {"durum": "hata", "mesaj": "Kayıtlı seller cevabı geçersiz."}
    return {"durum": "başarılı", "group": group}


def get_unanswered_question_group_by_id(
    seller_id: int,
    group_id: int,
) -> dict[str, Any]:
    """Unanswered group'u tenant scope'unda okur."""
    if not _is_positive_int(seller_id) or not _is_positive_int(group_id):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "seller_id ve group_id pozitif tam sayı olmalıdır.",
        }
    try:
        result = (
            get_supabase().table("unanswered_question_groups")
            .select("*")
            .eq("seller_id", seller_id)
            .eq("id", group_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return {"durum": "hata", "mesaj": "Cevaplanamayan soru okunamadı."}
    if not result.data:
        return {"durum": "bulunamadı", "mesaj": "Cevaplanamayan soru bulunamadı."}
    return {"durum": "başarılı", "group": result.data[0]}


def get_unanswered_question_group_detail(
    seller_id: int,
    group_id: int,
    *,
    occurrence_limit: int = 50,
) -> dict[str, Any]:
    """Group ve güvenli occurrence metadata'sını tenant scope'unda döndürür."""
    if not _is_positive_int(occurrence_limit) or occurrence_limit > 100:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "occurrence_limit 1 ile 100 arasında olmalıdır.",
        }
    group_result = get_unanswered_question_group_by_id(seller_id, group_id)
    if group_result.get("durum") != "başarılı":
        return group_result
    try:
        occurrence_result = (
            get_supabase().table("unanswered_question_occurrences")
            .select(
                "id,seller_id,group_id,customer_id,message_id,question_text,"
                "category,suggested_field,metadata,occurred_at"
            )
            .eq("seller_id", seller_id)
            .eq("group_id", group_id)
            .order("occurred_at", desc=True)
            .order("id", desc=True)
            .limit(occurrence_limit)
            .execute()
        )
    except Exception:
        return {"durum": "hata", "mesaj": "Cevaplanamayan soru detayları okunamadı."}
    return {
        "durum": "başarılı",
        "group": group_result["group"],
        "occurrences": occurrence_result.data,
    }


def list_unanswered_question_groups(
    seller_id: int,
    *,
    view: str = "all",
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    """Seller unanswered group listesini tenant scope'unda döndürür."""
    if not _is_positive_int(seller_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id pozitif tam sayı olmalıdır."}

    view_status = {
        "action_required": UNANSWERED_STATUS_OPEN,
        "answered": UNANSWERED_STATUS_ANSWERED,
        "dismissed": UNANSWERED_STATUS_DISMISSED,
        "all": None,
    }
    if view not in view_status:
        return {"durum": "doğrulama_hatası", "mesaj": "view değeri geçersiz."}
    if not _is_positive_int(limit) or limit > 100:
        return {"durum": "doğrulama_hatası", "mesaj": "limit 1 ile 100 arasında olmalıdır."}
    if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0 or offset > 10_000:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "offset 0 ile 10.000 arasında tam sayı olmalıdır.",
        }

    try:
        query = (
            get_supabase().table("unanswered_question_groups")
            .select("id,canonical_question,status,answer_text,occurrence_count,first_seen_at,last_seen_at,version")
            .eq("seller_id", seller_id)
            .order("last_seen_at", desc=True)
            .order("id", desc=True)
            .range(offset, offset + limit - 1)
        )
        status_value = view_status[view]
        if status_value is not None:
            query = query.eq("status", status_value)
        result = query.execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Cevaplanamayan sorular okunamadı."}
    return {"durum": "başarılı", "toplam": len(result.data), "groups": result.data}


def set_unanswered_question_answer(
    seller_id: int,
    group_id: int,
    actor_profile_id: int,
    expected_version: int,
    answer_text: str,
) -> dict[str, Any]:
    """Seller cevabını optimistic concurrency ile kaydeder."""
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(group_id)
        or not _is_positive_int(actor_profile_id)
        or not _is_positive_int(expected_version)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Kimlikler ve expected_version pozitif tam sayı olmalıdır.",
        }
    answer_text = answer_text.strip()
    if not answer_text or len(answer_text) > 4000:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "answer_text 1 ile 4000 karakter arasında olmalıdır.",
        }
    try:
        result = get_supabase().rpc(
            "set_unanswered_question_answer",
            {
                "target_seller_id": seller_id,
                "target_group_id": group_id,
                "actor_profile_id": actor_profile_id,
                "expected_version": expected_version,
                "answer_text_value": answer_text,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Seller cevabı kaydedilemedi."}
    return _unanswered_rpc_response(result.data)


def dismiss_unanswered_question_group(
    seller_id: int,
    group_id: int,
    actor_profile_id: int,
    expected_version: int,
    *,
    note: str | None = None,
) -> dict[str, Any]:
    """OPEN unanswered group'u seller görev listesinden dismiss eder."""
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(group_id)
        or not _is_positive_int(actor_profile_id)
        or not _is_positive_int(expected_version)
    ):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Kimlikler ve expected_version pozitif tam sayı olmalıdır.",
        }
    if note is not None:
        note = note.strip()
        if not note:
            note = None
        elif len(note) > 1000:
            return {"durum": "doğrulama_hatası", "mesaj": "note en fazla 1000 karakter olabilir."}
    try:
        result = get_supabase().rpc(
            "dismiss_unanswered_question_group",
            {
                "target_seller_id": seller_id,
                "target_group_id": group_id,
                "actor_profile_id": actor_profile_id,
                "expected_version": expected_version,
                "dismiss_note_value": note,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Cevaplanamayan soru dismiss edilemedi."}
    return _unanswered_rpc_response(result.data)

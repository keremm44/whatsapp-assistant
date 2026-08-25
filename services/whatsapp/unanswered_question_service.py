from __future__ import annotations

import re
import unicodedata
from typing import Any

from database import (
    UNANSWERED_STATUS_ANSWERED,
    UNANSWERED_STATUS_DISMISSED,
    UNANSWERED_STATUS_OPEN,
    dismiss_unanswered_question_group,
    get_answered_unanswered_question,
    get_unanswered_question_group_detail,
    list_unanswered_question_groups,
    record_unanswered_question_occurrence,
    set_unanswered_question_answer,
)


MAX_QUESTION_LENGTH = 4000
MAX_ANSWER_LENGTH = 4000
MAX_DISMISS_NOTE_LENGTH = 1000


def _is_positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _error(
    code: str,
    message: str,
    *,
    kind: str = "unavailable",
) -> dict[str, Any]:
    return {
        "durum": "hata",
        "error_code": code,
        "mesaj": message,
        "kind": kind,
    }


def _map_database_error(
    result: dict[str, Any],
    *,
    default_code: str,
    default_message: str,
) -> dict[str, Any]:
    durum = result.get("durum")
    if durum in {"bulunamadı", "reddedildi"}:
        return _error(
            "unanswered_question_not_found",
            "Cevaplanamayan soru bulunamadı.",
            kind="not_found",
        )
    if durum == "çakışma":
        mapped = _error(
            "unanswered_question_version_conflict",
            result.get("mesaj") or "Cevaplanamayan soru değişti.",
            kind="conflict",
        )
        if result.get("group") is not None:
            mapped["group"] = result["group"]
        if result.get("current_version") is not None:
            mapped["current_version"] = result["current_version"]
        return mapped
    if durum == "doğrulama_hatası":
        return _error(
            "unanswered_question_validation_error",
            result.get("mesaj") or default_message,
            kind="validation",
        )
    return _error(default_code, default_message, kind="unavailable")


def normalize_question(question: str) -> str:
    """Yerel deterministic önizleme; canonical group identity DB tarafındadır."""
    if not isinstance(question, str):
        return ""

    normalized = unicodedata.normalize("NFKC", question).strip()
    normalized = normalized.translate(str.maketrans({"I": "ı", "İ": "i"})).lower()
    normalized = re.sub(
        r"[^\wşğıöüç\s]",
        " ",
        normalized,
        flags=re.UNICODE,
    )
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def record_question(
    seller_id: int,
    customer_id: int,
    source_message_id: int,
    question_text: str,
    *,
    category: str = "unclear",
    suggested_field: str | None = None,
    reason: str = "bilgi_yok",
) -> dict[str, Any]:
    """Yeni unanswered occurrence'ı kaydeder; yarışta cevap oluşmuşsa onu döndürür."""
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
        or not _is_positive_int(source_message_id)
    ):
        return _error(
            "unanswered_question_validation_error",
            "Tenant ve kaynak mesaj kimliği geçersiz.",
            kind="validation",
        )

    question_text = (question_text or "").strip()
    if not question_text or len(question_text) > MAX_QUESTION_LENGTH:
        return _error(
            "unanswered_question_validation_error",
            "Soru metni geçersiz.",
            kind="validation",
        )

    # Group identity normalization'ı yalnız PostgreSQL yapar. Böylece
    # legacy backfill, yeni occurrence ve saved-answer lookup tek canonical
    # algoritmayı paylaşır.
    result = record_unanswered_question_occurrence(
        seller_id=seller_id,
        customer_id=customer_id,
        source_message_id=source_message_id,
        question_text=question_text,
        category=category,
        suggested_field=suggested_field,
        metadata={"reason": reason},
    )

    if result.get("durum") == "cevap_mevcut":
        group = result.get("group")
        answer = group.get("answer_text") if isinstance(group, dict) else None
        if not isinstance(answer, str) or not answer.strip():
            return _error(
                "unanswered_question_answer_invalid",
                "Kayıtlı seller cevabı doğrulanamadı.",
            )
        return {
            "durum": "başarılı",
            "answer_available": True,
            "answer": answer.strip(),
            "group": group,
            "idempotent": result.get("idempotent") is True,
            "notification_created": False,
        }

    if result.get("durum") != "başarılı":
        return _map_database_error(
            result,
            default_code="unanswered_question_persist_unavailable",
            default_message="Cevaplanamayan soru kaydedilemedi.",
        )

    return {
        "durum": "başarılı",
        "answer_available": False,
        "group": result.get("group"),
        "occurrence": result.get("occurrence"),
        "created": result.get("created") is True,
        "idempotent": result.get("idempotent") is True,
        "notification_created": result.get("notification_created") is True,
    }


def find_saved_answer(
    seller_id: int,
    question_text: str,
) -> dict[str, Any]:
    """Yalnız exact-normalized ANSWERED seller cevabını döndürür."""
    if not _is_positive_int(seller_id):
        return _error(
            "unanswered_question_validation_error",
            "seller_id geçersiz.",
            kind="validation",
        )

    question_text = (question_text or "").strip()
    if not question_text or len(question_text) > MAX_QUESTION_LENGTH:
        return {"durum": "başarılı", "matched": False, "group": None}

    # Identity/eşleşme normalization'ı PostgreSQL tarafında canonicaldır.
    # Böylece record, legacy backfill ve future-answer lookup aynı algoritmayı
    # kullanır; Python Unicode davranışı match sonucunu belirlemez.
    result = get_answered_unanswered_question(seller_id, question_text)
    if result.get("durum") != "başarılı":
        return _map_database_error(
            result,
            default_code="unanswered_question_lookup_unavailable",
            default_message="Kayıtlı seller cevabı okunamadı.",
        )

    group = result.get("group")
    if not isinstance(group, dict):
        return {"durum": "başarılı", "matched": False, "group": None}

    answer = group.get("answer_text")
    if group.get("status") != UNANSWERED_STATUS_ANSWERED:
        return {"durum": "başarılı", "matched": False, "group": None}
    if not isinstance(answer, str) or not answer.strip():
        return _error(
            "unanswered_question_answer_invalid",
            "Kayıtlı seller cevabı geçersiz.",
        )

    return {
        "durum": "başarılı",
        "matched": True,
        "answer": answer.strip(),
        "group": group,
    }


def list_seller_unanswered_questions(
    seller_id: int,
    *,
    view: str = "all",
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    result = list_unanswered_question_groups(
        seller_id,
        view=view,
        limit=limit,
        offset=offset,
    )
    if result.get("durum") != "başarılı":
        return _map_database_error(
            result,
            default_code="unanswered_question_list_unavailable",
            default_message="Cevaplanamayan sorular okunamadı.",
        )
    return result


def get_seller_unanswered_question_detail(
    seller_id: int,
    group_id: int,
) -> dict[str, Any]:
    result = get_unanswered_question_group_detail(seller_id, group_id)
    if result.get("durum") != "başarılı":
        return _map_database_error(
            result,
            default_code="unanswered_question_detail_unavailable",
            default_message="Cevaplanamayan soru detayı okunamadı.",
        )
    return result


def set_seller_answer(
    seller_id: int,
    group_id: int,
    actor_profile_id: int,
    expected_version: int,
    answer: str,
) -> dict[str, Any]:
    answer = (answer or "").strip()
    if not answer or len(answer) > MAX_ANSWER_LENGTH:
        return _error(
            "unanswered_question_validation_error",
            "Cevap 1 ile 4000 karakter arasında olmalıdır.",
            kind="validation",
        )

    result = set_unanswered_question_answer(
        seller_id,
        group_id,
        actor_profile_id,
        expected_version,
        answer,
    )
    if result.get("durum") != "başarılı":
        return _map_database_error(
            result,
            default_code="unanswered_question_answer_unavailable",
            default_message="Seller cevabı kaydedilemedi.",
        )
    return result


def dismiss_seller_unanswered_question(
    seller_id: int,
    group_id: int,
    actor_profile_id: int,
    expected_version: int,
    *,
    note: str | None = None,
) -> dict[str, Any]:
    if note is not None:
        note = note.strip() or None
        if note is not None and len(note) > MAX_DISMISS_NOTE_LENGTH:
            return _error(
                "unanswered_question_validation_error",
                "Dismiss notu en fazla 1000 karakter olabilir.",
                kind="validation",
            )

    result = dismiss_unanswered_question_group(
        seller_id,
        group_id,
        actor_profile_id,
        expected_version,
        note=note,
    )
    if result.get("durum") != "başarılı":
        return _map_database_error(
            result,
            default_code="unanswered_question_dismiss_unavailable",
            default_message="Cevaplanamayan soru dismiss edilemedi.",
        )
    return result


def present_group_summary(group: dict[str, Any]) -> dict[str, Any]:
    status = group.get("status")
    return {
        "id": group.get("id"),
        "question": group.get("canonical_question"),
        "status": status,
        "answer": group.get("answer_text"),
        "occurrence_count": group.get("occurrence_count"),
        "first_seen_at": group.get("first_seen_at"),
        "last_seen_at": group.get("last_seen_at"),
        "version": group.get("version"),
        "seller_action_required": status == UNANSWERED_STATUS_OPEN,
    }

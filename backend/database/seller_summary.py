from __future__ import annotations

from typing import Any

from .common import is_positive_int as _is_positive_int
from .conversations import (
    CONTROL_STATE_ASSISTANT_PAUSED,
    CONTROL_STATE_SELLER_TAKEN_OVER,
)
from .returns import RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED
from .unanswered import UNANSWERED_STATUS_OPEN


def get_supabase():
    import database

    return database.get_supabase()


def _extract_count(result: Any) -> int | None:
    # Supabase-py count is available as .count when count="exact" is requested.
    # Fallback to len(data) for mocked environments where count is not set.
    if hasattr(result, "count"):
        count_val = getattr(result, "count")
        if isinstance(count_val, int) and not isinstance(count_val, bool) and count_val >= 0:
            return count_val
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return len(data)
    return None


def _count_return_issue_action_required(seller_id: int) -> dict[str, Any]:
    if not _is_positive_int(seller_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id pozitif tam sayı olmalıdır."}
    try:
        # Hafif count: head=True + count="exact" avoids fetching rows.
        # Fallback to len(data) keeps mocked tests simple.
        query = get_supabase().table("return_issue_requests").select("id", count="exact", head=True)
        query = query.eq("seller_id", seller_id).eq("status", RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED)
        result = query.execute()
    except Exception:
        return {"durum": "hata", "mesaj": "İade/sorun sayımı okunamadı."}
    count = _extract_count(result)
    if count is None:
        return {"durum": "hata", "mesaj": "İade/sorun sayımı geçersiz yanıt döndürdü."}
    return {"durum": "başarılı", "count": count}


def _count_unanswered_open(seller_id: int) -> dict[str, Any]:
    if not _is_positive_int(seller_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id pozitif tam sayı olmalıdır."}
    try:
        query = get_supabase().table("unanswered_question_groups").select("id", count="exact", head=True)
        query = query.eq("seller_id", seller_id).eq("status", UNANSWERED_STATUS_OPEN)
        result = query.execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Cevaplanamayan soru sayımı okunamadı."}
    count = _extract_count(result)
    if count is None:
        return {"durum": "hata", "mesaj": "Cevaplanamayan soru sayımı geçersiz yanıt döndürdü."}
    return {"durum": "başarılı", "count": count}


def _count_paused_or_taken_over(seller_id: int) -> dict[str, Any]:
    if not _is_positive_int(seller_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id pozitif tam sayı olmalıdır."}
    try:
        query = get_supabase().table("conversation_states").select("id", count="exact", head=True)
        query = query.eq("seller_id", seller_id).in_(
            "control_state",
            [CONTROL_STATE_ASSISTANT_PAUSED, CONTROL_STATE_SELLER_TAKEN_OVER],
        )
        result = query.execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Konuşma kontrol sayımı okunamadı."}
    count = _extract_count(result)
    if count is None:
        return {"durum": "hata", "mesaj": "Konuşma kontrol sayımı geçersiz yanıt döndürdü."}
    return {"durum": "başarılı", "count": count}


def get_seller_action_counts(seller_id: int) -> dict[str, Any]:
    """Seller-scoped hafif action-count read model.

    Three independent lightweight counts via indexed columns:
      - return_issue_requests where status=SELLER_REVIEW_REQUIRED
      - unanswered_question_groups where status=OPEN
      - conversation_states where control_state in (ASSISTANT_PAUSED, SELLER_TAKEN_OVER)

    Tenant isolation is guaranteed by seller_id filter which is always
    provided from authenticated AuthContext, never from client payload.
    """
    if not _is_positive_int(seller_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id pozitif tam sayı olmalıdır."}

    r1 = _count_return_issue_action_required(seller_id)
    if r1.get("durum") != "başarılı":
        return r1
    r2 = _count_unanswered_open(seller_id)
    if r2.get("durum") != "başarılı":
        return r2
    r3 = _count_paused_or_taken_over(seller_id)
    if r3.get("durum") != "başarılı":
        return r3

    return {
        "durum": "başarılı",
        "returns_action_required": r1["count"],
        "unanswered_open": r2["count"],
        "paused_or_taken_over": r3["count"],
    }

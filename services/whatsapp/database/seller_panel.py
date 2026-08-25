from __future__ import annotations

from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload
from .common import is_positive_int as _is_positive_int
from .conversations import VALID_CONTROL_STATES


def get_supabase():
    import database
    return database.get_supabase()


SELLER_DASHBOARD_TASK_TYPES = {
    "return_review",
    "order_review",
    "unanswered_question",
}


def _seller_panel_rpc_payload(data: Any) -> dict[str, Any] | None:
    return _extract_rpc_payload(data)


def get_seller_conversation_list(
    seller_id: int,
    *,
    limit: int = 20,
    offset: int = 0,
    attention_only: bool = False,
    control_state: str | None = None,
) -> dict[str, Any]:
    if not _is_positive_int(seller_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id pozitif tam sayı olmalıdır."}
    if not _is_positive_int(limit) or limit > 100:
        return {"durum": "doğrulama_hatası", "mesaj": "limit 1 ile 100 arasında olmalıdır."}
    if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0 or offset > 10_000:
        return {"durum": "doğrulama_hatası", "mesaj": "offset 0 ile 10.000 arasında tam sayı olmalıdır."}
    if not isinstance(attention_only, bool):
        return {"durum": "doğrulama_hatası", "mesaj": "attention_only boolean olmalıdır."}
    if control_state is not None and control_state not in VALID_CONTROL_STATES:
        return {"durum": "doğrulama_hatası", "mesaj": "control_state değeri geçersiz."}

    rpc_params: dict[str, Any] = {
        "target_seller_id": seller_id,
        "result_limit": limit,
        "result_offset": offset,
        "attention_only": attention_only,
    }
    if control_state is not None:
        rpc_params["target_control_state"] = control_state
    try:
        result = get_supabase().rpc("get_seller_conversation_list", rpc_params).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Konuşma listesi okunamadı."}

    payload = _seller_panel_rpc_payload(result.data)
    if payload is None:
        return {"durum": "hata", "mesaj": "Konuşma listesi geçersiz yanıt döndürdü."}
    if payload.get("status") == "error":
        return {"durum": "doğrulama_hatası", "mesaj": payload.get("message") or "Konuşma listesi parametreleri geçersiz."}
    conversations = payload.get("conversations")
    total = payload.get("total")
    if payload.get("status") != "success" or not isinstance(conversations, list):
        return {"durum": "hata", "mesaj": "Konuşma listesi geçersiz yanıt döndürdü."}
    if not isinstance(total, int) or isinstance(total, bool) or total < 0:
        return {"durum": "hata", "mesaj": "Konuşma listesi toplam değeri geçersiz."}
    return {"durum": "başarılı", "toplam": total, "conversations": conversations}


def get_seller_conversation_detail_read_model(
    seller_id: int,
    customer_id: int,
    *,
    message_limit: int = 50,
    before_message_id: int | None = None,
    control_history_limit: int = 20,
) -> dict[str, Any]:
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id ve customer_id pozitif tam sayı olmalıdır."}
    if not _is_positive_int(message_limit) or message_limit > 100:
        return {"durum": "doğrulama_hatası", "mesaj": "message_limit 1 ile 100 arasında olmalıdır."}
    if before_message_id is not None and not _is_positive_int(before_message_id):
        return {"durum": "doğrulama_hatası", "mesaj": "before_message_id pozitif tam sayı olmalıdır."}
    if not _is_positive_int(control_history_limit) or control_history_limit > 100:
        return {"durum": "doğrulama_hatası", "mesaj": "control_history_limit 1 ile 100 arasında olmalıdır."}
    try:
        result = get_supabase().rpc(
            "get_seller_conversation_detail",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "message_limit": message_limit,
                "before_message_id": before_message_id,
                "control_history_limit": control_history_limit,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Konuşma detayı okunamadı."}

    payload = _seller_panel_rpc_payload(result.data)
    if payload is None:
        return {"durum": "hata", "mesaj": "Konuşma detayı geçersiz yanıt döndürdü."}
    status_value = payload.get("status")
    if status_value == "not_found":
        return {"durum": "bulunamadı", "mesaj": "Konuşma bulunamadı."}
    if status_value == "error":
        return {"durum": "doğrulama_hatası", "mesaj": payload.get("message") or "Konuşma detayı parametreleri geçersiz."}
    if status_value != "success" or not isinstance(payload.get("customer"), dict):
        return {"durum": "hata", "mesaj": "Konuşma detayı geçersiz yanıt döndürdü."}
    return {
        "durum": "başarılı",
        "customer": payload["customer"],
        "conversation_state": payload.get("conversation_state"),
        "control": payload.get("control"),
        "messages": payload.get("messages") or [],
        "message_page": payload.get("message_page") or {},
        "control_history": payload.get("control_history") or [],
        "active_order": payload.get("active_order"),
        "active_return_issue": payload.get("active_return_issue"),
        "open_unanswered": payload.get("open_unanswered") or [],
    }


def get_seller_dashboard_task_list(
    seller_id: int,
    *,
    task_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    if not _is_positive_int(seller_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id pozitif tam sayı olmalıdır."}
    if task_type is not None and task_type not in SELLER_DASHBOARD_TASK_TYPES:
        return {"durum": "doğrulama_hatası", "mesaj": "task_type değeri geçersiz."}
    if not _is_positive_int(limit) or limit > 100:
        return {"durum": "doğrulama_hatası", "mesaj": "limit 1 ile 100 arasında olmalıdır."}
    if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0 or offset > 10_000:
        return {"durum": "doğrulama_hatası", "mesaj": "offset 0 ile 10.000 arasında tam sayı olmalıdır."}
    try:
        result = get_supabase().rpc(
            "get_seller_dashboard_tasks",
            {
                "target_seller_id": seller_id,
                "task_type_value": task_type,
                "result_limit": limit,
                "result_offset": offset,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "Dashboard görevleri okunamadı."}

    payload = _seller_panel_rpc_payload(result.data)
    if payload is None:
        return {"durum": "hata", "mesaj": "Dashboard görevleri geçersiz yanıt döndürdü."}
    if payload.get("status") == "error":
        return {"durum": "doğrulama_hatası", "mesaj": payload.get("message") or "Dashboard görev parametreleri geçersiz."}
    tasks = payload.get("tasks")
    total = payload.get("total")
    if payload.get("status") != "success" or not isinstance(tasks, list):
        return {"durum": "hata", "mesaj": "Dashboard görevleri geçersiz yanıt döndürdü."}
    if not isinstance(total, int) or isinstance(total, bool) or total < 0:
        return {"durum": "hata", "mesaj": "Dashboard görev toplamı geçersiz."}
    return {"durum": "başarılı", "toplam": total, "tasks": tasks}

from __future__ import annotations

from typing import Any

from database import (
    get_seller_conversation_detail_read_model,
    get_seller_conversation_list,
    get_seller_dashboard_task_list,
)


def _failure(code: str, message: str, *, kind: str) -> dict[str, Any]:
    return {
        "ok": False,
        "error": {"code": code, "message": message},
        "kind": kind,
    }


def _map_database_failure(
    result: dict[str, Any],
    *,
    unavailable_code: str,
    unavailable_message: str,
) -> dict[str, Any]:
    durum = result.get("durum")
    if durum == "bulunamadı":
        return _failure(
            "seller_conversation_not_found",
            "Konuşma bulunamadı.",
            kind="not_found",
        )
    if durum == "doğrulama_hatası":
        return _failure(
            "seller_panel_validation_error",
            result.get("mesaj") or "İstek parametreleri geçersiz.",
            kind="validation",
        )
    return _failure(
        unavailable_code,
        unavailable_message,
        kind="unavailable",
    )


def list_conversations(
    seller_id: int,
    *,
    attention_only: bool = False,
    control_state: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    result = get_seller_conversation_list(
        seller_id,
        attention_only=attention_only,
        control_state=control_state,
        limit=limit,
        offset=offset,
    )
    if result.get("durum") != "başarılı":
        return _map_database_failure(
            result,
            unavailable_code="seller_conversation_list_unavailable",
            unavailable_message="Konuşma listesine şu anda erişilemiyor.",
        )

    conversations = result.get("conversations")
    if not isinstance(conversations, list):
        return _failure(
            "seller_conversation_list_unavailable",
            "Konuşma listesine şu anda erişilemiyor.",
            kind="unavailable",
        )

    return {
        "ok": True,
        "toplam": result["toplam"],
        "limit": limit,
        "offset": offset,
        "attention_only": attention_only,
        "control_state": control_state,
        "conversations": conversations,
    }


def get_conversation_detail(
    seller_id: int,
    customer_id: int,
    *,
    message_limit: int = 50,
    before_message_id: int | None = None,
    control_history_limit: int = 20,
) -> dict[str, Any]:
    result = get_seller_conversation_detail_read_model(
        seller_id,
        customer_id,
        message_limit=message_limit,
        before_message_id=before_message_id,
        control_history_limit=control_history_limit,
    )
    if result.get("durum") != "başarılı":
        return _map_database_failure(
            result,
            unavailable_code="seller_conversation_detail_unavailable",
            unavailable_message="Konuşma detayına şu anda erişilemiyor.",
        )

    return {
        "ok": True,
        "customer": result["customer"],
        "conversation_state": result.get("conversation_state"),
        "control": result.get("control"),
        "messages": result.get("messages") or [],
        "message_page": result.get("message_page") or {},
        "control_history": result.get("control_history") or [],
        "active_order": result.get("active_order"),
        "active_return_issue": result.get("active_return_issue"),
        "open_unanswered": result.get("open_unanswered") or [],
    }


def list_dashboard_tasks(
    seller_id: int,
    *,
    task_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    result = get_seller_dashboard_task_list(
        seller_id,
        task_type=task_type,
        limit=limit,
        offset=offset,
    )
    if result.get("durum") != "başarılı":
        return _map_database_failure(
            result,
            unavailable_code="seller_dashboard_tasks_unavailable",
            unavailable_message="İlgilenmeniz gerekenler şu anda okunamıyor.",
        )

    tasks = result.get("tasks")
    if not isinstance(tasks, list):
        return _failure(
            "seller_dashboard_tasks_unavailable",
            "İlgilenmeniz gerekenler şu anda okunamıyor.",
            kind="unavailable",
        )

    return {
        "ok": True,
        "toplam": result["toplam"],
        "limit": limit,
        "offset": offset,
        "type": task_type,
        "tasks": tasks,
    }

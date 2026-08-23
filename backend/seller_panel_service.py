from __future__ import annotations

from typing import Any

from database import (
    ORDER_STATUS_SELLER_REVIEW_REQUIRED,
    RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED,
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


def _enrich_active_order(order: dict[str, Any] | None, customer_id: int | None) -> dict[str, Any] | None:
    if not isinstance(order, dict):
        return order
    status = order.get("status")
    enriched: dict[str, Any] = {**order}
    if customer_id is not None and "customer_id" not in enriched:
        enriched["customer_id"] = customer_id
    if "seller_action_required" not in enriched:
        enriched["seller_action_required"] = status == ORDER_STATUS_SELLER_REVIEW_REQUIRED
    return enriched


def _enrich_active_return(issue: dict[str, Any] | None, customer_id: int | None) -> dict[str, Any] | None:
    if not isinstance(issue, dict):
        return issue
    status = issue.get("status")
    enriched: dict[str, Any] = {**issue}
    if customer_id is not None and "customer_id" not in enriched:
        enriched["customer_id"] = customer_id
    if "seller_action_required" not in enriched:
        enriched["seller_action_required"] = status == RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED
    return enriched


def _enrich_open_unanswered(entries: Any) -> Any:
    if not isinstance(entries, list):
        return entries
    enriched_list: list[Any] = []
    for entry in entries:
        if isinstance(entry, dict):
            if "seller_action_required" not in entry:
                enriched_list.append({**entry, "seller_action_required": True})
            else:
                enriched_list.append(entry)
        else:
            enriched_list.append(entry)
    return enriched_list


def _enrich_conversation_entry(entry: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(entry, dict):
        return entry
    customer = entry.get("customer") if isinstance(entry.get("customer"), dict) else None
    customer_id = customer.get("id") if isinstance(customer, dict) and isinstance(customer.get("id"), int) else None
    enriched_entry = dict(entry)
    enriched_entry["active_order"] = _enrich_active_order(entry.get("active_order"), customer_id)
    enriched_entry["active_return_issue"] = _enrich_active_return(entry.get("active_return_issue"), customer_id)
    if "open_unanswered" in entry:
        val = entry.get("open_unanswered")
        if isinstance(val, list):
            enriched_entry["open_unanswered"] = _enrich_open_unanswered(val)
        elif isinstance(val, dict):
            enriched_entry["open_unanswered"] = {**val, "seller_action_required": True} if "seller_action_required" not in val else val
    return enriched_entry


def _read_ai_context(seller_id: int, customer_id: int) -> dict[str, Any] | None:
    """Read advisory AI memory and today's counters; never make seller panel availability depend on them."""
    try:
        import database

        memory_result = (
            database.get_supabase()
            .table("conversation_ai_memories")
            .select("summary_text,memory_incomplete,updated_at")
            .eq("seller_id", seller_id)
            .eq("customer_id", customer_id)
            .limit(1)
            .execute()
        )
        usage_result = (
            database.get_supabase()
            .table("conversation_ai_usage_daily")
            .select("usage_date,call_count,prompt_tokens,completion_tokens,total_tokens,updated_at")
            .eq("seller_id", seller_id)
            .eq("customer_id", customer_id)
            .order("usage_date", desc=True)
            .limit(1)
            .execute()
        )
    except Exception:
        return None

    memory_row = memory_result.data[0] if memory_result.data else None
    usage_row = usage_result.data[0] if usage_result.data else None
    if not isinstance(memory_row, dict) and not isinstance(usage_row, dict):
        return None

    summary = memory_row.get("summary_text") if isinstance(memory_row, dict) else None
    if not isinstance(summary, str):
        summary = ""
    summary = " ".join(summary.strip().split())[:1200]

    usage: dict[str, Any] | None = None
    if isinstance(usage_row, dict):
        numeric_fields = ("call_count", "prompt_tokens", "completion_tokens", "total_tokens")
        if all(
            isinstance(usage_row.get(field), int)
            and not isinstance(usage_row.get(field), bool)
            and usage_row.get(field) >= 0
            for field in numeric_fields
        ):
            usage = {
                "date": usage_row.get("usage_date"),
                "call_count": usage_row["call_count"],
                "prompt_tokens": usage_row["prompt_tokens"],
                "completion_tokens": usage_row["completion_tokens"],
                "total_tokens": usage_row["total_tokens"],
                "updated_at": usage_row.get("updated_at"),
            }

    return {
        "summary": summary or None,
        "memory_incomplete": (
            memory_row.get("memory_incomplete") is True
            if isinstance(memory_row, dict)
            else False
        ),
        "summary_updated_at": (
            memory_row.get("updated_at") if isinstance(memory_row, dict) else None
        ),
        "usage": usage,
    }


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

    enriched = [_enrich_conversation_entry(c) if isinstance(c, dict) else c for c in conversations]

    return {
        "ok": True,
        "toplam": result["toplam"],
        "limit": limit,
        "offset": offset,
        "attention_only": attention_only,
        "control_state": control_state,
        "conversations": enriched,
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

    active_order = _enrich_active_order(result.get("active_order"), customer_id)
    active_return_issue = _enrich_active_return(result.get("active_return_issue"), customer_id)
    open_unanswered = _enrich_open_unanswered(result.get("open_unanswered") or [])

    payload: dict[str, Any] = {
        "ok": True,
        "customer": result["customer"],
        "conversation_state": result.get("conversation_state"),
        "control": result.get("control"),
        "messages": result.get("messages") or [],
        "message_page": result.get("message_page") or {},
        "control_history": result.get("control_history") or [],
        "active_order": active_order,
        "active_return_issue": active_return_issue,
        "open_unanswered": open_unanswered,
    }
    ai_context = _read_ai_context(seller_id, customer_id)
    if ai_context is not None:
        payload["ai_context"] = ai_context
    return payload


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

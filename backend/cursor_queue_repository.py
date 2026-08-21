from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from database import get_supabase


ORDER_STATUS_COLLECTING = "COLLECTING"
ORDER_STATUS_SELLER_REVIEW_REQUIRED = "SELLER_REVIEW_REQUIRED"
RETURN_STATUS_COLLECTING = "COLLECTING"
RETURN_STATUS_SELLER_REVIEW_REQUIRED = "SELLER_REVIEW_REQUIRED"
RETURN_STATUS_HANDLED = "HANDLED"
UNANSWERED_STATUS_OPEN = "OPEN"
UNANSWERED_STATUS_ANSWERED = "ANSWERED"
UNANSWERED_STATUS_DISMISSED = "DISMISSED"


def _rpc_payload(data: Any) -> dict[str, Any] | None:
    if isinstance(data, dict):
        return data
    if isinstance(data, list) and len(data) == 1 and isinstance(data[0], dict):
        return data[0]
    return None


def _parse_timestamp(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc).isoformat()


def _positive_int(value: Any) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool) and value > 0:
        return value
    return None


def _cursor_pair(
    position: dict[str, Any] | None,
    time_key: str,
) -> tuple[str, int] | None:
    if position is None:
        return None
    if set(position) != {time_key, "id"}:
        return None
    timestamp = _parse_timestamp(position.get(time_key))
    row_id = _positive_int(position.get("id"))
    if timestamp is None or row_id is None:
        return None
    return timestamp, row_id


def _sort_time_id(
    rows: list[dict[str, Any]],
    time_field: str,
) -> list[dict[str, Any]]:
    def key(row: dict[str, Any]) -> tuple[datetime, int]:
        normalized = _parse_timestamp(row.get(time_field))
        if normalized is None:
            raise ValueError("Geçersiz sıralama zamanı.")
        row_id = _positive_int(row.get("id"))
        if row_id is None:
            raise ValueError("Geçersiz sıra kimliği.")
        return datetime.fromisoformat(normalized), row_id

    return sorted(rows, key=key, reverse=True)


def _run_keyset_table_page(
    *,
    table_name: str,
    build_query: Callable[[], Any],
    time_field: str,
    limit: int,
    position: dict[str, Any] | None,
) -> dict[str, Any]:
    pair = _cursor_pair(position, time_field)
    if position is not None and pair is None:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Cursor pozisyonu geçersiz.",
        }

    try:
        if pair is None:
            rows = (
                build_query()
                .order(time_field, desc=True)
                .order("id", desc=True)
                .limit(limit + 1)
                .execute()
                .data
            )
        else:
            cursor_time, cursor_id = pair
            same_time = (
                build_query()
                .eq(time_field, cursor_time)
                .lt("id", cursor_id)
                .order(time_field, desc=True)
                .order("id", desc=True)
                .limit(limit + 1)
                .execute()
                .data
            )
            older = (
                build_query()
                .lt(time_field, cursor_time)
                .order(time_field, desc=True)
                .order("id", desc=True)
                .limit(limit + 1)
                .execute()
                .data
            )
            if not isinstance(same_time, list) or not isinstance(older, list):
                return {
                    "durum": "hata",
                    "mesaj": f"{table_name} geçersiz yanıt döndürdü.",
                }
            dedup: dict[int, dict[str, Any]] = {}
            for row in [*same_time, *older]:
                if not isinstance(row, dict):
                    return {
                        "durum": "hata",
                        "mesaj": f"{table_name} geçersiz yanıt döndürdü.",
                    }
                row_id = _positive_int(row.get("id"))
                if row_id is None:
                    return {
                        "durum": "hata",
                        "mesaj": f"{table_name} geçersiz yanıt döndürdü.",
                    }
                dedup[row_id] = row
            rows = _sort_time_id(list(dedup.values()), time_field)[: limit + 1]

        if not isinstance(rows, list) or any(
            not isinstance(row, dict) for row in rows
        ):
            return {
                "durum": "hata",
                "mesaj": f"{table_name} geçersiz yanıt döndürdü.",
            }
        rows = _sort_time_id(rows, time_field)
    except Exception:
        return {
            "durum": "hata",
            "mesaj": f"{table_name} okunamadı.",
        }

    has_more = len(rows) > limit
    visible = rows[:limit]
    next_position = None
    if has_more and visible:
        last = visible[-1]
        timestamp = _parse_timestamp(last.get(time_field))
        row_id = _positive_int(last.get("id"))
        if timestamp is None or row_id is None:
            return {
                "durum": "hata",
                "mesaj": f"{table_name} geçersiz cursor alanı döndürdü.",
            }
        next_position = {time_field: timestamp, "id": row_id}

    return {
        "durum": "başarılı",
        "items": visible,
        "has_more": has_more,
        "next_position": next_position,
    }


def list_conversation_cursor_records(
    seller_id: int,
    *,
    attention_only: bool,
    control_state: str | None,
    limit: int,
    position: dict[str, Any] | None,
) -> dict[str, Any]:
    cursor_values = {
        "cursor_paused_rank": None,
        "cursor_attention_rank": None,
        "cursor_sort_at": None,
        "cursor_customer_id": None,
    }
    if position is not None:
        if set(position) != {
            "paused_rank",
            "attention_rank",
            "sort_at",
            "customer_id",
        }:
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "Conversation cursor geçersiz.",
            }
        paused_rank = position.get("paused_rank")
        attention_rank = position.get("attention_rank")
        sort_at = _parse_timestamp(position.get("sort_at"))
        customer_id = _positive_int(position.get("customer_id"))
        if paused_rank not in {0, 1} or isinstance(paused_rank, bool):
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "Conversation cursor geçersiz.",
            }
        if attention_rank not in {0, 1} or isinstance(attention_rank, bool):
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "Conversation cursor geçersiz.",
            }
        if sort_at is None or customer_id is None:
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "Conversation cursor geçersiz.",
            }
        cursor_values = {
            "cursor_paused_rank": paused_rank,
            "cursor_attention_rank": attention_rank,
            "cursor_sort_at": sort_at,
            "cursor_customer_id": customer_id,
        }

    try:
        result = get_supabase().rpc(
            "get_seller_conversation_list_cursor",
            {
                "target_seller_id": seller_id,
                "result_limit": limit,
                "attention_only": attention_only,
                "target_control_state": control_state,
                **cursor_values,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Konuşma cursor listesi okunamadı.",
        }

    payload = _rpc_payload(result.data)
    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "Konuşma cursor listesi geçersiz yanıt döndürdü.",
        }
    if payload.get("status") == "error":
        return {
            "durum": "doğrulama_hatası",
            "mesaj": payload.get("message") or "Cursor geçersiz.",
        }
    conversations = payload.get("conversations")
    has_more = payload.get("has_more")
    next_position = payload.get("next_position")
    if (
        payload.get("status") != "success"
        or not isinstance(conversations, list)
        or not isinstance(has_more, bool)
    ):
        return {
            "durum": "hata",
            "mesaj": "Konuşma cursor listesi geçersiz yanıt döndürdü.",
        }
    if has_more and not isinstance(next_position, dict):
        return {
            "durum": "hata",
            "mesaj": "Konuşma cursor pozisyonu eksik.",
        }
    if not has_more:
        next_position = None
    return {
        "durum": "başarılı",
        "items": conversations,
        "has_more": has_more,
        "next_position": next_position,
    }


def list_dashboard_cursor_records(
    seller_id: int,
    *,
    task_type: str | None,
    limit: int,
    position: dict[str, Any] | None,
) -> dict[str, Any]:
    cursor_values = {
        "cursor_priority_rank": None,
        "cursor_updated_at": None,
        "cursor_entity_id": None,
    }
    if position is not None:
        if set(position) != {
            "priority_rank",
            "updated_at",
            "related_entity_id",
        }:
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "Dashboard cursor geçersiz.",
            }
        priority_rank = position.get("priority_rank")
        updated_at = _parse_timestamp(position.get("updated_at"))
        entity_id = _positive_int(position.get("related_entity_id"))
        if (
            priority_rank not in {1, 2, 3}
            or isinstance(priority_rank, bool)
            or updated_at is None
            or entity_id is None
        ):
            return {
                "durum": "doğrulama_hatası",
                "mesaj": "Dashboard cursor geçersiz.",
            }
        cursor_values = {
            "cursor_priority_rank": priority_rank,
            "cursor_updated_at": updated_at,
            "cursor_entity_id": entity_id,
        }

    try:
        result = get_supabase().rpc(
            "get_seller_dashboard_tasks_cursor",
            {
                "target_seller_id": seller_id,
                "task_type_value": task_type,
                "result_limit": limit,
                **cursor_values,
            },
        ).execute()
    except Exception:
        return {
            "durum": "hata",
            "mesaj": "Dashboard cursor listesi okunamadı.",
        }

    payload = _rpc_payload(result.data)
    if payload is None:
        return {
            "durum": "hata",
            "mesaj": "Dashboard cursor listesi geçersiz yanıt döndürdü.",
        }
    if payload.get("status") == "error":
        return {
            "durum": "doğrulama_hatası",
            "mesaj": payload.get("message") or "Cursor geçersiz.",
        }
    tasks = payload.get("tasks")
    has_more = payload.get("has_more")
    next_position = payload.get("next_position")
    if (
        payload.get("status") != "success"
        or not isinstance(tasks, list)
        or not isinstance(has_more, bool)
    ):
        return {
            "durum": "hata",
            "mesaj": "Dashboard cursor listesi geçersiz yanıt döndürdü.",
        }
    if has_more and not isinstance(next_position, dict):
        return {
            "durum": "hata",
            "mesaj": "Dashboard cursor pozisyonu eksik.",
        }
    if not has_more:
        next_position = None
    return {
        "durum": "başarılı",
        "items": tasks,
        "has_more": has_more,
        "next_position": next_position,
    }


def list_order_cursor_records(
    seller_id: int,
    *,
    view: str,
    status: str | None,
    product_id: int | None,
    image_missing: bool | None,
    customer_id: int | None,
    external_order_number: str | None,
    limit: int,
    position: dict[str, Any] | None,
    columns: str | None = None,
) -> dict[str, Any]:
    def build_query() -> Any:
        query = (
            get_supabase()
            .table("orders")
            .select(columns or "*")
            .eq("seller_id", seller_id)
        )
        if view == "action_required":
            query = query.eq("status", ORDER_STATUS_SELLER_REVIEW_REQUIRED)
        elif view == "collecting":
            query = query.eq("status", ORDER_STATUS_COLLECTING)
        if status is not None:
            query = query.eq("status", status)
        if product_id is not None:
            query = query.eq("product_id", product_id)
        if image_missing is True:
            query = query.is_("image_message_id", "null")
        elif image_missing is False:
            query = query.not_.is_("image_message_id", "null")
        if customer_id is not None:
            query = query.eq("customer_id", customer_id)
        if external_order_number:
            query = query.eq("external_order_number", external_order_number)
        return query

    result = _run_keyset_table_page(
        table_name="Sipariş listesi",
        build_query=build_query,
        time_field="updated_at",
        limit=limit,
        position=position,
    )
    if result.get("durum") == "başarılı":
        result["orders"] = result.pop("items")
    return result


def list_return_cursor_records(
    seller_id: int,
    *,
    view: str,
    customer_id: int | None,
    issue_type: str | None,
    external_order_number: str | None,
    limit: int,
    position: dict[str, Any] | None,
    columns: str | None = None,
) -> dict[str, Any]:
    status_by_view = {
        "action_required": RETURN_STATUS_SELLER_REVIEW_REQUIRED,
        "collecting": RETURN_STATUS_COLLECTING,
        "handled": RETURN_STATUS_HANDLED,
        "all": None,
    }

    def build_query() -> Any:
        query = (
            get_supabase()
            .table("return_issue_requests")
            .select(columns or "*")
            .eq("seller_id", seller_id)
        )
        target_status = status_by_view.get(view)
        if target_status is not None:
            query = query.eq("status", target_status)
        if customer_id is not None:
            query = query.eq("customer_id", customer_id)
        if issue_type is not None:
            query = query.eq("issue_type", issue_type)
        if external_order_number:
            query = query.eq(
                "external_order_number_snapshot",
                external_order_number,
            )
        return query

    result = _run_keyset_table_page(
        table_name="İade/sorun listesi",
        build_query=build_query,
        time_field="updated_at",
        limit=limit,
        position=position,
    )
    if result.get("durum") == "başarılı":
        result["requests"] = result.pop("items")
    return result


def list_unanswered_cursor_records(
    seller_id: int,
    *,
    view: str,
    limit: int,
    position: dict[str, Any] | None,
    columns: str | None = None,
) -> dict[str, Any]:
    status_by_view = {
        "action_required": UNANSWERED_STATUS_OPEN,
        "answered": UNANSWERED_STATUS_ANSWERED,
        "dismissed": UNANSWERED_STATUS_DISMISSED,
        "all": None,
    }

    def build_query() -> Any:
        query = (
            get_supabase()
            .table("unanswered_question_groups")
            .select(columns or "*")
            .eq("seller_id", seller_id)
        )
        target_status = status_by_view.get(view)
        if target_status is not None:
            query = query.eq("status", target_status)
        return query

    result = _run_keyset_table_page(
        table_name="Cevaplanamayan soru listesi",
        build_query=build_query,
        time_field="last_seen_at",
        limit=limit,
        position=position,
    )
    if result.get("durum") == "başarılı":
        result["groups"] = result.pop("items")
    return result

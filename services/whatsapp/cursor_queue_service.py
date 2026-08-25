from __future__ import annotations

from typing import Any

from cursor_queue_repository import (
    list_conversation_cursor_records,
    list_dashboard_cursor_records,
    list_order_cursor_records,
    list_return_cursor_records,
    list_unanswered_cursor_records,
)
from database import (
    ORDER_DISPLAY_STATUS,
    ORDER_STATUS_SELLER_REVIEW_REQUIRED,
    RETURN_ISSUE_TYPES,
    VALID_CONTROL_STATES,
    VALID_ORDER_STATUSES,
    get_customers_by_ids,
)
from pagination_cursor import CursorError, decode_cursor, encode_cursor
from return_issue_service import ISSUE_TYPE_DISPLAY_NAMES
from unanswered_question_service import present_group_summary


_QUEUE_CONVERSATIONS = "seller_conversations_v2"
_QUEUE_DASHBOARD = "seller_dashboard_tasks_v2"
_QUEUE_ORDERS = "seller_orders_v2"
_QUEUE_RETURNS = "seller_return_issues_v2"
_QUEUE_UNANSWERED = "seller_unanswered_v2"


def _failure(code: str, message: str, *, kind: str) -> dict[str, Any]:
    return {
        "ok": False,
        "kind": kind,
        "error": {"code": code, "message": message},
    }


def _map_repository_failure(
    result: dict[str, Any],
    *,
    code: str,
    message: str,
) -> dict[str, Any]:
    if result.get("durum") == "doğrulama_hatası":
        return _failure(
            "seller_cursor_validation_error",
            result.get("mesaj") or "Cursor geçersiz.",
            kind="validation",
        )
    return _failure(code, message, kind="unavailable")


def _decode(
    token: str | None,
    queue: str,
    filters: dict[str, Any],
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    if token is None:
        return None, None
    try:
        return decode_cursor(token, queue, filters), None
    except CursorError as exc:
        return None, _failure(
            "seller_cursor_invalid",
            str(exc),
            kind="validation",
        )


def _page_response(
    *,
    queue: str,
    filters: dict[str, Any],
    limit: int,
    has_more: bool,
    next_position: dict[str, Any] | None,
    item_key: str,
    items: list[dict[str, Any]],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if has_more and not next_position:
        return _failure(
            "seller_cursor_page_unavailable",
            "Sonraki cursor üretilemedi.",
            kind="unavailable",
        )
    next_cursor = (
        encode_cursor(queue, filters, next_position)
        if has_more and next_position
        else None
    )
    return {
        "ok": True,
        "limit": limit,
        "has_more": has_more,
        "next_cursor": next_cursor,
        **(extra or {}),
        item_key: items,
    }


def _present_conversation(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "customer": {
            "id": row.get("customer_id"),
            "name": row.get("customer_name"),
            "whatsapp_number": row.get("whatsapp_number"),
            "is_blocked": row.get("is_blocked"),
            "muted_until": row.get("muted_until"),
            "is_muted": row.get("is_muted") is True,
            "total_messages": row.get("total_messages"),
            "last_message_at": row.get("customer_last_message_at"),
        },
        "last_message": (
            None
            if row.get("last_message_id") is None
            else {
                "id": row.get("last_message_id"),
                "direction": row.get("last_message_direction"),
                "content": row.get("last_message_content"),
                "message_type": row.get("last_message_type"),
                "was_auto_replied": row.get("last_message_was_auto_replied"),
                "media_available": row.get("last_message_media_available"),
                "created_at": row.get("last_message_created_at"),
            }
        ),
        "conversation_state": (
            None
            if row.get("current_state") is None
            else {
                "state": row.get("current_state"),
                "state_type": row.get("state_type"),
                "updated_at": row.get("state_updated_at"),
            }
        ),
        "control": (
            None
            if row.get("control_state") is None
            else {
                "state": row.get("control_state"),
                "changed_at": row.get("control_changed_at"),
                "changed_by_profile_id": row.get("control_changed_by_profile_id"),
                "reason_code": row.get("control_reason_code"),
                "reason_note": row.get("control_reason_note"),
                "resume_after_message_id": row.get("resume_after_message_id"),
                "version": row.get("control_version"),
            }
        ),
        "has_active_order": row.get("has_active_order") is True,
        "active_order": (
            None
            if row.get("active_order_id") is None
            else {
                "id": row.get("active_order_id"),
                "status": row.get("active_order_status"),
                "external_order_number": row.get(
                    "active_order_external_order_number"
                ),
                "product_name_snapshot": row.get("active_order_product_name"),
                "version": row.get("active_order_version"),
                "updated_at": row.get("active_order_updated_at"),
            }
        ),
        "active_return_issue": (
            None
            if row.get("active_return_issue_id") is None
            else {
                "id": row.get("active_return_issue_id"),
                "issue_type": row.get("active_return_issue_type"),
                "status": row.get("active_return_issue_status"),
                "version": row.get("active_return_issue_version"),
                "updated_at": row.get("active_return_issue_updated_at"),
            }
        ),
        "open_unanswered": (
            None
            if row.get("open_unanswered_group_id") is None
            else {
                "id": row.get("open_unanswered_group_id"),
                "question": row.get("open_unanswered_question"),
                "occurrence_count": row.get("open_unanswered_occurrence_count"),
                "last_seen_at": row.get("open_unanswered_last_seen_at"),
                "version": row.get("open_unanswered_version"),
            }
        ),
        "needs_attention": row.get("needs_attention") is True,
        "attention_reason": row.get("attention_reason"),
    }


def _present_dashboard_task(row: dict[str, Any]) -> dict[str, Any]:
    customer_id = row.get("customer_id")
    return {
        "id": row.get("task_id"),
        "type": row.get("task_type"),
        "priority": row.get("priority"),
        "customer": (
            None
            if customer_id is None
            else {
                "id": customer_id,
                "name": row.get("customer_name"),
                "whatsapp_number": row.get("whatsapp_number"),
            }
        ),
        "title": row.get("title"),
        "summary": row.get("summary"),
        "related_entity_id": row.get("related_entity_id"),
        "entity_version": row.get("entity_version"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "action_target": row.get("action_target"),
    }


def list_conversations_cursor(
    seller_id: int,
    *,
    attention_only: bool = False,
    control_state: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
) -> dict[str, Any]:
    if control_state is not None and control_state not in VALID_CONTROL_STATES:
        return _failure(
            "seller_cursor_validation_error",
            "control_state değeri geçersiz.",
            kind="validation",
        )
    filters = {
        "attention_only": attention_only,
        "control_state": control_state,
    }
    position, error = _decode(cursor, _QUEUE_CONVERSATIONS, filters)
    if error:
        return error
    result = list_conversation_cursor_records(
        seller_id,
        attention_only=attention_only,
        control_state=control_state,
        limit=limit,
        position=position,
    )
    if result.get("durum") != "başarılı":
        return _map_repository_failure(
            result,
            code="seller_conversation_cursor_unavailable",
            message="Konuşma listesine şu anda erişilemiyor.",
        )
    items = result.get("items")
    if not isinstance(items, list):
        return _failure(
            "seller_conversation_cursor_unavailable",
            "Konuşma listesine şu anda erişilemiyor.",
            kind="unavailable",
        )
    return _page_response(
        queue=_QUEUE_CONVERSATIONS,
        filters=filters,
        limit=limit,
        has_more=result.get("has_more") is True,
        next_position=result.get("next_position"),
        item_key="conversations",
        items=[_present_conversation(row) for row in items],
        extra={
            "attention_only": attention_only,
            "control_state": control_state,
        },
    )


def list_dashboard_tasks_cursor(
    seller_id: int,
    *,
    task_type: str | None = None,
    limit: int = 50,
    cursor: str | None = None,
) -> dict[str, Any]:
    if task_type is not None and task_type not in {
        "return_review",
        "order_review",
        "unanswered_question",
    }:
        return _failure(
            "seller_cursor_validation_error",
            "type değeri geçersiz.",
            kind="validation",
        )
    filters = {"type": task_type}
    position, error = _decode(cursor, _QUEUE_DASHBOARD, filters)
    if error:
        return error
    result = list_dashboard_cursor_records(
        seller_id,
        task_type=task_type,
        limit=limit,
        position=position,
    )
    if result.get("durum") != "başarılı":
        return _map_repository_failure(
            result,
            code="seller_dashboard_cursor_unavailable",
            message="İlgilenmeniz gerekenler şu anda okunamıyor.",
        )
    items = result.get("items")
    if not isinstance(items, list):
        return _failure(
            "seller_dashboard_cursor_unavailable",
            "İlgilenmeniz gerekenler şu anda okunamıyor.",
            kind="unavailable",
        )
    return _page_response(
        queue=_QUEUE_DASHBOARD,
        filters=filters,
        limit=limit,
        has_more=result.get("has_more") is True,
        next_position=result.get("next_position"),
        item_key="tasks",
        items=[_present_dashboard_task(row) for row in items],
        extra={"type": task_type},
    )


def _present_order_summary(order: dict[str, Any]) -> dict[str, Any]:
    status_value = order.get("status")
    return {
        "id": order.get("id"),
        "external_order_number": order.get("external_order_number"),
        "product_id": order.get("product_id"),
        "product_name_snapshot": order.get("product_name_snapshot"),
        "customer_id": order.get("customer_id"),
        "customer_phone_snapshot": order.get("customer_phone_snapshot"),
        "status": status_value,
        "display_status": ORDER_DISPLAY_STATUS.get(
            status_value,
            status_value or "Bilinmiyor",
        ),
        "image_message_id": order.get("image_message_id"),
        "has_image": order.get("image_message_id") is not None,
        "custom_text": order.get("custom_text"),
        "review_reason_code": order.get("review_reason_code"),
        "review_reason_note": order.get("review_reason_note"),
        "version": order.get("version"),
        "created_at": order.get("created_at"),
        "updated_at": order.get("updated_at"),
        "completed_at": order.get("completed_at"),
        "seller_action_required": (
            status_value == ORDER_STATUS_SELLER_REVIEW_REQUIRED
        ),
    }


def list_orders_cursor(
    seller_id: int,
    *,
    view: str = "all",
    status: str | None = None,
    product_id: int | None = None,
    image_missing: bool | None = None,
    customer_id: int | None = None,
    external_order_number: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
) -> dict[str, Any]:
    if view not in {"action_required", "collecting", "all"}:
        return _failure(
            "seller_cursor_validation_error",
            "view değeri geçersiz.",
            kind="validation",
        )
    if status is not None and status not in VALID_ORDER_STATUSES:
        return _failure(
            "seller_cursor_validation_error",
            "Sipariş durumu geçersiz.",
            kind="validation",
        )
    filters = {
        "view": view,
        "status": status,
        "product_id": product_id,
        "image_missing": image_missing,
        "customer_id": customer_id,
        "external_order_number": external_order_number,
    }
    position, error = _decode(cursor, _QUEUE_ORDERS, filters)
    if error:
        return error
    result = list_order_cursor_records(
        seller_id,
        view=view,
        status=status,
        product_id=product_id,
        image_missing=image_missing,
        customer_id=customer_id,
        external_order_number=external_order_number,
        limit=limit,
        position=position,
    )
    if result.get("durum") != "başarılı":
        return _map_repository_failure(
            result,
            code="seller_order_cursor_unavailable",
            message="Siparişler okunamadı.",
        )
    rows = result.get("orders")
    if not isinstance(rows, list):
        return _failure(
            "seller_order_cursor_unavailable",
            "Siparişler okunamadı.",
            kind="unavailable",
        )
    return _page_response(
        queue=_QUEUE_ORDERS,
        filters=filters,
        limit=limit,
        has_more=result.get("has_more") is True,
        next_position=result.get("next_position"),
        item_key="orders",
        items=[_present_order_summary(row) for row in rows],
        extra={"view": view},
    )


def list_return_issues_cursor(
    seller_id: int,
    *,
    view: str = "all",
    customer_id: int | None = None,
    issue_type: str | None = None,
    external_order_number: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
) -> dict[str, Any]:
    if view not in {"action_required", "collecting", "handled", "all"}:
        return _failure(
            "seller_cursor_validation_error",
            "view değeri geçersiz.",
            kind="validation",
        )
    if issue_type is not None and issue_type not in RETURN_ISSUE_TYPES:
        return _failure(
            "seller_cursor_validation_error",
            "İade/sorun tipi geçersiz.",
            kind="validation",
        )
    filters = {
        "view": view,
        "customer_id": customer_id,
        "issue_type": issue_type,
        "external_order_number": external_order_number,
    }
    position, error = _decode(cursor, _QUEUE_RETURNS, filters)
    if error:
        return error
    result = list_return_cursor_records(
        seller_id,
        view=view,
        customer_id=customer_id,
        issue_type=issue_type,
        external_order_number=external_order_number,
        limit=limit,
        position=position,
    )
    if result.get("durum") != "başarılı":
        return _map_repository_failure(
            result,
            code="seller_return_cursor_unavailable",
            message="İade/sorun talepleri okunamadı.",
        )
    rows = result.get("requests")
    if not isinstance(rows, list):
        return _failure(
            "seller_return_cursor_unavailable",
            "İade/sorun talepleri okunamadı.",
            kind="unavailable",
        )

    unique_ids: list[int] = []
    seen: set[int] = set()
    for row in rows:
        customer = row.get("customer_id") if isinstance(row, dict) else None
        if (
            isinstance(customer, int)
            and not isinstance(customer, bool)
            and customer > 0
            and customer not in seen
        ):
            seen.add(customer)
            unique_ids.append(customer)

    phone_by_id: dict[int, Any] = {}
    if unique_ids:
        customers = get_customers_by_ids(seller_id, unique_ids)
        if customers.get("durum") != "başarılı":
            return _failure(
                "seller_return_cursor_unavailable",
                "İade/sorun talepleri okunamadı.",
                kind="unavailable",
            )
        for customer in customers.get("customers") or []:
            found_id = customer.get("id") if isinstance(customer, dict) else None
            if (
                isinstance(found_id, int)
                and not isinstance(found_id, bool)
                and found_id > 0
            ):
                phone_by_id[found_id] = customer.get("whatsapp_number")

    presented = [
        {
            **row,
            "customer_phone": phone_by_id.get(row.get("customer_id")),
            "display_issue_type": ISSUE_TYPE_DISPLAY_NAMES.get(
                row.get("issue_type"),
                row.get("issue_type"),
            ),
            "seller_action_required": (
                row.get("status") == "SELLER_REVIEW_REQUIRED"
            ),
        }
        for row in rows
    ]
    return _page_response(
        queue=_QUEUE_RETURNS,
        filters=filters,
        limit=limit,
        has_more=result.get("has_more") is True,
        next_position=result.get("next_position"),
        item_key="requests",
        items=presented,
        extra={"view": view},
    )


def list_unanswered_cursor(
    seller_id: int,
    *,
    view: str = "all",
    limit: int = 20,
    cursor: str | None = None,
) -> dict[str, Any]:
    if view not in {"action_required", "answered", "dismissed", "all"}:
        return _failure(
            "seller_cursor_validation_error",
            "view değeri geçersiz.",
            kind="validation",
        )
    filters = {"view": view}
    position, error = _decode(cursor, _QUEUE_UNANSWERED, filters)
    if error:
        return error
    result = list_unanswered_cursor_records(
        seller_id,
        view=view,
        limit=limit,
        position=position,
    )
    if result.get("durum") != "başarılı":
        return _map_repository_failure(
            result,
            code="seller_unanswered_cursor_unavailable",
            message="Cevaplanamayan sorular okunamadı.",
        )
    groups = result.get("groups")
    if not isinstance(groups, list):
        return _failure(
            "seller_unanswered_cursor_unavailable",
            "Cevaplanamayan sorular okunamadı.",
            kind="unavailable",
        )
    return _page_response(
        queue=_QUEUE_UNANSWERED,
        filters=filters,
        limit=limit,
        has_more=result.get("has_more") is True,
        next_position=result.get("next_position"),
        item_key="questions",
        items=[present_group_summary(group) for group in groups],
        extra={"view": view},
    )

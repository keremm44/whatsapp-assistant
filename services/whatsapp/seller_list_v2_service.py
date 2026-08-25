"""Seller list v2 — signed, seller-bound cursor pagination.

Implements the v2 list surface specified in CURSOR_HARDENING_REMAINING.md:

    GET /seller/orders/v2
    GET /seller/return-issue-requests/v2
    GET /seller/unanswered-questions/v2
    GET /seller/conversations/v2

Rules:
    - Legacy offset endpoints and the /seller/v2/* cursor queues stay
      untouched (backward compatible).
    - Cursors are HMAC-signed and bound to the seller id, the queue, and
      the filter context. Any mismatch (other tenant, other endpoint,
      other filters, tampering) is fail-closed with a 422.
    - Responses are exactly {items, has_more, next_cursor}.
    - limit is bounded 1..100; there is no offset parameter.
    - Item shapes mirror the legacy list presentations so frontend rows
      keep working unchanged.
"""
from __future__ import annotations

from typing import Any

from cursor_queue_repository import (
    list_conversation_cursor_records,
    list_order_cursor_records,
    list_return_cursor_records,
    list_unanswered_cursor_records,
)
from database import (
    ORDER_STATUS_SELLER_REVIEW_REQUIRED,
    RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED,
    RETURN_ISSUE_TYPES,
    VALID_CONTROL_STATES,
    VALID_ORDER_STATUSES,
    get_customers_by_ids,
)
from order_service import present_order_summary
from pagination import (
    SellerListCursorError,
    decode_seller_list_cursor,
    encode_seller_list_cursor,
)
from return_issue_service import ISSUE_TYPE_DISPLAY_NAMES
from unanswered_question_service import present_group_summary


# Stable queue names — cursors are bound to these; do not rename.
QUEUE_ORDERS = "seller_list_orders_v2"
QUEUE_RETURNS = "seller_list_returns_v2"
QUEUE_UNANSWERED = "seller_list_unanswered_v2"
QUEUE_CONVERSATIONS = "seller_list_conversations_v2"

# Safe projections (no select("*") on the v2 surface).
ORDERS_COLUMNS = (
    "id,seller_id,customer_id,product_id,product_name_snapshot,"
    "external_order_number,customer_phone_snapshot,image_message_id,"
    "custom_text,status,review_reason_code,review_reason_note,version,"
    "created_at,updated_at,completed_at"
)
RETURNS_COLUMNS = (
    "id,customer_id,order_id,issue_type,external_order_number_snapshot,"
    "product_name_snapshot,reason_text,requested_quantity,"
    "min_quantity_snapshot,max_quantity_snapshot,quantity_limit_direction,"
    "image_requirement_snapshot,status,review_reason_code,review_note,"
    "review_required_at,handled_at,seller_note,version,created_at,updated_at"
)
UNANSWERED_COLUMNS = (
    "id,canonical_question,status,answer_text,occurrence_count,"
    "first_seen_at,last_seen_at,version"
)


def _failure(code: str, message: str, *, kind: str) -> dict[str, Any]:
    return {
        "ok": False,
        "kind": kind,
        "error": {"code": code, "message": message},
    }


def _cursor_invalid(message: str) -> dict[str, Any]:
    return _failure("seller_list_v2_cursor_invalid", message, kind="validation")


def _validation(message: str) -> dict[str, Any]:
    return _failure("seller_list_v2_validation_error", message, kind="validation")


def _unavailable(code: str, message: str) -> dict[str, Any]:
    return _failure(code, message, kind="unavailable")


def _decode(
    cursor: str | None,
    *,
    seller_id: int,
    queue: str,
    filters: dict[str, Any],
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    if cursor is None:
        return None, None
    try:
        return (
            decode_seller_list_cursor(
                cursor,
                seller_id=seller_id,
                queue=queue,
                filters=filters,
            ),
            None,
        )
    except SellerListCursorError as exc:
        return None, _cursor_invalid(str(exc))


def _page_response(
    *,
    seller_id: int,
    queue: str,
    filters: dict[str, Any],
    items: list[dict[str, Any]],
    has_more: bool,
    next_position: dict[str, Any] | None,
) -> dict[str, Any]:
    if has_more and not next_position:
        return _unavailable(
            "seller_list_v2_page_unavailable",
            "Sonraki cursor üretilemedi.",
        )
    next_cursor: str | None = None
    if has_more and next_position:
        try:
            next_cursor = encode_seller_list_cursor(
                seller_id=seller_id,
                queue=queue,
                filters=filters,
                position=next_position,
            )
        except SellerListCursorError:
            return _unavailable(
                "seller_list_v2_page_unavailable",
                "Sonraki cursor üretilemedi.",
            )
    return {
        "ok": True,
        "items": items,
        "has_more": has_more,
        "next_cursor": next_cursor,
    }


def _repo_items(
    result: dict[str, Any],
    key: str,
) -> list[dict[str, Any]] | None:
    items = result.get(key)
    if not isinstance(items, list):
        return None
    return [row for row in items if isinstance(row, dict)]


# =====================================================
# ORDERS
# =====================================================


def list_orders_v2(
    seller_id: int,
    *,
    view: str,
    status: str | None = None,
    product_id: int | None = None,
    image_missing: bool | None = None,
    customer_id: int | None = None,
    external_order_number: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
) -> dict[str, Any]:
    if status is not None and status not in VALID_ORDER_STATUSES:
        return _validation(f"Geçersiz sipariş durumu: {status}")
    filters = {
        "view": view,
        "status": status,
        "product_id": product_id,
        "image_missing": image_missing,
        "customer_id": customer_id,
        "external_order_number": external_order_number,
    }
    position, error = _decode(
        cursor,
        seller_id=seller_id,
        queue=QUEUE_ORDERS,
        filters=filters,
    )
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
        columns=ORDERS_COLUMNS,
    )
    if result.get("durum") != "başarılı":
        return _unavailable(
            "seller_list_v2_orders_unavailable",
            result.get("mesaj") or "Siparişler okunamadı.",
        )
    items = _repo_items(result, "orders")
    if items is None:
        return _unavailable(
            "seller_list_v2_orders_unavailable",
            "Siparişler okunamadı.",
        )
    return _page_response(
        seller_id=seller_id,
        queue=QUEUE_ORDERS,
        filters=filters,
        items=[present_order_summary(order) for order in items],
        has_more=result.get("has_more") is True,
        next_position=result.get("next_position"),
    )


# =====================================================
# RETURN ISSUE REQUESTS
# =====================================================


def _present_return_rows(
    seller_id: int,
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]] | dict[str, Any]:
    unique_customer_ids: list[int] = []
    seen: set[int] = set()
    for row in rows:
        row_customer_id = row.get("customer_id")
        if (
            isinstance(row_customer_id, int)
            and not isinstance(row_customer_id, bool)
            and row_customer_id > 0
            and row_customer_id not in seen
        ):
            seen.add(row_customer_id)
            unique_customer_ids.append(row_customer_id)

    phone_by_customer_id: dict[int, Any] = {}
    if unique_customer_ids:
        customers_result = get_customers_by_ids(seller_id, unique_customer_ids)
        if customers_result.get("durum") != "başarılı":
            return customers_result
        for customer in customers_result.get("customers") or []:
            if isinstance(customer, dict):
                found_id = customer.get("id")
                if isinstance(found_id, int) and not isinstance(found_id, bool):
                    phone_by_customer_id[found_id] = customer.get(
                        "whatsapp_number"
                    )

    return [
        {
            **row,
            "customer_phone": phone_by_customer_id.get(row.get("customer_id")),
            "display_issue_type": ISSUE_TYPE_DISPLAY_NAMES.get(
                row.get("issue_type"), row.get("issue_type")
            ),
            "seller_action_required": (
                row.get("status") == RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED
            ),
        }
        for row in rows
    ]


def list_returns_v2(
    seller_id: int,
    *,
    view: str,
    customer_id: int | None = None,
    issue_type: str | None = None,
    external_order_number: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
) -> dict[str, Any]:
    if issue_type is not None and issue_type not in RETURN_ISSUE_TYPES:
        return _validation(f"Geçersiz iade/sorun tipi: {issue_type}")
    filters = {
        "view": view,
        "customer_id": customer_id,
        "issue_type": issue_type,
        "external_order_number": external_order_number,
    }
    position, error = _decode(
        cursor,
        seller_id=seller_id,
        queue=QUEUE_RETURNS,
        filters=filters,
    )
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
        columns=RETURNS_COLUMNS,
    )
    if result.get("durum") != "başarılı":
        return _unavailable(
            "seller_list_v2_returns_unavailable",
            result.get("mesaj") or "İade/sorun talepleri okunamadı.",
        )
    rows = _repo_items(result, "requests")
    if rows is None:
        return _unavailable(
            "seller_list_v2_returns_unavailable",
            "İade/sorun talepleri okunamadı.",
        )
    presented = _present_return_rows(seller_id, rows)
    if isinstance(presented, dict):
        return _unavailable(
            "seller_list_v2_returns_unavailable",
            "İade/sorun talepleri okunamadı.",
        )
    return _page_response(
        seller_id=seller_id,
        queue=QUEUE_RETURNS,
        filters=filters,
        items=presented,
        has_more=result.get("has_more") is True,
        next_position=result.get("next_position"),
    )


# =====================================================
# UNANSWERED QUESTIONS
# =====================================================


def list_unanswered_v2(
    seller_id: int,
    *,
    view: str,
    limit: int = 20,
    cursor: str | None = None,
) -> dict[str, Any]:
    filters = {"view": view}
    position, error = _decode(
        cursor,
        seller_id=seller_id,
        queue=QUEUE_UNANSWERED,
        filters=filters,
    )
    if error:
        return error
    result = list_unanswered_cursor_records(
        seller_id,
        view=view,
        limit=limit,
        position=position,
        columns=UNANSWERED_COLUMNS,
    )
    if result.get("durum") != "başarılı":
        return _unavailable(
            "seller_list_v2_unanswered_unavailable",
            result.get("mesaj") or "Cevaplanamayan sorular okunamadı.",
        )
    groups = _repo_items(result, "groups")
    if groups is None:
        return _unavailable(
            "seller_list_v2_unanswered_unavailable",
            "Cevaplanamayan sorular okunamadı.",
        )
    return _page_response(
        seller_id=seller_id,
        queue=QUEUE_UNANSWERED,
        filters=filters,
        items=[present_group_summary(group) for group in groups],
        has_more=result.get("has_more") is True,
        next_position=result.get("next_position"),
    )


# =====================================================
# CONVERSATIONS
# =====================================================


def _present_conversation_row(row: dict[str, Any]) -> dict[str, Any]:
    customer_id = row.get("customer_id")
    active_order_id = row.get("active_order_id")
    active_order_status = row.get("active_order_status")
    active_return_id = row.get("active_return_issue_id")
    active_return_status = row.get("active_return_issue_status")
    return {
        "customer": {
            "id": customer_id,
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
        "active_order": (
            None
            if active_order_id is None
            else {
                "id": active_order_id,
                "customer_id": customer_id,
                "status": active_order_status,
                "external_order_number": row.get(
                    "active_order_external_order_number"
                ),
                "product_name_snapshot": row.get(
                    "active_order_product_name"
                ),
                "version": row.get("active_order_version"),
                "updated_at": row.get("active_order_updated_at"),
                "seller_action_required": (
                    active_order_status == ORDER_STATUS_SELLER_REVIEW_REQUIRED
                ),
            }
        ),
        "active_return_issue": (
            None
            if active_return_id is None
            else {
                "id": active_return_id,
                "customer_id": customer_id,
                "issue_type": row.get("active_return_issue_type"),
                "status": active_return_status,
                "version": row.get("active_return_issue_version"),
                "updated_at": row.get("active_return_issue_updated_at"),
                "seller_action_required": (
                    active_return_status
                    == RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED
                ),
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
                "seller_action_required": True,
            }
        ),
        "needs_attention": row.get("needs_attention") is True,
        "attention_reason": row.get("attention_reason"),
    }


def list_conversations_v2(
    seller_id: int,
    *,
    attention_only: bool = False,
    control_state: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
) -> dict[str, Any]:
    if control_state is not None and control_state not in VALID_CONTROL_STATES:
        return _validation("control_state değeri geçersiz.")
    filters = {
        "attention_only": attention_only,
        "control_state": control_state,
    }
    position, error = _decode(
        cursor,
        seller_id=seller_id,
        queue=QUEUE_CONVERSATIONS,
        filters=filters,
    )
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
        return _unavailable(
            "seller_list_v2_conversations_unavailable",
            result.get("mesaj") or "Konuşma listesine şu anda erişilemiyor.",
        )
    rows = _repo_items(result, "items")
    if rows is None:
        return _unavailable(
            "seller_list_v2_conversations_unavailable",
            "Konuşma listesine şu anda erişilemiyor.",
        )
    return _page_response(
        seller_id=seller_id,
        queue=QUEUE_CONVERSATIONS,
        filters=filters,
        items=[_present_conversation_row(row) for row in rows],
        has_more=result.get("has_more") is True,
        next_position=result.get("next_position"),
    )

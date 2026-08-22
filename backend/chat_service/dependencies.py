"""External collaborators for the chat orchestration package.

Keeping these names in one module preserves the historical ``chat_service``
monkeypatch surface while allowing orchestration code to live in focused files.
"""

from __future__ import annotations

from typing import Any

from ai_engine import classify_intent, intent_is_safe
from database import (
    CONTROL_STATE_ASSISTANT_ACTIVE,
    CONTROL_STATE_ASSISTANT_PAUSED,
    CONTROL_STATE_RETURN_REVIEW,
    CONTROL_STATE_SELLER_TAKEN_OVER,
    block_customer,
    check_message_duplicate as _database_check_message_duplicate,
    count_recent_violations,
    create_seller_notification,
    get_active_rules,
    get_conversation_control,
    get_or_create_customer,
    get_seller_by_id,
    get_state,
    increment_rule_hit_count,
    is_customer_muted,
    mute_customer,
    persist_guarded_auto_reply as _database_persist_guarded_auto_reply,
    record_violation,
    save_message as _database_save_message,
    transition_conversation_control,
    transition_state,
)
from database.whatsapp_message_bridge import save_whatsapp_pending_outgoing_message
from order_service import (
    build_product_selection_question as order_build_product_selection_question,
    get_next_collection_step as order_get_next_collection_step,
    get_or_create_order,
    initialize_collection as order_initialize_collection,
    list_active_order_products as order_list_active_products,
    match_order_product_selection as order_match_product_selection,
    parse_collection_field_answer as order_parse_collection_field_answer,
    record_field_value as order_record_field_value,
    resolve_new_order_product_decision as order_resolve_new_order_product,
    set_order_product as order_set_order_product,
    update_core as order_update_core,
    update_core_from_message as order_update_core_from_message,
)
from quantity_limit_service import handle_quantity_message
from return_issue_repository import get_active_collectable_return_issue_request
from return_issue_service import process_customer_issue_message as return_issue_process_message
from unanswered_question_service import (
    find_saved_answer as unanswered_find_saved_answer,
    record_question as unanswered_record_question,
)

from .transport_context import (
    WHATSAPP_PENDING_OUTGOING_PROVIDER,
    current_incoming_message_id,
    current_outgoing_provider,
    record_incoming_message_id,
    record_outgoing_message_id,
)


def _message_id_from_result(result: dict[str, Any]) -> int | None:
    message = result.get("message")
    if not isinstance(message, dict):
        return None
    message_id = message.get("id")
    if (
        isinstance(message_id, int)
        and not isinstance(message_id, bool)
        and message_id > 0
    ):
        return message_id
    return None


def save_message(
    seller_id: int,
    customer_id: int,
    direction: str,
    content: str | None,
    message_type: str = "text",
    media_url: str | None = None,
    was_auto_replied: bool = False,
    ai_confidence: float | None = None,
    provider: str = "internal",
    provider_message_id: str | None = None,
    source_message_id: int | None = None,
    expected_control_version: int | None = None,
) -> dict[str, Any]:
    """Preserve legacy persistence and guard auto-reply writes when requested.

    Guarded outgoing writes are serialized in PostgreSQL with seller takeover
    and resume operations. Calls that do not supply the guard pair keep the
    historical persistence behavior for compatibility and non-auto-reply uses.
    """
    whatsapp_scope = (
        current_outgoing_provider() == WHATSAPP_PENDING_OUTGOING_PROVIDER
    )

    has_source_guard = source_message_id is not None
    has_version_guard = expected_control_version is not None
    if direction == "outgoing" and has_source_guard != has_version_guard:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Otomatik yanıt guard bilgileri birlikte gönderilmelidir.",
        }

    if direction == "outgoing" and has_source_guard and has_version_guard:
        guarded_provider = (
            WHATSAPP_PENDING_OUTGOING_PROVIDER if whatsapp_scope else provider
        )
        if whatsapp_scope:
            scoped_source_message_id = current_incoming_message_id()
            if scoped_source_message_id != source_message_id:
                return {
                    "durum": "hata",
                    "mesaj": "WhatsApp reply kaynak mesaj bağlamı doğrulanamadı.",
                }

        result = _database_persist_guarded_auto_reply(
            seller_id=seller_id,
            customer_id=customer_id,
            source_message_id=source_message_id,
            expected_control_version=expected_control_version,
            content=content,
            message_type=message_type,
            media_url=media_url,
            ai_confidence=ai_confidence,
            provider=guarded_provider,
        )
        outgoing_message_id = _message_id_from_result(result)
        if whatsapp_scope and outgoing_message_id is not None:
            record_outgoing_message_id(outgoing_message_id)
        return result

    if direction == "outgoing" and whatsapp_scope:
        source_message_id = current_incoming_message_id()
        if source_message_id is None:
            return {
                "durum": "hata",
                "mesaj": "WhatsApp reply için kaynak inbound mesaj kimliği bulunamadı.",
            }
        result = save_whatsapp_pending_outgoing_message(
            seller_id=seller_id,
            customer_id=customer_id,
            source_message_id=source_message_id,
            content=content,
            message_type=message_type,
            media_url=media_url,
            was_auto_replied=was_auto_replied,
            ai_confidence=ai_confidence,
        )
        outgoing_message_id = _message_id_from_result(result)
        if outgoing_message_id is not None:
            record_outgoing_message_id(outgoing_message_id)
        return result

    result = _database_save_message(
        seller_id=seller_id,
        customer_id=customer_id,
        direction=direction,
        content=content,
        message_type=message_type,
        media_url=media_url,
        was_auto_replied=was_auto_replied,
        ai_confidence=ai_confidence,
        provider=provider,
        provider_message_id=provider_message_id,
    )

    if direction != "incoming" or not whatsapp_scope:
        return result

    incoming_message_id = _message_id_from_result(result)
    if incoming_message_id is None and result.get("durum") == "duplicate":
        duplicate = _database_check_message_duplicate(
            provider=provider,
            provider_message_id=provider_message_id,
        )
        if duplicate.get("durum") == "başarılı" and duplicate.get("duplicate"):
            existing = duplicate.get("message")
            if isinstance(existing, dict):
                result = dict(result)
                result["message"] = existing
                incoming_message_id = _message_id_from_result(result)

    if incoming_message_id is not None:
        record_incoming_message_id(incoming_message_id)
    return result

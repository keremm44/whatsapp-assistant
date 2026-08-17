"""External collaborators for the chat orchestration package.

Keeping these names in one module preserves the historical ``chat_service``
monkeypatch surface while allowing orchestration code to live in focused files.
"""

from ai_engine import classify_intent, intent_is_safe
from database import (
    CONTROL_STATE_ASSISTANT_ACTIVE,
    CONTROL_STATE_ASSISTANT_PAUSED,
    CONTROL_STATE_RETURN_REVIEW,
    CONTROL_STATE_SELLER_TAKEN_OVER,
    block_customer,
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
    record_violation,
    save_message,
    transition_conversation_control,
    transition_state,
)
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

from __future__ import annotations

import pytest


pytestmark = pytest.mark.integration_v2


def test_seller_panel_read_models_are_tenant_scoped(integration_context) -> None:
    ctx = integration_context
    primary = ctx.tenant("primary")
    secondary = ctx.tenant("secondary")

    message = ctx.new_message(
        content="Panel read model integration question",
    )

    ctx.client.rpc(
        "record_unanswered_question_occurrence",
        {
            "target_seller_id": primary.seller_id,
            "target_customer_id": primary.customer_id,
            "source_message_id": message["id"],
            "question_text_value": "Panel read model integration question",
            "category_value": "unclear",
            "suggested_field_value": None,
            "metadata_value": {"integration_v2": True},
        },
    ).execute()

    list_result = ctx.client.rpc(
        "get_seller_conversation_list",
        {
            "target_seller_id": primary.seller_id,
            "result_limit": 20,
            "result_offset": 0,
            "attention_only": True,
        },
    ).execute().data

    assert list_result["status"] == "success"
    assert list_result["total"] == 1
    assert len(list_result["conversations"]) == 1
    conversation = list_result["conversations"][0]
    assert conversation["customer"]["id"] == primary.customer_id
    assert conversation["last_message"]["id"] == message["id"]
    assert conversation["needs_attention"] is True
    assert conversation["attention_reason"] == "unanswered_question"

    detail = ctx.client.rpc(
        "get_seller_conversation_detail",
        {
            "target_seller_id": primary.seller_id,
            "target_customer_id": primary.customer_id,
            "message_limit": 50,
            "before_message_id": None,
            "control_history_limit": 20,
        },
    ).execute().data

    assert detail["status"] == "success"
    assert detail["customer"]["id"] == primary.customer_id
    assert detail["messages"][-1]["id"] == message["id"]
    assert detail["open_unanswered"][0]["question"] == "Panel read model integration question"

    tasks = ctx.client.rpc(
        "get_seller_dashboard_tasks",
        {
            "target_seller_id": primary.seller_id,
            "task_type_value": "unanswered_question",
            "result_limit": 50,
            "result_offset": 0,
        },
    ).execute().data

    assert tasks["status"] == "success"
    assert tasks["total"] == 1
    assert tasks["tasks"][0]["type"] == "unanswered_question"
    assert tasks["tasks"][0]["customer"]["id"] == primary.customer_id

    cross_tenant = ctx.client.rpc(
        "get_seller_conversation_detail",
        {
            "target_seller_id": secondary.seller_id,
            "target_customer_id": primary.customer_id,
            "message_limit": 50,
            "before_message_id": None,
            "control_history_limit": 20,
        },
    ).execute().data

    assert cross_tenant == {"status": "not_found"}

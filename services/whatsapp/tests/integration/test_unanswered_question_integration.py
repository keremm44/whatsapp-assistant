from __future__ import annotations

import pytest

from database import get_conversation_control, get_state
from unanswered_question_service import (
    find_saved_answer,
    record_question,
    set_seller_answer,
)


pytestmark = [pytest.mark.integration, pytest.mark.integration_v2]


def test_grouping_idempotency_future_answer_and_no_historical_replay(integration_context) -> None:
    ctx = integration_context
    primary = ctx.tenant("primary")

    outgoing_before = ctx.count_rows(
        "messages",
        seller_id=primary.seller_id,
        customer_id=primary.customer_id,
        direction="outgoing",
    )

    first_message = ctx.new_message(content="Bu ürün fırında kullanılabilir mi?")
    first = record_question(
        primary.seller_id,
        primary.customer_id,
        int(first_message["id"]),
        first_message["content"],
        category="material_question",
        reason="integration_v2",
    )
    assert first["durum"] == "başarılı"
    assert first["answer_available"] is False
    assert first["created"] is True
    group = first["group"]
    group_id = int(group["id"])
    assert int(group["occurrence_count"]) == 1

    duplicate = record_question(
        primary.seller_id,
        primary.customer_id,
        int(first_message["id"]),
        first_message["content"],
        category="material_question",
        reason="integration_v2",
    )
    assert duplicate["durum"] == "başarılı"
    assert duplicate["idempotent"] is True
    assert int(duplicate["group"]["occurrence_count"]) == 1

    same_group_message = ctx.new_message(content="BU ÜRÜN FIRINDA KULLANILABİLİR Mİ!!!")
    same_group = record_question(
        primary.seller_id,
        primary.customer_id,
        int(same_group_message["id"]),
        same_group_message["content"],
        category="material_question",
        reason="integration_v2",
    )
    assert same_group["durum"] == "başarılı"
    assert int(same_group["group"]["id"]) == group_id
    assert int(same_group["group"]["occurrence_count"]) == 2

    answered = set_seller_answer(
        primary.seller_id,
        group_id,
        primary.profile_id,
        int(same_group["group"]["version"]),
        "Hayır, fırında kullanılması önerilmez.",
    )
    assert answered["durum"] == "başarılı"
    assert answered["group"]["status"] == "ANSWERED"

    outgoing_after_answer = ctx.count_rows(
        "messages",
        seller_id=primary.seller_id,
        customer_id=primary.customer_id,
        direction="outgoing",
    )
    assert outgoing_after_answer == outgoing_before

    future_lookup = find_saved_answer(
        primary.seller_id,
        "Bu ürün fırında kullanılabilir mi?",
    )
    assert future_lookup["durum"] == "başarılı"
    assert future_lookup["matched"] is True
    assert future_lookup["answer"] == "Hayır, fırında kullanılması önerilmez."

    future_message = ctx.new_message(content="Bu ürün fırında kullanılabilir mi?")
    future_record = record_question(
        primary.seller_id,
        primary.customer_id,
        int(future_message["id"]),
        future_message["content"],
        category="material_question",
        reason="integration_v2_future",
    )
    assert future_record["durum"] == "başarılı"
    assert future_record["answer_available"] is True
    assert future_record["answer"] == "Hayır, fırında kullanılması önerilmez."

    # ANSWERED groups do not create a historical/future occurrence as a side effect.
    occurrence_rows = (
        ctx.client.table("unanswered_question_occurrences")
        .select("id")
        .eq("seller_id", primary.seller_id)
        .eq("group_id", group_id)
        .execute()
    )
    assert len(occurrence_rows.data or []) == 2

    state = get_state(primary.seller_id, primary.customer_id)
    assert state["durum"] == "başarılı"
    assert state["state"]["current_state"] == "NORMAL"

    control = get_conversation_control(primary.seller_id, primary.customer_id)
    assert control["durum"] == "başarılı"
    assert control["control"]["state"] == "ASSISTANT_ACTIVE"

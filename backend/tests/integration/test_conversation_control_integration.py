from __future__ import annotations

import pytest

from database import (
    CONTROL_STATE_ASSISTANT_ACTIVE,
    CONTROL_STATE_ASSISTANT_PAUSED,
    CONTROL_STATE_SELLER_TAKEN_OVER,
    get_conversation_control,
    get_conversation_control_history,
    resume_conversation_assistant,
    transition_conversation_control,
)


pytestmark = [pytest.mark.integration, pytest.mark.integration_v2]


def test_takeover_conflict_resume_and_tenant_isolation(integration_context) -> None:
    ctx = integration_context
    primary = ctx.tenant("primary")
    secondary = ctx.tenant("secondary")

    initial = get_conversation_control(primary.seller_id, primary.customer_id)
    assert initial["durum"] == "başarılı"
    assert initial["control"]["state"] == CONTROL_STATE_ASSISTANT_ACTIVE
    assert initial["control"]["version"] == 1

    takeover_message = ctx.new_message(
        content="Satıcı devralma integration testi",
    )
    takeover = transition_conversation_control(
        seller_id=primary.seller_id,
        customer_id=primary.customer_id,
        to_control_state=CONTROL_STATE_SELLER_TAKEN_OVER,
        reason_code="integration_takeover",
        reason_note="integration-v2",
        changed_by_profile_id=primary.profile_id,
        trigger_message_id=int(takeover_message["id"]),
        expected_version=1,
    )
    assert takeover["durum"] == "başarılı"
    assert takeover["changed"] is True
    assert takeover["control"]["state"] == CONTROL_STATE_SELLER_TAKEN_OVER
    assert takeover["control"]["version"] == 2

    stale = transition_conversation_control(
        seller_id=primary.seller_id,
        customer_id=primary.customer_id,
        to_control_state=CONTROL_STATE_ASSISTANT_PAUSED,
        reason_code="integration_stale",
        changed_by_profile_id=primary.profile_id,
        expected_version=1,
    )
    assert stale["durum"] == "çakışma"
    assert stale["control"]["version"] == 2

    resume_message = ctx.new_message(
        content="Devralma sonrası yeni müşteri mesajı",
    )
    resumed = resume_conversation_assistant(
        seller_id=primary.seller_id,
        customer_id=primary.customer_id,
        reason_code="integration_resume",
        changed_by_profile_id=primary.profile_id,
        expected_version=2,
    )
    assert resumed["durum"] == "başarılı"
    assert resumed["changed"] is True
    assert resumed["control"]["state"] == CONTROL_STATE_ASSISTANT_ACTIVE
    assert resumed["control"]["version"] == 3
    assert resumed["control"]["resume_after_message_id"] == int(resume_message["id"])

    noop = resume_conversation_assistant(
        seller_id=primary.seller_id,
        customer_id=primary.customer_id,
        reason_code="integration_resume_noop",
        changed_by_profile_id=primary.profile_id,
        expected_version=3,
    )
    assert noop["durum"] == "başarılı"
    assert noop["changed"] is False
    assert noop["control"]["version"] == 3

    history = get_conversation_control_history(
        primary.seller_id,
        primary.customer_id,
        limit=10,
    )
    assert history["durum"] == "başarılı"
    assert len(history["history"]) == 2
    assert history["history"][0]["to_state"] == CONTROL_STATE_ASSISTANT_ACTIVE
    assert history["history"][1]["to_state"] == CONTROL_STATE_SELLER_TAKEN_OVER

    cross_tenant = transition_conversation_control(
        seller_id=secondary.seller_id,
        customer_id=primary.customer_id,
        to_control_state=CONTROL_STATE_SELLER_TAKEN_OVER,
        reason_code="integration_cross_tenant",
        changed_by_profile_id=secondary.profile_id,
        expected_version=1,
    )
    assert cross_tenant["durum"] in {"bulunamadı", "reddedildi"}

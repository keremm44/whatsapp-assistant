from __future__ import annotations

import pytest

from database import (
    CONTROL_STATE_RETURN_REVIEW,
    get_conversation_control,
    get_return_issue_request_detail,
)
from return_issue_service import (
    mark_seller_return_issue_handled,
    process_customer_issue_message,
)


pytestmark = [pytest.mark.integration, pytest.mark.integration_v2]


def test_urgent_issue_enters_review_and_handled_does_not_resume(integration_context) -> None:
    ctx = integration_context
    primary = ctx.tenant("primary")

    initial_control = get_conversation_control(primary.seller_id, primary.customer_id)
    assert initial_control["durum"] == "başarılı"
    starting_version = int(initial_control["control"]["version"])

    urgent_message = ctx.new_message(
        content="Ürün kırık geldi ve elim yaralandı, acil yardım gerekiyor",
    )
    result = process_customer_issue_message(
        seller_id=primary.seller_id,
        customer_id=primary.customer_id,
        source_message_id=int(urgent_message["id"]),
        message_text=urgent_message["content"],
        message_type="text",
        intent="complaint",
        starting_control_version=starting_version,
    )
    assert result["durum"] == "başarılı"
    assert result["review_required"] is True
    assert result["outgoing_allowed"] is False
    request = result["request"]
    request_id = int(request["id"])
    assert request["status"] == "SELLER_REVIEW_REQUIRED"

    control_after_review = get_conversation_control(
        primary.seller_id,
        primary.customer_id,
    )
    assert control_after_review["durum"] == "başarılı"
    assert control_after_review["control"]["state"] == CONTROL_STATE_RETURN_REVIEW

    detail = get_return_issue_request_detail(primary.seller_id, request_id)
    assert detail["durum"] == "başarılı"
    request_version = int(detail["request"]["version"])

    handled = mark_seller_return_issue_handled(
        primary.seller_id,
        request_id,
        primary.profile_id,
        request_version,
        note="Integration-v2 handled",
    )
    assert handled["durum"] == "başarılı"
    assert handled["changed"] is True
    assert handled["request"]["status"] == "HANDLED"

    # Product contract: marking a request handled does not resume the assistant.
    control_after_handled = get_conversation_control(
        primary.seller_id,
        primary.customer_id,
    )
    assert control_after_handled["durum"] == "başarılı"
    assert control_after_handled["control"]["state"] == CONTROL_STATE_RETURN_REVIEW

    stale_handled = mark_seller_return_issue_handled(
        primary.seller_id,
        request_id,
        primary.profile_id,
        request_version,
        note="stale version",
    )
    assert stale_handled["durum"] == "hata"
    assert stale_handled["kind"] == "conflict"

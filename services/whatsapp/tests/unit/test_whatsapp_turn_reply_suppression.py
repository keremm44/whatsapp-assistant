from __future__ import annotations

import pytest

from chat_service import responses, transport_context


_CONTROL_CONTEXT = {"incoming_message_id": 101, "starting_control_version": 7}


def test_intermediate_turn_suppresses_outgoing_before_persistence(monkeypatch) -> None:
    monkeypatch.setattr(
        responses.deps,
        "get_conversation_control",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("control read must not run")),
    )
    monkeypatch.setattr(
        responses.deps,
        "save_message",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("outgoing write must not run")),
    )

    with transport_context.transport_scope(
        "whatsapp_cloud_pending",
        suppress_outgoing=True,
    ):
        result = responses.outgoing_response(
            seller_id=1,
            customer_id=2,
            response_text="Ara cevap",
            source="state",
            control_context=_CONTROL_CONTEXT,
        )

    assert result["durum"] == "otomatik_yanıt_yok"
    assert result["reason_code"] == "turn_buffer_intermediate_message"
    assert result["turn_intermediate"] is True


def test_intermediate_unclear_message_does_not_create_unanswered_work_item(monkeypatch) -> None:
    monkeypatch.setattr(
        responses.deps,
        "unanswered_record_question",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("work item must not run")),
    )

    with transport_context.transport_scope(
        "whatsapp_cloud_pending",
        suppress_outgoing=True,
    ):
        result = responses.escalate_question(
            seller_id=1,
            customer_id=2,
            question_text="devam ediyorum",
            source_message_id=101,
            control_context=_CONTROL_CONTEXT,
        )

    assert result["durum"] == "otomatik_yanıt_yok"
    assert result["reason_code"] == "turn_buffer_intermediate_message"


def test_turn_suppression_is_request_local_and_resets() -> None:
    assert transport_context.outgoing_suppressed_for_turn() is False
    with transport_context.transport_scope(
        "whatsapp_cloud_pending",
        suppress_outgoing=True,
    ):
        assert transport_context.outgoing_suppressed_for_turn() is True
    assert transport_context.outgoing_suppressed_for_turn() is False


def test_turn_suppression_is_rejected_for_internal_transport() -> None:
    with pytest.raises(ValueError):
        with transport_context.transport_scope("internal", suppress_outgoing=True):
            pass

from __future__ import annotations

from chat_service import orchestrator


_STATE = {
    "current_state": "AWAITING_ORDER_CONFIRMATION",
    "state_data": {
        "pending_change_kind": "custom_text",
        "order_id": 7,
        "order_version": 3,
        "external_order_number": "45892",
        "old_text": "Elif",
        "new_text": "Ayşe",
    },
}
_CONTROL = {"incoming_message_id": 101, "starting_control_version": 4}


def test_exact_confirmation_skips_ai_and_uses_db_canonical_notification(monkeypatch) -> None:
    monkeypatch.setattr(
        orchestrator.deps,
        "classify_intent",
        lambda message: (_ for _ in ()).throw(AssertionError("exact confirmation must not call AI")),
    )
    monkeypatch.setattr(
        orchestrator.order_change_confirmation,
        "apply_confirmed_custom_text_change",
        lambda **kwargs: {"durum": "başarılı", "seller_review_required": True},
    )
    monkeypatch.setattr(
        orchestrator.deps,
        "transition_state",
        lambda **kwargs: {"durum": "başarılı"},
    )
    notifications: list[dict[str, object]] = []
    monkeypatch.setattr(
        orchestrator.deps,
        "create_seller_notification",
        lambda **kwargs: notifications.append(kwargs) or {"durum": "başarılı"},
    )
    monkeypatch.setattr(
        orchestrator.responses,
        "outgoing_response",
        lambda **kwargs: {"durum": "başarılı", **kwargs},
    )

    result = orchestrator._pending_change_response(
        seller_id=1,
        customer_id=2,
        source_message_id=101,
        state=_STATE,
        user_message="onaylıyorum",
        message_type="text",
        control_context=_CONTROL,
    )

    assert result is not None and result["durum"] == "başarılı"
    assert result["ai_confidence"] is None
    assert notifications[0]["notification_type"] == "system"
    assert notifications[0]["severity"] == "warning"


def test_exact_cancel_skips_ai_and_does_not_mutate_order(monkeypatch) -> None:
    monkeypatch.setattr(
        orchestrator.deps,
        "classify_intent",
        lambda message: (_ for _ in ()).throw(AssertionError("exact cancel must not call AI")),
    )
    monkeypatch.setattr(
        orchestrator.order_change_confirmation,
        "apply_confirmed_custom_text_change",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("cancel must not mutate order")),
    )
    monkeypatch.setattr(
        orchestrator.deps,
        "transition_state",
        lambda **kwargs: {"durum": "başarılı"},
    )
    monkeypatch.setattr(
        orchestrator.responses,
        "outgoing_response",
        lambda **kwargs: {"durum": "başarılı", **kwargs},
    )

    result = orchestrator._pending_change_response(
        seller_id=1,
        customer_id=2,
        source_message_id=101,
        state=_STATE,
        user_message="iptal",
        message_type="text",
        control_context=_CONTROL,
    )
    assert result is not None and result["durum"] == "başarılı"
    assert result["ai_confidence"] is None


def test_unrecognized_confirmation_message_still_allows_critical_ai_preemption(monkeypatch) -> None:
    monkeypatch.setattr(
        orchestrator.deps,
        "classify_intent",
        lambda message: {"durum": "başarılı", "intent": "complaint", "confidence": 0.99},
    )
    monkeypatch.setattr(orchestrator.deps, "intent_is_safe", lambda result: True)
    monkeypatch.setattr(
        orchestrator.return_flow,
        "handle_return_review_intent",
        lambda **kwargs: {"durum": "return_routed", **kwargs},
    )

    result = orchestrator._pending_change_response(
        seller_id=1,
        customer_id=2,
        source_message_id=101,
        state=_STATE,
        user_message="bu arada ürün kırık geldi",
        message_type="text",
        control_context=_CONTROL,
    )
    assert result is not None and result["durum"] == "return_routed"
    assert result["intent"] == "complaint"

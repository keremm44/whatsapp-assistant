from __future__ import annotations

import chat_service
import chat_service.dependencies as dependencies
import chat_service.responses as response_module


def test_chat_service_package_preserves_legacy_import_surface() -> None:
    expected_names = (
        "sohbet_isle",
        "classify_intent",
        "intent_is_safe",
        "get_seller_by_id",
        "get_or_create_customer",
        "save_message",
        "get_conversation_control",
        "get_state",
        "transition_state",
        "outgoing_response",
        "handle_return_review_intent",
        "process_active_state",
        "order_initialize_collection",
        "order_get_next_collection_step",
        "return_issue_process_message",
        "get_active_collectable_return_issue_request",
    )

    for name in expected_names:
        assert hasattr(chat_service, name), name
        assert callable(getattr(chat_service, name)), name

    assert chat_service.CONTROL_STATE_ASSISTANT_ACTIVE == "ASSISTANT_ACTIVE"
    assert chat_service.ORDER_COLLECTION_MUTATION_STATES
    assert chat_service.GREETING_RESPONSE


def test_chat_service_dependency_monkeypatch_reaches_runtime_owner(monkeypatch) -> None:
    def fake_classifier(message: str):
        return {"durum": "başarılı", "intent": "greeting", "confidence": 1.0}

    monkeypatch.setattr(chat_service, "classify_intent", fake_classifier)

    assert dependencies.classify_intent is fake_classifier


def test_chat_service_function_monkeypatch_reaches_owner_module(monkeypatch) -> None:
    def fake_outgoing(**kwargs):
        return {"durum": "başarılı", "cevap": kwargs["response_text"]}

    monkeypatch.setattr(chat_service, "outgoing_response", fake_outgoing)

    assert response_module.outgoing_response is fake_outgoing

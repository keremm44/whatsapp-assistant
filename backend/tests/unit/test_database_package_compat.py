from __future__ import annotations

import database
import database.atomic_conversation_state as atomic_state_database
import database.atomic_customer as atomic_customer_database
import database.atomic_message_persistence as atomic_message_database
import database.orders as order_database


def test_database_package_preserves_legacy_import_surface() -> None:
    expected_names = (
        "get_supabase",
        "test_connection",
        "create_seller",
        "get_seller_by_id",
        "get_or_create_customer",
        "save_message",
        "increment_customer_message_count",
        "persist_guarded_auto_reply",
        "resolve_whatsapp_channel",
        "ensure_whatsapp_delivery_outbox",
        "claim_whatsapp_delivery_outbox",
        "apply_whatsapp_delivery_status",
        "renew_whatsapp_event_claim",
        "get_conversation_control",
        "transition_conversation_control",
        "get_state",
        "transition_state",
        "create_seller_notification",
        "get_active_rules",
        "record_unanswered_question_occurrence",
        "get_or_create_active_order",
        "list_orders",
        "create_or_get_return_issue_request",
        "list_return_issue_requests",
        "get_seller_conversation_list",
    )

    for name in expected_names:
        assert hasattr(database, name), name
        assert callable(getattr(database, name)), name

    assert database.ORDER_STATUS_COLLECTING == "COLLECTING"
    assert database.CONTROL_STATE_ASSISTANT_ACTIVE == "ASSISTANT_ACTIVE"
    assert database.UNANSWERED_STATUS_OPEN == "OPEN"
    assert database.RETURN_ISSUE_STATUS_COLLECTING == "COLLECTING"


def test_database_get_supabase_monkeypatch_reaches_submodules(monkeypatch) -> None:
    sentinel = object()
    monkeypatch.setattr(database, "get_supabase", lambda: sentinel)

    assert order_database.get_supabase() is sentinel


def test_database_function_monkeypatch_reaches_owner_module(monkeypatch) -> None:
    expected = {"durum": "bulunamadı", "mesaj": "test seam"}
    monkeypatch.setattr(
        database,
        "get_order_by_id",
        lambda seller_id, order_id: expected,
    )

    assert order_database.get_order_by_id(11, 22) == expected
    assert database.get_order_detail(11, 22) == expected


def test_customer_identity_facade_is_owned_by_atomic_module(monkeypatch) -> None:
    expected = {"durum": "mevcut", "customer": {"id": 14}}
    monkeypatch.setattr(
        database,
        "get_or_create_customer",
        lambda seller_id, whatsapp_number, name=None: expected,
    )

    assert atomic_customer_database.get_or_create_customer(2, "905551112233") == expected


def test_message_persistence_facade_is_owned_by_atomic_module(monkeypatch) -> None:
    expected = {"durum": "başarılı", "message": {"id": 91}}
    monkeypatch.setattr(
        database,
        "save_message",
        lambda seller_id, customer_id, direction, content, **kwargs: expected,
    )

    assert atomic_message_database.save_message(2, 14, "incoming", "test") == expected


def test_message_metric_legacy_helper_is_owned_by_atomic_module(monkeypatch) -> None:
    expected = {"durum": "başarılı", "customer": {"id": 14}}
    monkeypatch.setattr(
        database,
        "increment_customer_message_count",
        lambda customer_id: expected,
    )

    assert atomic_message_database.increment_customer_message_count(14) == expected


def test_flow_state_facade_is_owned_by_atomic_module(monkeypatch) -> None:
    expected = {"durum": "başarılı", "state": {"current_state": "NORMAL"}}
    monkeypatch.setattr(database, "get_state", lambda seller_id, customer_id: expected)

    assert atomic_state_database.get_state(11, 22) == expected

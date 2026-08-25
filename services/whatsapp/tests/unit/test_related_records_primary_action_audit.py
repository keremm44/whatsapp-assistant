from __future__ import annotations

from typing import Any

import pytest

import api.seller.orders as order_routes
import api.seller.returns as return_routes
import api.seller.unanswered as unanswered_routes
import seller_panel_service
import unanswered_question_service
from database import (
    ORDER_STATUS_COLLECTING,
    ORDER_STATUS_SELLER_REVIEW_REQUIRED,
)


def _context() -> Any:
    return type(
        "Ctx",
        (),
        {
            "auth_user_id": "a",
            "email": "e",
            "role": "seller",
            "profile_status": "active",
            "seller_id": 11,
            "profile": {"id": 7},
            "claims": {},
        },
    )()


def _order_result(status_value: str, *, reason_code: str | None = None) -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "order": {
            "id": 41,
            "seller_id": 11,
            "customer_id": 22,
            "product_id": 3,
            "product_name_snapshot": "Kupa",
            "external_order_number": "TR123",
            "customer_phone_snapshot": "+90555",
            "customer_note": None,
            "image_message_id": None,
            "custom_text": None,
            "status": status_value,
            "review_reason_code": reason_code,
            "review_reason_note": "note" if reason_code else None,
            "created_from_message_id": 1,
            "last_source_message_id": 1,
            "version": 4,
            "created_at": "now",
            "updated_at": "now",
            "completed_at": None,
            "closed_at": None,
        },
        "fields": [],
    }


def test_conversation_detail_enriches_active_order_with_linkage_and_primary_action(monkeypatch) -> None:
    rpc_order = {
        "id": 18,
        "status": ORDER_STATUS_SELLER_REVIEW_REQUIRED,
        "external_order_number": "TR123",
        "product_name_snapshot": "Kupa",
        "version": 5,
        "updated_at": "2026-08-10T12:00:00+00:00",
    }
    rpc_return = {
        "id": 41,
        "issue_type": "DAMAGED_ITEM",
        "status": "SELLER_REVIEW_REQUIRED",
        "version": 3,
        "updated_at": "2026-08-10T12:00:00+00:00",
        "order_id": 18,
    }
    rpc_open = [
        {
            "id": 61,
            "question": "Kargoya ne zaman verilir?",
            "occurrence_count": 2,
            "last_seen_at": "2026-08-10T11:58:00+00:00",
            "version": 2,
            "first_seen_at": "2026-08-09T09:00:00+00:00",
        }
    ]
    monkeypatch.setattr(
        seller_panel_service,
        "get_seller_conversation_detail_read_model",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "customer": {"id": 22, "name": "Elif"},
            "conversation_state": None,
            "control": None,
            "messages": [],
            "message_page": {},
            "control_history": [],
            "active_order": rpc_order,
            "active_return_issue": rpc_return,
            "open_unanswered": rpc_open,
        },
    )

    result = seller_panel_service.get_conversation_detail(11, 22)

    assert result["ok"] is True
    assert result["active_order"]["customer_id"] == 22
    assert result["active_order"]["id"] == 18
    assert result["active_order"]["seller_action_required"] is True
    assert result["active_return_issue"]["customer_id"] == 22
    assert result["active_return_issue"]["seller_action_required"] is True
    assert result["open_unanswered"][0]["seller_action_required"] is True
    assert result["active_order"]["external_order_number"] == "TR123"
    assert result["active_return_issue"]["order_id"] == 18
    assert result["open_unanswered"][0]["question"] == "Kargoya ne zaman verilir?"


def test_conversation_detail_null_relationships_remain_null(monkeypatch) -> None:
    monkeypatch.setattr(
        seller_panel_service,
        "get_seller_conversation_detail_read_model",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "customer": {"id": 22},
            "conversation_state": None,
            "control": None,
            "messages": [],
            "message_page": {},
            "control_history": [],
            "active_order": None,
            "active_return_issue": None,
            "open_unanswered": [],
        },
    )
    result = seller_panel_service.get_conversation_detail(11, 22)
    assert result["active_order"] is None
    assert result["active_return_issue"] is None
    assert result["open_unanswered"] == []


def test_conversation_detail_tenant_isolation(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    def fake_detail(seller_id: int, customer_id: int, **kwargs: Any) -> dict[str, Any]:
        captured["seller_id"] = seller_id
        captured["customer_id"] = customer_id
        return {
            "durum": "başarılı",
            "customer": {"id": customer_id},
            "conversation_state": None,
            "control": None,
            "messages": [],
            "message_page": {},
            "control_history": [],
            "active_order": None,
            "active_return_issue": None,
            "open_unanswered": [],
        }

    monkeypatch.setattr(seller_panel_service, "get_seller_conversation_detail_read_model", fake_detail)
    seller_panel_service.get_conversation_detail(99, 123)
    assert captured == {"seller_id": 99, "customer_id": 123}


def test_conversation_list_enriches_entries(monkeypatch) -> None:
    monkeypatch.setattr(
        seller_panel_service,
        "get_seller_conversation_list",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": 1,
            "conversations": [
                {
                    "customer": {"id": 22, "name": "Elif"},
                    "active_order": {"id": 18, "status": ORDER_STATUS_COLLECTING},
                    "active_return_issue": {
                        "id": 41,
                        "status": "SELLER_REVIEW_REQUIRED",
                        "order_id": 18,
                    },
                    "open_unanswered": {
                        "id": 61,
                        "question": "q",
                        "occurrence_count": 1,
                        "last_seen_at": "now",
                        "version": 1,
                    },
                }
            ],
        },
    )
    result = seller_panel_service.list_conversations(11)
    conv = result["conversations"][0]
    assert conv["active_order"]["customer_id"] == 22
    assert conv["active_order"]["seller_action_required"] is False
    assert conv["active_return_issue"]["customer_id"] == 22
    assert conv["active_return_issue"]["seller_action_required"] is True
    assert conv["open_unanswered"]["seller_action_required"] is True


def test_unanswered_summary_primary_action_normalize() -> None:
    open_group = {
        "id": 61,
        "canonical_question": "Kargoya ne zaman verilir?",
        "status": "OPEN",
        "answer_text": None,
        "occurrence_count": 2,
        "first_seen_at": "2026-08-09T09:00:00+00:00",
        "last_seen_at": "2026-08-10T11:58:00+00:00",
        "version": 2,
    }
    closed_group = {**open_group, "status": "ANSWERED", "answer_text": "Cevap"}
    dismissed_group = {**open_group, "status": "DISMISSED"}

    assert unanswered_question_service.present_group_summary(open_group)["seller_action_required"] is True
    assert unanswered_question_service.present_group_summary(closed_group)["seller_action_required"] is False
    assert unanswered_question_service.present_group_summary(dismissed_group)["seller_action_required"] is False
    assert unanswered_question_service.present_group_summary(open_group)["question"] == "Kargoya ne zaman verilir?"


def test_unanswered_summary_fail_closed_type() -> None:
    group = {
        "id": 1,
        "canonical_question": "q",
        "status": "OPEN",
        "answer_text": None,
        "occurrence_count": 1,
        "first_seen_at": "now",
        "last_seen_at": "now",
        "version": 1,
    }
    summary = unanswered_question_service.present_group_summary(group)
    assert isinstance(summary["seller_action_required"], bool)


def test_order_detail_primary_action_normalize(monkeypatch) -> None:
    from fastapi.testclient import TestClient
    from main import app

    context = _context()
    app.dependency_overrides[order_routes.require_seller] = lambda: context
    client = TestClient(app)

    def fake_detail(seller_id: int, order_id: int) -> dict[str, Any]:
        assert seller_id == 11
        assert order_id == 41
        return _order_result(
            ORDER_STATUS_SELLER_REVIEW_REQUIRED,
            reason_code="manual",
        )

    monkeypatch.setattr(order_routes, "get_order_with_fields", fake_detail)
    response = client.get("/seller/orders/41")
    assert response.status_code == 200
    assert response.json()["order"]["seller_action_required"] is True
    assert response.json()["order"]["customer_id"] == 22

    monkeypatch.setattr(
        order_routes,
        "get_order_with_fields",
        lambda seller_id, order_id: _order_result(ORDER_STATUS_COLLECTING),
    )
    response = client.get("/seller/orders/41")
    assert response.status_code == 200
    assert response.json()["order"]["seller_action_required"] is False
    app.dependency_overrides.clear()


def test_order_detail_null_relationship_behavior(monkeypatch) -> None:
    from fastapi.testclient import TestClient
    from main import app

    context = _context()
    app.dependency_overrides[order_routes.require_seller] = lambda: context
    client = TestClient(app)
    payload = _order_result(ORDER_STATUS_COLLECTING)
    payload["order"].update(
        product_id=None,
        product_name_snapshot=None,
        external_order_number=None,
        customer_phone_snapshot=None,
        created_from_message_id=None,
        last_source_message_id=None,
    )
    monkeypatch.setattr(order_routes, "get_order_with_fields", lambda *args: payload)

    response = client.get("/seller/orders/41")
    assert response.status_code == 200
    assert response.json()["order"]["seller_action_required"] is False
    app.dependency_overrides.clear()


def test_unanswered_detail_and_action_enrich_seller_action_required(monkeypatch) -> None:
    from fastapi.testclient import TestClient
    from main import app

    context = _context()
    app.dependency_overrides[unanswered_routes.require_seller] = lambda: context
    client = TestClient(app)

    monkeypatch.setattr(
        unanswered_routes,
        "get_seller_unanswered_question_detail",
        lambda seller_id, group_id: {
            "durum": "başarılı",
            "group": {
                "id": 61,
                "seller_id": 11,
                "canonical_question": "q",
                "status": "OPEN",
                "answer_text": None,
                "occurrence_count": 1,
                "first_seen_at": "now",
                "last_seen_at": "now",
                "version": 2,
                "answered_at": None,
                "dismissed_at": None,
                "dismiss_note": None,
                "created_at": "now",
                "updated_at": "now",
            },
            "occurrences": [
                {
                    "id": 1,
                    "customer_id": 22,
                    "message_id": 101,
                    "question_text": "q",
                    "occurred_at": "now",
                }
            ],
        },
    )
    response = client.get("/seller/unanswered-questions/61")
    assert response.status_code == 200
    assert response.json()["question"]["seller_action_required"] is True
    assert response.json()["occurrences"][0]["customer_id"] == 22

    monkeypatch.setattr(
        unanswered_routes,
        "set_seller_answer",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "changed": True,
            "group": {
                "id": 61,
                "seller_id": 11,
                "canonical_question": "q",
                "status": "ANSWERED",
                "answer_text": "ans",
                "occurrence_count": 1,
                "first_seen_at": "now",
                "last_seen_at": "now",
                "version": 3,
                "answered_at": "now",
                "dismissed_at": None,
                "dismiss_note": None,
                "created_at": "now",
                "updated_at": "now",
            },
        },
    )
    response = client.post(
        "/seller/unanswered-questions/61/actions",
        json={"action": "set_answer", "expected_version": 2, "answer": "ans"},
    )
    assert response.json()["question"]["seller_action_required"] is False
    app.dependency_overrides.clear()


def test_return_relationships_already_sufficient(monkeypatch) -> None:
    from fastapi.testclient import TestClient
    from main import app

    context = _context()
    app.dependency_overrides[return_routes.require_seller] = lambda: context
    client = TestClient(app)
    monkeypatch.setattr(
        return_routes,
        "list_seller_return_issue_requests",
        lambda seller_id, **kwargs: {
            "durum": "başarılı",
            "toplam": 1,
            "requests": [
                {
                    "id": 51,
                    "seller_id": 11,
                    "customer_id": 22,
                    "order_id": 7,
                    "issue_type": "DAMAGED_ITEM",
                    "external_order_number_snapshot": "TR123",
                    "product_name_snapshot": "Kupa",
                    "reason_text": "kırık",
                    "image_requirement_snapshot": "REQUIRED",
                    "status": "SELLER_REVIEW_REQUIRED",
                    "review_reason_code": None,
                    "review_note": None,
                    "created_from_message_id": 1,
                    "last_source_message_id": 1,
                    "version": 2,
                    "created_at": "now",
                    "updated_at": "now",
                    "review_required_at": "now",
                    "handled_at": None,
                    "handled_by_profile_id": None,
                    "seller_note": None,
                    "customer_phone": "+90555",
                    "display_issue_type": "Hasarlı ürün",
                    "seller_action_required": True,
                }
            ],
        },
    )
    response = client.get("/seller/return-issue-requests?view=action_required")
    assert response.status_code == 200
    request = response.json()["requests"][0]
    assert request["customer_id"] == 22
    assert request["order_id"] == 7
    assert request["seller_action_required"] is True
    app.dependency_overrides.clear()


def test_no_internal_reason_code_leak_for_primary_action(monkeypatch) -> None:
    group = {
        "id": 1,
        "canonical_question": "q",
        "status": "OPEN",
        "answer_text": None,
        "occurrence_count": 1,
        "first_seen_at": "now",
        "last_seen_at": "now",
        "version": 1,
    }
    summary = unanswered_question_service.present_group_summary(group)
    assert "review_reason_code" not in summary
    assert "reason_code" not in summary
    assert isinstance(summary["seller_action_required"], bool)

    from fastapi.testclient import TestClient
    from main import app

    context = _context()
    app.dependency_overrides[order_routes.require_seller] = lambda: context
    client = TestClient(app)
    monkeypatch.setattr(
        order_routes,
        "get_order_with_fields",
        lambda seller_id, order_id: _order_result(
            ORDER_STATUS_SELLER_REVIEW_REQUIRED,
            reason_code="internal_code_should_not_be_primary",
        ),
    )
    response = client.get("/seller/orders/41")
    assert response.status_code == 200
    assert response.json()["order"]["seller_action_required"] is True
    app.dependency_overrides.clear()

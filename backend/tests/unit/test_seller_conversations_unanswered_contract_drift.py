from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

import conversation_control_service
import protected_routes
import seller_panel_service
import unanswered_question_service


CONTRACT_PATH = (
    Path(__file__).resolve().parents[3]
    / "contracts"
    / "seller-conversations-unanswered-v1.json"
)


def _load_contract() -> dict[str, Any]:
    with CONTRACT_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    assert payload["schema_version"] == 1
    return payload


def _context() -> SimpleNamespace:
    return SimpleNamespace(seller_id=11, profile={"id": 7})


def test_conversations_shared_contract_matches_backend_services_and_routes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contract = _load_contract()["conversations"]
    context = _context()

    list_payload = contract["list_response"]
    monkeypatch.setattr(
        seller_panel_service,
        "get_seller_conversation_list",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": list_payload["toplam"],
            "conversations": list_payload["conversations"],
        },
    )

    list_response = protected_routes.seller_conversations(
        attention_only=True,
        control_state="RETURN_REVIEW",
        limit=20,
        offset=0,
        context=context,
    )
    assert list_response == list_payload

    detail_payload = contract["detail_response"]
    monkeypatch.setattr(
        seller_panel_service,
        "get_seller_conversation_detail_read_model",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            **detail_payload,
        },
    )

    detail_response = protected_routes.seller_conversation_detail(
        22,
        message_limit=50,
        before_message_id=None,
        control_history_limit=20,
        context=context,
    )
    assert detail_response == detail_payload

    control_payload = contract["control_response"]
    raw_control = {
        key: value
        for key, value in control_payload["control"].items()
        if key != "display_name"
    }
    monkeypatch.setattr(
        conversation_control_service,
        "get_conversation_control",
        lambda seller_id, customer_id: {
            "durum": "başarılı",
            "control": raw_control,
        },
    )

    control_response = protected_routes.seller_conversation_control(
        22,
        context=context,
    )
    assert control_response == control_payload


def test_unanswered_shared_contract_matches_backend_services_and_routes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contract = _load_contract()["unanswered"]
    context = _context()

    list_payload = contract["list_response"]
    summary = list_payload["questions"][0]
    raw_group = {
        "id": summary["id"],
        "canonical_question": summary["question"],
        "status": summary["status"],
        "answer_text": summary["answer"],
        "occurrence_count": summary["occurrence_count"],
        "first_seen_at": summary["first_seen_at"],
        "last_seen_at": summary["last_seen_at"],
        "version": summary["version"],
    }
    monkeypatch.setattr(
        unanswered_question_service,
        "list_unanswered_question_groups",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": list_payload["toplam"],
            "groups": [raw_group],
        },
    )

    list_response = protected_routes.seller_unanswered_questions(
        view="action_required",
        limit=20,
        offset=0,
        context=context,
    )
    assert list_response == list_payload

    detail_payload = contract["detail_response"]
    monkeypatch.setattr(
        unanswered_question_service,
        "get_unanswered_question_group_detail",
        lambda seller_id, group_id: {
            "durum": "başarılı",
            "group": detail_payload["question"],
            "occurrences": detail_payload["occurrences"],
        },
    )

    detail_response = protected_routes.seller_unanswered_question_detail(
        61,
        context=context,
    )
    assert detail_response == detail_payload

    action_payload = contract["action_response"]
    monkeypatch.setattr(
        unanswered_question_service,
        "set_unanswered_question_answer",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "changed": action_payload["changed"],
            "group": action_payload["question"],
        },
    )

    body = protected_routes.UnansweredQuestionActionRequest(
        action="set_answer",
        expected_version=2,
        answer="Siparişler iki iş günü içinde kargoya verilir.",
    )
    action_response = protected_routes.seller_unanswered_question_action(
        61,
        body,
        context=context,
    )
    assert action_response == action_payload

from __future__ import annotations

from typing import Any

import pytest

import chat_service
from tests.unit.test_chat_conversation_control import ChatHarness, classification, control


def install_harness(monkeypatch: pytest.MonkeyPatch) -> ChatHarness:
    return ChatHarness().install(monkeypatch)


def test_unknown_question_records_persistent_group_and_escalates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = install_harness(monkeypatch)
    harness.classification_result = classification("unclear")
    harness.classification_result["confidence"] = 0.1

    result = harness.send("Özel kaplama yoğunluğu nedir?")

    assert result["durum"] == "başarılı"
    assert result["kaynak"] == "escalation"
    assert len(harness.unanswered) == 1
    assert harness.unanswered[0]["source_message_id"] == 101
    assert harness.notifications == []


def test_future_new_message_uses_exact_saved_seller_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = install_harness(monkeypatch)
    harness.classification_result = classification("unclear")
    harness.classification_result["confidence"] = 0.1
    lookup_calls: list[tuple[int, str]] = []

    def fake_lookup(seller_id: int, question_text: str) -> dict[str, Any]:
        lookup_calls.append((seller_id, question_text))
        return {
            "durum": "başarılı",
            "matched": True,
            "answer": "Evet, 50°C'ye kadar uygundur.",
            "group": {"id": 41, "status": "ANSWERED"},
        }

    monkeypatch.setattr(chat_service, "unanswered_find_saved_answer", fake_lookup)

    result = harness.send("Bulaşık makinesinde yıkanır mı?")

    assert result["durum"] == "başarılı"
    assert result["kaynak"] == "seller_answer"
    assert result["cevap"] == "Evet, 50°C'ye kadar uygundur."
    assert lookup_calls == [(11, "Bulaşık makinesinde yıkanır mı?")]
    assert harness.unanswered == []


def test_duplicate_incoming_never_reuses_saved_answer_or_records_occurrence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = install_harness(monkeypatch)
    harness.incoming_result = {"durum": "duplicate", "message": {"id": 101}}
    lookup_calls: list[Any] = []
    monkeypatch.setattr(
        chat_service,
        "unanswered_find_saved_answer",
        lambda *args, **kwargs: lookup_calls.append((args, kwargs))
        or {"durum": "başarılı", "matched": True, "answer": "Cevap"},
    )

    result = harness.send("Soru?")

    assert result["durum"] == "duplicate"
    assert lookup_calls == []
    assert harness.unanswered == []
    assert [item["direction"] for item in harness.saved_messages] == ["incoming"]


def test_saved_answer_never_bypasses_seller_takeover(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = install_harness(monkeypatch)
    harness.controls = [control("SELLER_TAKEN_OVER")]
    calls: list[Any] = []
    monkeypatch.setattr(
        chat_service,
        "unanswered_find_saved_answer",
        lambda *args, **kwargs: calls.append((args, kwargs))
        or {"durum": "başarılı", "matched": True, "answer": "Cevap"},
    )

    result = harness.send("Bulaşık makinesinde yıkanır mı?")

    assert result["reason_code"] == "stored_seller_taken_over"
    assert calls == []
    assert [item["direction"] for item in harness.saved_messages] == ["incoming"]


def test_saved_answer_never_bypasses_resume_cursor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = install_harness(monkeypatch)
    harness.controls = [control(cursor=101)]
    calls: list[Any] = []
    monkeypatch.setattr(
        chat_service,
        "unanswered_find_saved_answer",
        lambda *args, **kwargs: calls.append((args, kwargs))
        or {"durum": "başarılı", "matched": True, "answer": "Cevap"},
    )

    result = harness.send("Eski soru")

    assert result["reason_code"] == "stored_before_resume_cursor"
    assert calls == []


def test_saved_answer_does_not_bypass_return_issue_domain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = install_harness(monkeypatch)
    harness.classification_result = classification("return_request")
    calls: list[Any] = []
    monkeypatch.setattr(
        chat_service,
        "unanswered_find_saved_answer",
        lambda *args, **kwargs: calls.append((args, kwargs))
        or {"durum": "başarılı", "matched": True, "answer": "Eski iade cevabı"},
    )

    result = harness.send("İade etmek istiyorum")

    assert result["kaynak"] == "return_issue"
    assert harness.return_issue_calls
    assert calls == []


def test_saved_answer_does_not_bypass_active_order_collection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = install_harness(monkeypatch)
    harness.flow_state = {
        "current_state": "AWAITING_IMAGE",
        "state_data": {"order_id": 701},
    }
    harness.classification_result = classification("unclear")
    harness.classification_result["confidence"] = 0.1
    calls: list[Any] = []
    monkeypatch.setattr(
        chat_service,
        "order_get_next_collection_step",
        lambda seller_id, order_id: {"durum": "başarılı", "step": "image", "complete": False},
    )
    monkeypatch.setattr(
        chat_service,
        "unanswered_find_saved_answer",
        lambda *args, **kwargs: calls.append((args, kwargs))
        or {"durum": "başarılı", "matched": True, "answer": "Cevap"},
    )

    result = harness.send("Bulaşık makinesinde yıkanır mı?")

    assert result["kaynak"] == "escalation"
    assert calls == []
    assert len(harness.unanswered) == 1


def test_answer_created_during_record_race_answers_only_current_new_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = install_harness(monkeypatch)
    harness.classification_result = classification("unclear")
    harness.classification_result["confidence"] = 0.1
    monkeypatch.setattr(
        chat_service,
        "unanswered_find_saved_answer",
        lambda *args, **kwargs: {"durum": "başarılı", "matched": False},
    )
    monkeypatch.setattr(
        chat_service,
        "unanswered_record_question",
        lambda **kwargs: {
            "durum": "başarılı",
            "answer_available": True,
            "answer": "Yeni kaydedilen seller cevabı",
            "group": {"id": 41, "status": "ANSWERED"},
        },
    )

    result = harness.send("Soru?")

    assert result["kaynak"] == "seller_answer"
    assert result["cevap"] == "Yeni kaydedilen seller cevabı"
    assert [item["direction"] for item in harness.saved_messages] == ["incoming", "outgoing"]


def test_unanswered_persistence_failure_fails_closed_without_outgoing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = install_harness(monkeypatch)
    harness.classification_result = classification("unclear")
    harness.classification_result["confidence"] = 0.1
    monkeypatch.setattr(
        chat_service,
        "unanswered_find_saved_answer",
        lambda *args, **kwargs: {"durum": "başarılı", "matched": False},
    )
    monkeypatch.setattr(
        chat_service,
        "unanswered_record_question",
        lambda **kwargs: {"durum": "hata", "kind": "unavailable"},
    )

    result = harness.send("Bilinmeyen soru")

    assert result["reason_code"] == "unanswered_question_persist_failed"
    assert [item["direction"] for item in harness.saved_messages] == ["incoming"]


def test_known_template_precedes_saved_unanswered_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = install_harness(monkeypatch)
    harness.classification_result = classification("greeting")
    calls: list[Any] = []
    monkeypatch.setattr(
        chat_service,
        "unanswered_find_saved_answer",
        lambda *args, **kwargs: calls.append((args, kwargs))
        or {"durum": "başarılı", "matched": True, "answer": "Eski cevap"},
    )

    result = harness.send("Merhaba")

    assert result["kaynak"] == "template"
    assert calls == []

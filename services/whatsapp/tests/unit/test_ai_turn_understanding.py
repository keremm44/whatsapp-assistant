from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import ai_engine


class _Completions:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=json.dumps(self.payload, ensure_ascii=False)
                    )
                )
            ],
            usage=SimpleNamespace(total_tokens=91),
        )


def _client(payload: dict[str, Any]) -> tuple[Any, _Completions]:
    completions = _Completions(payload)
    return SimpleNamespace(chat=SimpleNamespace(completions=completions)), completions


def _valid_turn(**overrides: Any) -> dict[str, Any]:
    value: dict[str, Any] = {
        "kind": "information",
        "actions": ["provide_information"],
        "direct_question": False,
        "expects_more": False,
        "expects_attachment": False,
        "correction_requested": False,
        "seller_attention_requested": False,
    }
    value.update(overrides)
    return value


def test_multi_intent_keeps_all_needs_and_promotes_critical_complaint(monkeypatch) -> None:
    client, _ = _client(
        {
            "intent": "custom_text_question",
            "confidence": 0.93,
            "detected_intents": [
                {"intent": "custom_text_question", "confidence": 0.93},
                {"intent": "complaint", "confidence": 0.96},
            ],
            "alternatives": [],
            "turn": _valid_turn(
                kind="mixed",
                actions=["provide_personalization", "report_problem"],
            ),
            "entities": {},
            "reason": "Kişiselleştirme bilgisi ve sorun bildirimi aynı turda.",
            "context_used": False,
            "memory_summary": "Müşteri kişiselleştirme bilgisi verdi ve ürünle ilgili sorun bildirdi.",
        }
    )
    monkeypatch.setattr(ai_engine, "get_classifier_client", lambda: client)
    monkeypatch.setattr(ai_engine, "load_current_conversation_memory", lambda: None)

    result = ai_engine.classify_intent("Üzerine Elif yazın, bu arada kupa kırık geldi")

    assert result["intent"] == "complaint"
    assert result["confidence"] == 0.96
    assert ai_engine.intent_is_safe(result) is True
    assert ai_engine.safe_detected_intents(result) == ["complaint", "custom_text_question"]
    assert ai_engine.turn_understanding_is_safe(result) is True
    assert result["turn"]["kind"] == "mixed"
    assert result["turn"]["actions"] == ["provide_personalization", "report_problem"]


def test_explicit_return_request_has_priority_over_complaint(monkeypatch) -> None:
    client, _ = _client(
        {
            "intent": "complaint",
            "confidence": 0.98,
            "detected_intents": [
                {"intent": "complaint", "confidence": 0.98},
                {"intent": "return_request", "confidence": 0.95},
            ],
            "alternatives": [],
            "turn": _valid_turn(
                kind="mixed",
                actions=["report_problem", "request_return_or_change"],
            ),
            "entities": {},
            "reason": "Müşteri hasar bildiriyor ve açıkça iade istiyor.",
            "context_used": False,
            "memory_summary": "Müşteri ürün sorununu bildirdi ve iade istedi.",
        }
    )
    monkeypatch.setattr(ai_engine, "get_classifier_client", lambda: client)
    monkeypatch.setattr(ai_engine, "load_current_conversation_memory", lambda: None)

    result = ai_engine.classify_intent("Kırık geldi, iade etmek istiyorum")

    assert result["intent"] == "return_request"
    assert result["confidence"] == 0.95
    assert ai_engine.classification_has_safe_intent(result, "complaint") is True
    assert ai_engine.classification_has_safe_intent(result, "return_request") is True


def test_attachment_expectation_and_direct_question_are_separate_signals(monkeypatch) -> None:
    client, completions = _client(
        {
            "intent": "image_question",
            "confidence": 0.97,
            "detected_intents": [{"intent": "image_question", "confidence": 0.97}],
            "alternatives": [],
            "turn": _valid_turn(
                kind="mixed",
                actions=["ask_question", "announce_attachment"],
                direct_question=True,
                expects_more=True,
                expects_attachment=True,
            ),
            "entities": {},
            "reason": "Müşteri görsel göndereceğini söylüyor ve soru soruyor.",
            "context_used": False,
            "memory_summary": "Müşteri görsel göndereceğini belirtti ve görsel gönderimi hakkında soru sordu.",
        }
    )
    monkeypatch.setattr(ai_engine, "get_classifier_client", lambda: client)
    monkeypatch.setattr(ai_engine, "load_current_conversation_memory", lambda: None)

    result = ai_engine.classify_intent("Fotoğrafı birazdan atacağım, buradan mı göndereyim?")

    assert result["turn"]["direct_question"] is True
    assert result["turn"]["expects_more"] is True
    assert result["turn"]["expects_attachment"] is True
    assert ai_engine.turn_understanding_is_safe(result) is True
    assert len(completions.calls) == 1
    assert completions.calls[0]["max_tokens"] == 650


def test_correction_signal_is_advisory_and_does_not_replace_intent_contract(monkeypatch) -> None:
    client, _ = _client(
        {
            "intent": "unclear",
            "confidence": 0.62,
            "detected_intents": [],
            "alternatives": [],
            "turn": _valid_turn(
                kind="correction",
                actions=["revise_previous_information"],
                correction_requested=True,
            ),
            "entities": {},
            "reason": "Müşteri önceki bilgiyi değiştirmek istiyor ancak alan belirsiz.",
            "context_used": True,
            "memory_summary": "Müşteri daha önce verdiği bir bilgiyi değiştirmek istiyor.",
        }
    )
    monkeypatch.setattr(ai_engine, "get_classifier_client", lambda: client)
    monkeypatch.setattr(ai_engine, "load_current_conversation_memory", lambda: None)

    result = ai_engine.classify_intent("Yok, önceki değil diğerini kullanın")

    assert result["turn"]["correction_requested"] is True
    assert result["turn"]["actions"] == ["revise_previous_information"]
    assert ai_engine.turn_understanding_is_safe(result) is True
    assert ai_engine.intent_is_safe(result) is False


def test_invalid_turn_shape_never_becomes_safe_turn_understanding() -> None:
    result = ai_engine._normalize_result(
        {
            "intent": "price_question",
            "confidence": 0.97,
            "detected_intents": [{"intent": "price_question", "confidence": 0.97}],
            "alternatives": [],
            "turn": {
                "kind": "question",
                "actions": ["ask_question", "invent_order"],
                "direct_question": "yes",
                "expects_more": False,
                "expects_attachment": False,
                "correction_requested": False,
                "seller_attention_requested": False,
            },
            "context_used": False,
        }
    )

    assert result["intent"] == "price_question"
    assert ai_engine.intent_is_safe(result) is True
    assert result["turn_understanding_valid"] is False
    assert ai_engine.turn_understanding_is_safe(result) is False
    assert "invent_order" not in result["turn"]["actions"]


def test_context_dependent_multi_intents_fail_closed_with_incomplete_memory() -> None:
    result = ai_engine._normalize_result(
        {
            "intent": "shipping_company",
            "confidence": 0.97,
            "detected_intents": [
                {"intent": "shipping_company", "confidence": 0.97},
                {"intent": "image_question", "confidence": 0.91},
            ],
            "alternatives": [],
            "turn": _valid_turn(kind="mixed", actions=["ask_question", "announce_attachment"]),
            "context_used": True,
        }
    )
    result["memory_context_used"] = True
    result["memory_context_incomplete"] = True

    assert ai_engine.intent_is_safe(result) is False
    assert ai_engine.turn_understanding_is_safe(result) is False
    assert ai_engine.safe_detected_intents(result) == []


def test_prompt_is_post_order_and_turn_focused() -> None:
    prompt = ai_engine.CLASSIFIER_PROMPT
    assert "Sipariş normalde satıcının e-ticaret sitesinde daha önce verilmiştir" in prompt
    assert "yeni checkout/sipariş yaratmak değildir" in prompt
    assert "detected_intents" in prompt
    assert "correction_requested" in prompt
    assert "expects_attachment" in prompt
    assert "Business kararı verme" in prompt

from __future__ import annotations

import ai_engine
import ai_quality_runtime


def _base_result(*, turn: dict, valid: bool = False, fallback: bool = False) -> dict:
    return {
        "durum": "başarılı",
        "intent": "shipping_time",
        "confidence": 0.95,
        "detected_intents": [{"intent": "shipping_time", "confidence": 0.95}],
        "alternatives": [],
        "turn": turn,
        "turn_understanding_valid": valid,
        "entities": {},
        "reason": "test",
        "context_used": False,
        "memory_summary": None,
        "fallback_used": fallback,
    }


def test_install_appends_semantic_rules_once() -> None:
    original = ai_engine.CLASSIFIER_PROMPT
    try:
        ai_engine.CLASSIFIER_PROMPT = "base prompt"
        ai_quality_runtime._install_semantic_prompt_suffix()
        once = ai_engine.CLASSIFIER_PROMPT
        ai_quality_runtime._install_semantic_prompt_suffix()
        assert ai_engine.CLASSIFIER_PROMPT == once
        assert "off_topic" in once
        assert "discount_request" in once
        assert "order_confirmation_yes" in once
    finally:
        ai_engine.CLASSIFIER_PROMPT = original


def test_runtime_repairs_explicit_turkish_question(monkeypatch) -> None:
    raw = _base_result(
        turn={
            "kind": "unknown",
            "actions": [],
            "direct_question": False,
            "expects_more": False,
            "expects_attachment": False,
            "correction_requested": False,
            "seller_attention_requested": False,
        }
    )
    monkeypatch.setattr(ai_engine, "classify_intent", lambda message: raw)

    result = ai_quality_runtime.classify_intent("Kaç günde kargoya verirsiniz")

    assert result["turn"]["direct_question"] is True
    assert result["turn"]["kind"] == "question"
    assert result["turn"]["actions"] == ["ask_question"]
    assert result["turn_understanding_valid"] is True


def test_runtime_does_not_promote_degraded_fallback(monkeypatch) -> None:
    raw = _base_result(
        fallback=True,
        turn={
            "kind": "unknown",
            "actions": [],
            "direct_question": False,
            "expects_more": False,
            "expects_attachment": False,
            "correction_requested": False,
            "seller_attention_requested": False,
        },
    )
    monkeypatch.setattr(ai_engine, "classify_intent", lambda message: raw)

    result = ai_quality_runtime.classify_intent("Kaç günde kargoya verirsiniz")

    assert result is raw
    assert result["turn_understanding_valid"] is False

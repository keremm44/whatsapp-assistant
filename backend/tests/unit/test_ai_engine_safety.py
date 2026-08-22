from __future__ import annotations

import math
from types import SimpleNamespace
from typing import Any

import ai_engine


def test_safe_float_rejects_nan_infinity_and_bool() -> None:
    assert ai_engine._safe_float(float("nan"), 0.25) == 0.25
    assert ai_engine._safe_float(float("inf"), 0.25) == 0.25
    assert ai_engine._safe_float(float("-inf"), 0.25) == 0.25
    assert ai_engine._safe_float(True, 0.25) == 0.25
    assert math.isfinite(ai_engine._safe_float("0.9"))


def test_normalize_sorts_all_alternatives_before_truncating() -> None:
    result = ai_engine._normalize_result(
        {
            "intent": "price_question",
            "confidence": 0.90,
            "alternatives": [
                {"intent": "greeting", "confidence": 0.01},
                {"intent": "shipping_time", "confidence": 0.02},
                {"intent": "size_question", "confidence": 0.03},
                {"intent": "discount_request", "confidence": 0.84},
            ],
        }
    )

    assert result["alternatives"][0] == {
        "intent": "discount_request",
        "confidence": 0.84,
    }
    assert len(result["alternatives"]) == 3


def test_intent_is_not_safe_when_any_alternative_is_too_close() -> None:
    assert ai_engine.intent_is_safe(
        {
            "durum": "başarılı",
            "intent": "price_question",
            "confidence": 0.90,
            "alternatives": [
                {"intent": "greeting", "confidence": 0.01},
                {"intent": "discount_request", "confidence": 0.84},
            ],
        }
    ) is False


def test_intent_is_not_safe_on_invalid_alternative_shape() -> None:
    assert ai_engine.intent_is_safe(
        {
            "durum": "başarılı",
            "intent": "price_question",
            "confidence": 0.95,
            "alternatives": ["discount_request"],
        }
    ) is False


def test_invalid_provider_response_uses_degraded_fallback_and_alert(monkeypatch) -> None:
    alerts: list[str] = []

    class FakeCompletions:
        def create(self, **kwargs: Any) -> Any:
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=""))],
                usage=None,
            )

    client = SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))
    monkeypatch.setattr(ai_engine, "get_classifier_client", lambda: client)
    monkeypatch.setattr(
        ai_engine,
        "emit_operational_alert",
        lambda code, **kwargs: alerts.append(code),
    )

    result = ai_engine.classify_intent("fiyat ne kadar")

    assert result["fallback_used"] is True
    assert result["intent"] == "price_question"
    assert result["classifier_degraded_reason"] == "classifier_empty_response"
    assert alerts == ["classifier_invalid_response"]


def test_classifier_exception_fails_closed_to_deterministic_fallback(monkeypatch) -> None:
    class BrokenCompletions:
        def create(self, **kwargs: Any) -> Any:
            raise RuntimeError("provider down")

    client = SimpleNamespace(chat=SimpleNamespace(completions=BrokenCompletions()))
    monkeypatch.setattr(ai_engine, "get_classifier_client", lambda: client)
    monkeypatch.setattr(ai_engine, "emit_operational_alert", lambda *args, **kwargs: None)

    result = ai_engine.classify_intent("anlaşılmayan serbest bir mesaj")

    assert result["fallback_used"] is True
    assert result["classifier_unavailable"] is True
    assert result["classifier_degraded_reason"] == "classifier_request_failed"
    assert result["intent"] == "unclear"
    assert ai_engine.intent_is_safe(result) is False

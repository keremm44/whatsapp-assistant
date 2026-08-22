from __future__ import annotations

from ai_evaluation import IntentEvalCase, evaluate_intent_classifier, load_intent_eval_cases


def _cases() -> list[IntentEvalCase]:
    base = [
        IntentEvalCase(
            case_id=f"case-{index:02d}",
            message=f"message {index}",
            expected_intent="greeting",
            critical=index < 2,
        )
        for index in range(40)
    ]
    return base


def _result(intent: str, *, safe: bool = True, fallback: bool = False) -> dict:
    return {
        "durum": "başarılı",
        "intent": intent,
        "confidence": 0.95 if safe else 0.20,
        "alternatives": [],
        "fallback_used": fallback,
    }


def test_repository_dataset_is_valid_and_large_enough() -> None:
    cases = load_intent_eval_cases()
    assert len(cases) >= 40
    assert len({case.case_id for case in cases}) == len(cases)
    assert any(case.critical for case in cases)


def test_eval_gate_passes_perfect_live_predictions() -> None:
    result = evaluate_intent_classifier(
        _cases(),
        lambda message: _result("greeting"),
        require_live_model=True,
    )
    assert result["gate_passed"] is True
    assert result["exact_accuracy"] == 1.0
    assert result["wrong_safe_count"] == 0
    assert result["critical_error_count"] == 0
    assert result["fallback_count"] == 0


def test_eval_gate_fails_any_wrong_safe_prediction() -> None:
    calls = 0

    def classify(message: str) -> dict:
        nonlocal calls
        calls += 1
        if calls == 40:
            return _result("price_question", safe=True)
        return _result("greeting")

    result = evaluate_intent_classifier(_cases(), classify)
    assert result["exact_accuracy"] == 0.975
    assert result["wrong_safe_count"] == 1
    assert result["gate_passed"] is False


def test_eval_gate_fails_critical_miss_even_when_prediction_is_not_safe() -> None:
    calls = 0

    def classify(message: str) -> dict:
        nonlocal calls
        calls += 1
        if calls == 1:
            return _result("unclear", safe=False)
        return _result("greeting")

    result = evaluate_intent_classifier(_cases(), classify)
    assert result["critical_error_count"] == 1
    assert result["wrong_safe_count"] == 0
    assert result["gate_passed"] is False


def test_live_eval_rejects_fallback_even_when_intent_is_correct() -> None:
    result = evaluate_intent_classifier(
        _cases(),
        lambda message: _result("greeting", fallback=True),
        require_live_model=True,
    )
    assert result["exact_accuracy"] == 1.0
    assert result["fallback_count"] == 40
    assert result["gate_passed"] is False


def test_diagnostic_eval_can_allow_fallback() -> None:
    result = evaluate_intent_classifier(
        _cases(),
        lambda message: _result("greeting", fallback=True),
        require_live_model=False,
    )
    assert result["gate_passed"] is True

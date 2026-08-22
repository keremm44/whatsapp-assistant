from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from ai_engine import VALID_INTENTS, intent_is_safe


DEFAULT_CASES_PATH = Path(__file__).resolve().parent / "evals" / "intent_cases.json"
MIN_CASE_COUNT = 40
MIN_EXACT_ACCURACY = 0.90


@dataclass(frozen=True)
class IntentEvalCase:
    case_id: str
    message: str
    expected_intent: str
    critical: bool = False


@dataclass(frozen=True)
class IntentEvalFailure:
    case_id: str
    expected_intent: str
    predicted_intent: str
    safe: bool
    fallback_used: bool
    kind: str


def load_intent_eval_cases(path: Path = DEFAULT_CASES_PATH) -> list[IntentEvalCase]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"AI eval dataset okunamadı: {path}") from exc

    if not isinstance(payload, list) or len(payload) < MIN_CASE_COUNT:
        raise RuntimeError(
            f"AI eval dataset en az {MIN_CASE_COUNT} vaka içermelidir."
        )

    cases: list[IntentEvalCase] = []
    seen_ids: set[str] = set()
    for index, item in enumerate(payload):
        if not isinstance(item, dict):
            raise RuntimeError(f"AI eval vaka #{index + 1} nesne olmalıdır.")
        case_id = str(item.get("id") or "").strip()
        message = str(item.get("message") or "").strip()
        expected_intent = str(item.get("expected_intent") or "").strip()
        critical = item.get("critical", False)
        if not case_id or len(case_id) > 80 or case_id in seen_ids:
            raise RuntimeError(f"AI eval vaka kimliği geçersiz/tekrarlı: {case_id!r}")
        if not message or len(message) > 1000:
            raise RuntimeError(f"AI eval mesajı geçersiz: {case_id}")
        if expected_intent not in VALID_INTENTS:
            raise RuntimeError(
                f"AI eval beklenen intent geçersiz: {case_id} -> {expected_intent!r}"
            )
        if not isinstance(critical, bool):
            raise RuntimeError(f"AI eval critical alanı bool olmalıdır: {case_id}")
        seen_ids.add(case_id)
        cases.append(
            IntentEvalCase(
                case_id=case_id,
                message=message,
                expected_intent=expected_intent,
                critical=critical,
            )
        )
    return cases


def evaluate_intent_classifier(
    cases: list[IntentEvalCase],
    classify: Callable[[str], dict[str, Any]],
    *,
    require_live_model: bool = True,
) -> dict[str, Any]:
    if len(cases) < MIN_CASE_COUNT:
        raise RuntimeError(f"AI eval en az {MIN_CASE_COUNT} vaka ile çalışmalıdır.")

    exact_correct = 0
    wrong_safe_count = 0
    critical_error_count = 0
    fallback_count = 0
    failures: list[IntentEvalFailure] = []

    for case in cases:
        result = classify(case.message)
        if not isinstance(result, dict):
            result = {"durum": "hata", "intent": "unclear"}

        predicted = str(result.get("intent") or "unclear")
        if predicted not in VALID_INTENTS:
            predicted = "unclear"
        safe = intent_is_safe(result)
        fallback_used = result.get("fallback_used") is True

        if predicted == case.expected_intent:
            exact_correct += 1
        else:
            failures.append(
                IntentEvalFailure(
                    case_id=case.case_id,
                    expected_intent=case.expected_intent,
                    predicted_intent=predicted,
                    safe=safe,
                    fallback_used=fallback_used,
                    kind="intent_mismatch",
                )
            )
            if safe:
                wrong_safe_count += 1
            if case.critical:
                critical_error_count += 1

        if fallback_used:
            fallback_count += 1

    total = len(cases)
    exact_accuracy = exact_correct / total
    gate_passed = (
        exact_accuracy >= MIN_EXACT_ACCURACY
        and wrong_safe_count == 0
        and critical_error_count == 0
        and (fallback_count == 0 or not require_live_model)
    )

    return {
        "status": "passed" if gate_passed else "failed",
        "gate_passed": gate_passed,
        "total": total,
        "exact_correct": exact_correct,
        "exact_accuracy": round(exact_accuracy, 4),
        "wrong_safe_count": wrong_safe_count,
        "critical_error_count": critical_error_count,
        "fallback_count": fallback_count,
        "require_live_model": require_live_model,
        "thresholds": {
            "min_case_count": MIN_CASE_COUNT,
            "min_exact_accuracy": MIN_EXACT_ACCURACY,
            "max_wrong_safe_count": 0,
            "max_critical_error_count": 0,
            "max_fallback_count_live": 0,
        },
        "failures": [failure.__dict__ for failure in failures],
    }

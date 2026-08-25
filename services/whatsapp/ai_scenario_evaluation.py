from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from ai_engine import VALID_INTENTS, VALID_TURN_ACTIONS, VALID_TURN_KINDS


DEFAULT_SCENARIOS_PATH = Path(__file__).resolve().parent / "evals" / "conversation_scenarios.json"
MIN_SCENARIO_COUNT = 20
MIN_SCENARIO_PASS_RATE = 0.90


@dataclass(frozen=True)
class ConversationScenario:
    case_id: str
    messages: tuple[str, ...]
    expected_intent: str | None
    required_detected_intents: tuple[str, ...]
    expected_turn_kind: str | None
    required_actions: tuple[str, ...]
    direct_question: bool | None
    expects_more: bool | None
    expects_attachment: bool | None
    correction_requested: bool | None
    seller_attention_requested: bool | None
    forbid_seller_attention: bool
    critical: bool


def _optional_bool(item: dict[str, Any], key: str, case_id: str) -> bool | None:
    value = item.get(key)
    if value is None:
        return None
    if not isinstance(value, bool):
        raise RuntimeError(f"Scenario {case_id}: {key} bool olmalıdır.")
    return value


def load_conversation_scenarios(
    path: Path = DEFAULT_SCENARIOS_PATH,
) -> list[ConversationScenario]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Conversation scenario dataset okunamadı: {path}") from exc

    if not isinstance(payload, list) or len(payload) < MIN_SCENARIO_COUNT:
        raise RuntimeError(f"En az {MIN_SCENARIO_COUNT} conversation scenario gerekir.")

    scenarios: list[ConversationScenario] = []
    seen_ids: set[str] = set()
    for index, raw in enumerate(payload):
        if not isinstance(raw, dict):
            raise RuntimeError(f"Scenario #{index + 1} nesne olmalıdır.")
        case_id = str(raw.get("id") or "").strip()
        if not case_id or case_id in seen_ids or len(case_id) > 80:
            raise RuntimeError(f"Scenario kimliği geçersiz/tekrarlı: {case_id!r}")
        messages_raw = raw.get("messages")
        if (
            not isinstance(messages_raw, list)
            or not 1 <= len(messages_raw) <= 12
            or any(not isinstance(message, str) or not message.strip() or len(message) > 1000 for message in messages_raw)
        ):
            raise RuntimeError(f"Scenario mesajları geçersiz: {case_id}")

        expected_intent_raw = raw.get("expected_intent")
        expected_intent: str | None = None
        if expected_intent_raw is not None:
            if expected_intent_raw not in VALID_INTENTS:
                raise RuntimeError(f"Scenario intent geçersiz: {case_id}")
            expected_intent = str(expected_intent_raw)

        detected_raw = raw.get("required_detected_intents") or []
        if not isinstance(detected_raw, list) or any(intent not in VALID_INTENTS for intent in detected_raw):
            raise RuntimeError(f"Scenario detected intents geçersiz: {case_id}")

        turn_kind_raw = raw.get("expected_turn_kind")
        expected_turn_kind: str | None = None
        if turn_kind_raw is not None:
            if turn_kind_raw not in VALID_TURN_KINDS:
                raise RuntimeError(f"Scenario turn kind geçersiz: {case_id}")
            expected_turn_kind = str(turn_kind_raw)

        actions_raw = raw.get("required_actions") or []
        if not isinstance(actions_raw, list) or any(action not in VALID_TURN_ACTIONS for action in actions_raw):
            raise RuntimeError(f"Scenario actions geçersiz: {case_id}")

        forbid_seller_attention = raw.get("forbid_seller_attention", False)
        critical = raw.get("critical", False)
        if not isinstance(forbid_seller_attention, bool) or not isinstance(critical, bool):
            raise RuntimeError(f"Scenario flags geçersiz: {case_id}")

        seen_ids.add(case_id)
        scenarios.append(
            ConversationScenario(
                case_id=case_id,
                messages=tuple(message.strip() for message in messages_raw),
                expected_intent=expected_intent,
                required_detected_intents=tuple(str(value) for value in detected_raw),
                expected_turn_kind=expected_turn_kind,
                required_actions=tuple(str(value) for value in actions_raw),
                direct_question=_optional_bool(raw, "direct_question", case_id),
                expects_more=_optional_bool(raw, "expects_more", case_id),
                expects_attachment=_optional_bool(raw, "expects_attachment", case_id),
                correction_requested=_optional_bool(raw, "correction_requested", case_id),
                seller_attention_requested=_optional_bool(raw, "seller_attention_requested", case_id),
                forbid_seller_attention=forbid_seller_attention,
                critical=critical,
            )
        )
    return scenarios


def _scenario_failures(scenario: ConversationScenario, result: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    if result.get("durum") != "başarılı":
        return ["classifier_failed"]

    if scenario.expected_intent is not None and result.get("intent") != scenario.expected_intent:
        failures.append("primary_intent")

    detected = {
        item.get("intent")
        for item in (result.get("detected_intents") or [])
        if isinstance(item, dict)
    }
    for intent in scenario.required_detected_intents:
        if intent not in detected:
            failures.append(f"detected:{intent}")

    turn = result.get("turn") if isinstance(result.get("turn"), dict) else {}
    if scenario.expected_turn_kind is not None and turn.get("kind") != scenario.expected_turn_kind:
        failures.append("turn_kind")

    actions = set(turn.get("actions") or []) if isinstance(turn.get("actions"), list) else set()
    for action in scenario.required_actions:
        if action not in actions:
            failures.append(f"action:{action}")

    for key in (
        "direct_question",
        "expects_more",
        "expects_attachment",
        "correction_requested",
        "seller_attention_requested",
    ):
        expected = getattr(scenario, key)
        if expected is not None and turn.get(key) is not expected:
            failures.append(key)

    if scenario.forbid_seller_attention and turn.get("seller_attention_requested") is True:
        failures.append("seller_attention_false_positive")
    return failures


def evaluate_conversation_scenarios(
    scenarios: list[ConversationScenario],
    classify_scenario: Callable[[ConversationScenario], dict[str, Any]],
) -> dict[str, Any]:
    if len(scenarios) < MIN_SCENARIO_COUNT:
        raise RuntimeError(f"En az {MIN_SCENARIO_COUNT} scenario ile eval çalışmalıdır.")

    failures: list[dict[str, Any]] = []
    passed = 0
    critical_failures = 0
    correction_failures = 0
    attachment_failures = 0
    multi_intent_failures = 0

    for scenario in scenarios:
        result = classify_scenario(scenario)
        if not isinstance(result, dict):
            result = {"durum": "hata"}
        reasons = _scenario_failures(scenario, result)
        if not reasons:
            passed += 1
            continue
        failures.append({
            "case_id": scenario.case_id,
            "reasons": reasons,
            "predicted_intent": result.get("intent"),
        })
        if scenario.critical:
            critical_failures += 1
        if scenario.correction_requested is True:
            correction_failures += 1
        if scenario.expects_attachment is True:
            attachment_failures += 1
        if len(scenario.required_detected_intents) > 1:
            multi_intent_failures += 1

    total = len(scenarios)
    pass_rate = passed / total
    gate_passed = (
        pass_rate >= MIN_SCENARIO_PASS_RATE
        and critical_failures == 0
        and correction_failures == 0
        and attachment_failures == 0
        and multi_intent_failures == 0
    )
    return {
        "status": "passed" if gate_passed else "failed",
        "gate_passed": gate_passed,
        "total": total,
        "passed": passed,
        "pass_rate": round(pass_rate, 4),
        "critical_failures": critical_failures,
        "correction_failures": correction_failures,
        "attachment_failures": attachment_failures,
        "multi_intent_failures": multi_intent_failures,
        "thresholds": {
            "min_scenarios": MIN_SCENARIO_COUNT,
            "min_pass_rate": MIN_SCENARIO_PASS_RATE,
            "max_critical_failures": 0,
            "max_correction_failures": 0,
            "max_attachment_failures": 0,
            "max_multi_intent_failures": 0,
        },
        "failures": failures,
    }

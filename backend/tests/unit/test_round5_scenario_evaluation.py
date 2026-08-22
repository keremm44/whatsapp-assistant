from __future__ import annotations

from ai_scenario_evaluation import (
    ConversationScenario,
    evaluate_conversation_scenarios,
    load_conversation_scenarios,
)


def _perfect_result(scenario: ConversationScenario) -> dict[str, object]:
    intent = scenario.expected_intent or (
        scenario.required_detected_intents[0]
        if scenario.required_detected_intents
        else "image_question"
    )
    detected = list(dict.fromkeys((intent, *scenario.required_detected_intents)))
    return {
        "durum": "başarılı",
        "intent": intent,
        "detected_intents": [
            {"intent": value, "confidence": 0.99} for value in detected
        ],
        "turn": {
            "kind": scenario.expected_turn_kind or "information",
            "actions": list(scenario.required_actions),
            "direct_question": scenario.direct_question is True,
            "expects_more": scenario.expects_more is True,
            "expects_attachment": scenario.expects_attachment is True,
            "correction_requested": scenario.correction_requested is True,
            "seller_attention_requested": scenario.seller_attention_requested is True,
        },
    }


def test_round5_dataset_has_real_multi_turn_coverage() -> None:
    scenarios = load_conversation_scenarios()
    assert len(scenarios) >= 20
    assert any(len(case.messages) >= 3 for case in scenarios)
    assert any(case.critical for case in scenarios)
    assert any(case.correction_requested is True for case in scenarios)
    assert any(case.expects_attachment is True for case in scenarios)
    assert any(len(case.required_detected_intents) > 1 for case in scenarios)


def test_round5_scenario_gate_passes_all_contracts_with_perfect_classifier() -> None:
    scenarios = load_conversation_scenarios()
    result = evaluate_conversation_scenarios(scenarios, _perfect_result)
    assert result["gate_passed"] is True
    assert result["critical_failures"] == 0
    assert result["correction_failures"] == 0
    assert result["attachment_failures"] == 0
    assert result["multi_intent_failures"] == 0


def test_round5_scenario_gate_has_zero_tolerance_for_critical_miss() -> None:
    scenarios = load_conversation_scenarios()
    critical_id = next(case.case_id for case in scenarios if case.critical)

    def classifier(case: ConversationScenario) -> dict[str, object]:
        if case.case_id == critical_id:
            return {
                "durum": "başarılı",
                "intent": "unclear",
                "detected_intents": [],
                "turn": {
                    "kind": "unknown",
                    "actions": [],
                    "direct_question": False,
                    "expects_more": False,
                    "expects_attachment": False,
                    "correction_requested": False,
                    "seller_attention_requested": False,
                },
            }
        return _perfect_result(case)

    result = evaluate_conversation_scenarios(scenarios, classifier)
    assert result["gate_passed"] is False
    assert result["critical_failures"] == 1

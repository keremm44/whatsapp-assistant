from __future__ import annotations

import argparse
import json
import os

from ai_engine import (
    CLASSIFIER_PROMPT,
    MODEL,
    _normalize_result,
    get_classifier_client,
    reset_classifier_client,
)
from ai_scenario_evaluation import (
    ConversationScenario,
    evaluate_conversation_scenarios,
    load_conversation_scenarios,
)


def _classify_scenario_live(scenario: ConversationScenario) -> dict[str, object]:
    client = get_classifier_client()
    if client is None:
        return {"durum": "hata", "reason": "classifier_unconfigured"}

    current_message = scenario.messages[-1]
    recent = [
        {"role": "customer", "type": "text", "text": message}
        for message in scenario.messages[:-1]
    ]
    content = json.dumps(
        {
            "conversation_context": {
                "living_summary": "",
                "last_intent": None,
                "recent_messages_after_summary": recent,
                "older_context_incomplete": False,
            },
            "current_message": current_message,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": CLASSIFIER_PROMPT},
            {"role": "user", "content": content},
        ],
        temperature=0,
        max_tokens=650,
        response_format={"type": "json_object"},
        timeout=8,
    )
    raw = response.choices[0].message.content
    if not raw:
        return {"durum": "hata", "reason": "empty_response"}
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        return {"durum": "hata", "reason": "invalid_schema"}
    return _normalize_result(parsed)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Canlı modeli çok mesajlı gerçekçi conversation scenario gate'inden geçirir.",
    )
    parser.add_argument("--show-failures", action="store_true")
    args = parser.parse_args()

    if not os.getenv("GROQ_API_KEY", "").strip():
        print(json.dumps({
            "status": "configuration_error",
            "reason": "GROQ_API_KEY is required for the live scenario eval gate",
        }, ensure_ascii=False, sort_keys=True))
        return 3

    reset_classifier_client()
    scenarios = load_conversation_scenarios()
    result = evaluate_conversation_scenarios(scenarios, _classify_scenario_live)
    summary = {key: value for key, value in result.items() if key != "failures"}
    if args.show_failures:
        summary["failures"] = result["failures"]
    else:
        summary["failure_case_ids"] = [item["case_id"] for item in result["failures"]]
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["gate_passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())

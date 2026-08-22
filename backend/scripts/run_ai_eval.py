from __future__ import annotations

import argparse
import json
import os

from ai_engine import classify_intent, reset_classifier_client
from ai_evaluation import evaluate_intent_classifier, load_intent_eval_cases


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Gerçek intent modelini golden dataset üzerinde kalite gate'inden geçirir.",
    )
    parser.add_argument(
        "--allow-fallback",
        action="store_true",
        help="Tanısal kullanım: fallback sonuçlarını gate failure sayma.",
    )
    parser.add_argument(
        "--show-failures",
        action="store_true",
        help="Başarısız vakaların kimliklerini ve tahminlerini yazdır.",
    )
    args = parser.parse_args()

    if not os.getenv("GROQ_API_KEY", "").strip() and not args.allow_fallback:
        print(
            json.dumps(
                {
                    "status": "configuration_error",
                    "reason": "GROQ_API_KEY is required for the live AI eval gate",
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 3

    reset_classifier_client()
    cases = load_intent_eval_cases()
    result = evaluate_intent_classifier(
        cases,
        classify_intent,
        require_live_model=not args.allow_fallback,
    )

    summary = {key: value for key, value in result.items() if key != "failures"}
    if args.show_failures:
        summary["failures"] = result["failures"]
    else:
        summary["failure_case_ids"] = [
            item["case_id"] for item in result["failures"]
        ]
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["gate_passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())

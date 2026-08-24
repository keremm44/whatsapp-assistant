from __future__ import annotations

from types import ModuleType
from typing import Any

import ai_engine
from ai_semantic_rules import CLASSIFIER_SEMANTIC_SUFFIX
from ai_turn_contract import canonicalize_turn_payload


_BOOL_TURN_FIELDS = (
    "direct_question",
    "expects_more",
    "expects_attachment",
    "correction_requested",
    "seller_attention_requested",
)


def _install_semantic_prompt_suffix() -> None:
    """Add the audited semantic distinctions to the production classifier prompt once."""
    suffix = CLASSIFIER_SEMANTIC_SUFFIX.strip()
    if suffix and suffix not in ai_engine.CLASSIFIER_PROMPT:
        ai_engine.CLASSIFIER_PROMPT = f"{ai_engine.CLASSIFIER_PROMPT.rstrip()}\n\n{suffix}\n"


def _turn_is_contract_safe(turn: object) -> bool:
    if not isinstance(turn, dict):
        return False
    if turn.get("kind") not in ai_engine.VALID_TURN_KINDS:
        return False
    actions = turn.get("actions")
    if not isinstance(actions, list) or any(
        action not in ai_engine.VALID_TURN_ACTIONS for action in actions
    ):
        return False
    return all(isinstance(turn.get(field), bool) for field in _BOOL_TURN_FIELDS)


def classify_intent(message: str) -> dict[str, Any]:
    """Run the existing classifier, then repair only deterministic turn redundancies.

    Business facts, confidence and intent safety remain owned by ``ai_engine``.
    Degraded deterministic fallbacks are deliberately left untouched.
    """
    result = ai_engine.classify_intent(message)
    if not isinstance(result, dict) or result.get("fallback_used") is True:
        return result

    before = result.get("turn")
    repaired_payload = canonicalize_turn_payload(
        {
            "intent": result.get("intent"),
            "detected_intents": result.get("detected_intents"),
            "turn": before,
        },
        message=message,
    )
    after = repaired_payload.get("turn")
    if not _turn_is_contract_safe(after):
        return result

    if after == before:
        return result

    updated = dict(result)
    updated["turn"] = after
    updated["turn_understanding_valid"] = True
    return updated


def install_chat_classifier_quality(dependencies: ModuleType) -> None:
    """Install the quality layer on the chat-service dependency seam."""
    _install_semantic_prompt_suffix()
    dependencies.classify_intent = classify_intent

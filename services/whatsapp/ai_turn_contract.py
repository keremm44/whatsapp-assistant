from __future__ import annotations

import re
from typing import Any


VALID_TURN_KINDS = {
    "greeting",
    "question",
    "information",
    "mixed",
    "confirmation",
    "correction",
    "unknown",
}

VALID_TURN_ACTIONS = {
    "greet",
    "ask_question",
    "provide_information",
    "provide_personalization",
    "report_problem",
    "request_return_or_change",
    "announce_attachment",
    "revise_previous_information",
    "request_seller",
}

QUESTION_ACTION = "ask_question"
CORRECTION_ACTION = "revise_previous_information"
SELLER_ACTION = "request_seller"
RETURN_ACTION = "request_return_or_change"
COMPLAINT_ACTION = "report_problem"
PERSONALIZATION_ACTION = "provide_personalization"
GREETING_ACTION = "greet"
ATTACHMENT_ACTION = "announce_attachment"

PERSONALIZATION_INTENTS = {
    "custom_text_question",
    "image_question",
    "design_request",
}

CONFIRMATION_INTENTS = {
    "order_confirmation_yes",
    "order_confirmation_no",
}

# High-precision Turkish question cues. Bare "ne" is deliberately excluded:
# "Ne güzel olmuş" is not a question. Multi-word forms such as "ne kadar" and
# "ne zaman" are handled explicitly below.
QUESTION_PARTICLE_RE = re.compile(
    r"(?:^|\s)(?:mı|mi|mu|mü|mıyım|miyim|muyum|müyüm|mısın|misin|musun|müsün|mıyız|miyiz|muyuz|müyüz|mısınız|misiniz|musunuz|müsünüz)(?:\s|$|[?.!,])",
    re.IGNORECASE,
)
QUESTION_WORD_RE = re.compile(
    r"(?:^|[\s,;])(?:neden|niye|nasıl|hangi|kaç|kim|kime|kimi|nerede|nereye|nereden)(?:\s|$|[?.!,])",
    re.IGNORECASE,
)
QUESTION_PHRASE_RE = re.compile(
    r"(?:^|[\s,;])(?:ne\s+kadar|ne\s+zaman|ne\s+lazım|ne\s+gerekir|ne\s+gerekiyor|ne\s+yapmalıyım|ne\s+yapabilirim)(?:\s|$|[?.!,])",
    re.IGNORECASE,
)
QUESTION_SUFFIX_RE = re.compile(
    r"\b(?:miyim|mıyım|muyum|müyüm|misin|mısın|musun|müsün|misiniz|mısınız|musunuz|müsünüz)\b",
    re.IGNORECASE,
)

IMAGE_TERM_RE = re.compile(r"\b(?:fotoğraf|fotograf|görsel|gorsel|resim)\b", re.IGNORECASE)
PLACEMENT_TERM_RE = re.compile(
    r"\b(?:ön\s*yüz|on\s*yuz|arka\s*yüz|arka\s*yuz|ön\s*taraf|on\s*taraf|arka\s*taraf|birinci|ikinci|sağ|sag|sol)\b",
    re.IGNORECASE,
)
PLACEMENT_VERB_RE = re.compile(
    r"\b(?:kullanılsın|kullanilsin|olsun|yerleşsin|yerlessin|basılsın|basilsin)\b",
    re.IGNORECASE,
)


def _looks_like_direct_question(message: str | None) -> bool:
    """Detect explicit customer questions without relying on model output."""
    if not isinstance(message, str):
        return False
    normalized = " ".join(message.casefold().strip().split())
    if not normalized:
        return False
    if "?" in normalized:
        return True
    return bool(
        QUESTION_PARTICLE_RE.search(normalized)
        or QUESTION_SUFFIX_RE.search(normalized)
        or QUESTION_WORD_RE.search(normalized)
        or QUESTION_PHRASE_RE.search(normalized)
    )


def _looks_like_image_personalization(message: str | None) -> bool:
    """Detect explicit image-to-print-area assignments, not generic image talk."""
    if not isinstance(message, str):
        return False
    normalized = " ".join(message.casefold().strip().split())
    if not normalized or not IMAGE_TERM_RE.search(normalized):
        return False
    return bool(PLACEMENT_TERM_RE.search(normalized) and PLACEMENT_VERB_RE.search(normalized))


def _known_intents(payload: dict[str, Any]) -> set[str]:
    intents: set[str] = set()
    primary = payload.get("intent")
    if isinstance(primary, str):
        intents.add(primary)
    detected = payload.get("detected_intents")
    if isinstance(detected, list):
        for item in detected:
            if isinstance(item, dict) and isinstance(item.get("intent"), str):
                intents.add(str(item["intent"]))
    return intents


def canonicalize_turn_payload(
    payload: dict[str, Any],
    *,
    message: str | None = None,
) -> dict[str, Any]:
    """Repair deterministic redundancies in model turn output before validation.

    The model remains responsible for semantic interpretation. This layer does
    not invent business facts or raise confidence. It repairs explicit language
    signals and internally redundant turn fields before allow-list validation.
    """
    result = dict(payload)
    raw_turn = result.get("turn")
    if not isinstance(raw_turn, dict):
        return result

    turn = dict(raw_turn)

    raw_actions = turn.get("actions")
    actions: list[str] = []
    if isinstance(raw_actions, list):
        for value in raw_actions:
            if value in VALID_TURN_ACTIONS and value not in actions:
                actions.append(str(value))

    def add(action: str) -> None:
        if action not in actions:
            actions.append(action)

    direct_question = turn.get("direct_question") is True or _looks_like_direct_question(message)
    turn["direct_question"] = direct_question

    correction_requested = turn.get("correction_requested") is True
    seller_attention_requested = turn.get("seller_attention_requested") is True
    expects_attachment = turn.get("expects_attachment") is True
    intents = _known_intents(result)

    if direct_question:
        add(QUESTION_ACTION)
    if correction_requested:
        add(CORRECTION_ACTION)
    if seller_attention_requested:
        add(SELLER_ACTION)
    if expects_attachment:
        add(ATTACHMENT_ACTION)
    if "return_request" in intents:
        add(RETURN_ACTION)
    if "complaint" in intents:
        add(COMPLAINT_ACTION)
    if "greeting" in intents:
        add(GREETING_ACTION)

    if "custom_text_question" in intents and not direct_question:
        add(PERSONALIZATION_ACTION)
    elif correction_requested and intents.intersection(PERSONALIZATION_INTENTS):
        add(PERSONALIZATION_ACTION)
    elif "image_question" in intents and _looks_like_image_personalization(message):
        add(PERSONALIZATION_ACTION)

    raw_kind = turn.get("kind")
    kind = str(raw_kind) if raw_kind in VALID_TURN_KINDS else "unknown"

    substantive_actions = [action for action in actions if action != QUESTION_ACTION]
    non_greeting_intents = intents - {"greeting"}

    if correction_requested:
        kind = "correction"
    elif intents.intersection(CONFIRMATION_INTENTS):
        kind = "confirmation"
    elif "greeting" in intents and not non_greeting_intents and not direct_question:
        kind = "greeting"
    elif direct_question and substantive_actions:
        kind = "mixed"
    elif direct_question:
        kind = "question"
    elif kind == "unknown" and actions:
        kind = "information"

    turn["kind"] = kind
    turn["actions"] = actions[:8]
    result["turn"] = turn
    return result

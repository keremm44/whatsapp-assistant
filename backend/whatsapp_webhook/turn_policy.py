from __future__ import annotations

import re

from .models import InboundMessageEvent


TURN_DEBOUNCE_SECONDS = 4
TURN_MAX_SECONDS = 12

_GREETING_ONLY = frozenset(
    {
        "merhaba",
        "selam",
        "selamlar",
        "merhabalar",
        "günaydın",
        "iyi günler",
        "iyi akşamlar",
        "selamün aleyküm",
        "selamun aleykum",
    }
)

# Common critical phrases are intentionally deterministic. They do not decide
# the return outcome; they only prevent a known return/complaint turn from
# waiting in the conversational debounce window.
_CRITICAL_PHRASES = (
    "iade",
    "değişim",
    "degisim",
    "kırık",
    "kirik",
    "hasarlı",
    "hasarli",
    "yanlış ürün",
    "yanlis urun",
    "yanlış baskı",
    "yanlis baski",
    "şikayet",
    "sikayet",
)

_QUESTION_WORD_RE = re.compile(
    r"(?:^|\s)(?:ne|neden|niye|nasıl|nasil|nerede|nerden|nereden|hangi|kaç|kac|kim|"
    r"mı|mi|mu|mü)(?:\s|$|[?.!,])",
    flags=re.IGNORECASE,
)


def _normalize_text(value: str) -> str:
    return " ".join(value.casefold().strip().split())


def should_process_immediately(event: InboundMessageEvent) -> bool:
    """Return True when delaying this inbound message would hurt the UX.

    This is deliberately a small deterministic fast-path. It does not replace
    AI intent classification; it only chooses whether the queue may debounce
    the message before normal processing.
    """
    if event.message_type != "text" or not isinstance(event.text, str):
        return True

    normalized = _normalize_text(event.text)
    if not normalized:
        return True
    if normalized in _GREETING_ONLY:
        return True
    if normalized.endswith("?") or "?" in normalized:
        return True
    if _QUESTION_WORD_RE.search(normalized):
        return True
    return any(phrase in normalized for phrase in _CRITICAL_PHRASES)


def turn_timing(event: InboundMessageEvent) -> tuple[int, int]:
    """Return `(debounce_seconds, max_turn_seconds)` for queue metadata."""
    debounce = 0 if should_process_immediately(event) else TURN_DEBOUNCE_SECONDS
    return debounce, TURN_MAX_SECONDS

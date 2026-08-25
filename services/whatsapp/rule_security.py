from __future__ import annotations

import unicodedata
from typing import Any


RULE_TRIGGER_MAX_LENGTH = 150
RULE_RESPONSE_MAX_LENGTH = 1500
RULE_MAX_IDENTICAL_CHAR_RUN = 64

_LINE_SEPARATORS = {"\u2028", "\u2029"}
_RESPONSE_ALLOWED_CONTROLS = {"\n", "\t"}


def _reject_unsafe_controls(value: str, *, allow_response_formatting: bool) -> None:
    allowed = _RESPONSE_ALLOWED_CONTROLS if allow_response_formatting else set()

    for char in value:
        if char in _LINE_SEPARATORS:
            raise ValueError("Kural metni desteklenmeyen satır ayırıcı karakter içeremez.")
        if unicodedata.category(char) == "Cc" and char not in allowed:
            raise ValueError("Kural metni kontrol karakteri içeremez.")


def _reject_pathological_repetition(value: str) -> None:
    previous: str | None = None
    run_length = 0

    for char in value:
        if char == previous:
            run_length += 1
        else:
            previous = char
            run_length = 1

        if run_length > RULE_MAX_IDENTICAL_CHAR_RUN:
            raise ValueError("Kural metni aşırı tekrarlı karakter dizisi içeremez.")


def normalize_rule_trigger_text(value: Any) -> Any:
    """Seller rule trigger'ını tek satırlı, sınırlı plain-text veri olarak normalize eder."""
    if not isinstance(value, str):
        return value

    _reject_unsafe_controls(value, allow_response_formatting=False)
    normalized = value.strip()
    _reject_pathological_repetition(normalized)
    return normalized


def normalize_rule_response_text(value: Any) -> Any:
    """Seller rule cevabını plain text olarak korur; yalnız güvenli biçim normalizasyonu yapar."""
    if not isinstance(value, str):
        return value

    normalized = value.replace("\r\n", "\n").replace("\r", "\n")
    _reject_unsafe_controls(normalized, allow_response_formatting=True)
    normalized = normalized.strip()
    _reject_pathological_repetition(normalized)
    return normalized

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Any


CURSOR_VERSION = 1
CURSOR_MAX_LENGTH = 2048


class CursorError(ValueError):
    pass


def _canonical_filters(filters: dict[str, Any]) -> str:
    return json.dumps(
        filters,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _filter_fingerprint(filters: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical_filters(filters).encode("utf-8")).hexdigest()[:24]


def encode_cursor(queue: str, filters: dict[str, Any], position: dict[str, Any]) -> str:
    if not isinstance(queue, str) or not queue:
        raise CursorError("Cursor queue geçersiz.")
    if not isinstance(position, dict) or not position:
        raise CursorError("Cursor pozisyonu geçersiz.")

    payload = {
        "v": CURSOR_VERSION,
        "q": queue,
        "f": _filter_fingerprint(filters),
        "p": position,
    }
    raw = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(token: str, queue: str, filters: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(token, str) or not token or len(token) > CURSOR_MAX_LENGTH:
        raise CursorError("Cursor geçersiz.")

    padding = "=" * (-len(token) % 4)
    try:
        raw = base64.b64decode(
            (token + padding).encode("ascii"),
            altchars=b"-_",
            validate=True,
        )
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeError, json.JSONDecodeError) as exc:
        raise CursorError("Cursor çözümlenemedi.") from exc

    if not isinstance(payload, dict) or set(payload) != {"v", "q", "f", "p"}:
        raise CursorError("Cursor yapısı geçersiz.")
    if payload.get("v") != CURSOR_VERSION or payload.get("q") != queue:
        raise CursorError("Cursor bu kuyruk için geçerli değil.")
    expected_fingerprint = _filter_fingerprint(filters)
    actual_fingerprint = payload.get("f")
    if not isinstance(actual_fingerprint, str) or not hmac.compare_digest(
        actual_fingerprint,
        expected_fingerprint,
    ):
        raise CursorError("Cursor mevcut filtrelerle uyumlu değil.")

    position = payload.get("p")
    if not isinstance(position, dict) or not position:
        raise CursorError("Cursor pozisyonu geçersiz.")
    return position

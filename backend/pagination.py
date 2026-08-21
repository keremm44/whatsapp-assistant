"""Opaque, signed cursors for tenant-scoped keyset pagination."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from datetime import datetime
from typing import Any

_SECRET = os.environ.get("PAGINATION_CURSOR_SECRET", "development-pagination-secret").encode()


def encode_cursor(*, seller_id: int, sort_value: str, row_id: int) -> str:
    payload = json.dumps({"s": seller_id, "v": sort_value, "i": row_id}, separators=(",", ":"), sort_keys=True).encode()
    signature = hmac.new(_SECRET, payload, hashlib.sha256).digest()[:16]
    return base64.urlsafe_b64encode(payload + signature).decode().rstrip("=")


def decode_cursor(cursor: str, *, seller_id: int) -> tuple[str, int] | None:
    if not isinstance(cursor, str) or not 8 <= len(cursor) <= 512:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        payload, supplied = raw[:-16], raw[-16:]
        if not hmac.compare_digest(hmac.new(_SECRET, payload, hashlib.sha256).digest()[:16], supplied):
            return None
        value: dict[str, Any] = json.loads(payload)
        if value.get("s") != seller_id or not isinstance(value.get("v"), str) or not isinstance(value.get("i"), int):
            return None
        datetime.fromisoformat(value["v"].replace("Z", "+00:00"))
        if value["i"] <= 0:
            return None
        return value["v"], value["i"]
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError):
        return None

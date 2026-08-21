"""Opaque, signed cursors for tenant-scoped keyset pagination."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from datetime import datetime
from typing import Any

from pagination_cursor import _filter_fingerprint

_SECRET = os.environ.get("PAGINATION_CURSOR_SECRET", "development-pagination-secret").encode()

# ------------------------------------------------------------
# Seller list v2 cursors (GET /seller/<list>/v2)
#
# These cursors bind three things to the signed payload:
#   - the seller id (fail-closed rejection for any other tenant),
#   - the queue (a cursor is only valid on the endpoint that made it),
#   - the filter fingerprint (a cursor made with one filter set cannot
#     be replayed under another filter set).
#
# Production without PAGINATION_CURSOR_SECRET is fail-closed: no cursor
# can be encoded or decoded, the v2 endpoints refuse to page.
# ------------------------------------------------------------

LIST_CURSOR_VERSION = 1
LIST_CURSOR_MAX_LENGTH = 2048
_LIST_CURSOR_SIGNATURE_BYTES = 16
_LIST_CURSOR_SECRET_ENV = "PAGINATION_CURSOR_SECRET"
_LIST_CURSOR_MIN_SECRET_LENGTH = 16
_LIST_CURSOR_DEFAULT_DEVELOPMENT_SECRET = "development-seller-list-cursor-secret"


class SellerListCursorError(ValueError):
    """Cursor geçersiz, imzası doğrulanamadı ya da bağlamla uyuşmuyor."""


def _list_cursor_secret() -> bytes:
    raw = os.environ.get(_LIST_CURSOR_SECRET_ENV, "").strip()
    if raw:
        if len(raw) < _LIST_CURSOR_MIN_SECRET_LENGTH:
            raise SellerListCursorError(
                f"{_LIST_CURSOR_SECRET_ENV} en az "
                f"{_LIST_CURSOR_MIN_SECRET_LENGTH} karakter olmalıdır."
            )
        return raw.encode("utf-8")
    app_env = os.environ.get("APP_ENV", "development").strip().lower()
    if app_env == "production":
        raise SellerListCursorError(
            f"Production ortamında {_LIST_CURSOR_SECRET_ENV} tanımlı olmalıdır."
        )
    return _LIST_CURSOR_DEFAULT_DEVELOPMENT_SECRET.encode("utf-8")


def encode_seller_list_cursor(
    *,
    seller_id: int,
    queue: str,
    filters: dict[str, Any],
    position: dict[str, Any],
) -> str:
    if not isinstance(seller_id, int) or isinstance(seller_id, bool) or seller_id <= 0:
        raise SellerListCursorError("Cursor seller kimliği geçersiz.")
    if not isinstance(queue, str) or not queue:
        raise SellerListCursorError("Cursor queue geçersiz.")
    if not isinstance(filters, dict):
        raise SellerListCursorError("Cursor filtre bağlamı geçersiz.")
    if not isinstance(position, dict) or not position:
        raise SellerListCursorError("Cursor pozisyonu geçersiz.")

    payload = {
        "v": LIST_CURSOR_VERSION,
        "s": seller_id,
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
    signature = hmac.new(
        _list_cursor_secret(), raw, hashlib.sha256
    ).digest()[: _LIST_CURSOR_SIGNATURE_BYTES]
    return base64.urlsafe_b64encode(raw + signature).decode("ascii").rstrip("=")


def decode_seller_list_cursor(
    token: str,
    *,
    seller_id: int,
    queue: str,
    filters: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(seller_id, int) or isinstance(seller_id, bool) or seller_id <= 0:
        raise SellerListCursorError("Seller kimliği geçersiz.")
    if not isinstance(queue, str) or not queue:
        raise SellerListCursorError("Queue geçersiz.")
    if not isinstance(filters, dict):
        raise SellerListCursorError("Filtre bağlamı geçersiz.")
    if not isinstance(token, str) or not token or len(token) > LIST_CURSOR_MAX_LENGTH:
        raise SellerListCursorError("Cursor geçersiz.")

    padding = "=" * (-len(token) % 4)
    try:
        raw = base64.b64decode(
            (token + padding).encode("ascii"),
            altchars=b"-_",
            validate=True,
        )
    except (ValueError, UnicodeError) as exc:
        raise SellerListCursorError("Cursor çözümlenemedi.") from exc

    if len(raw) <= _LIST_CURSOR_SIGNATURE_BYTES:
        raise SellerListCursorError("Cursor yapısı geçersiz.")
    body, supplied = raw[: -_LIST_CURSOR_SIGNATURE_BYTES], raw[-_LIST_CURSOR_SIGNATURE_BYTES:]
    expected = hmac.new(
        _list_cursor_secret(), body, hashlib.sha256
    ).digest()[: _LIST_CURSOR_SIGNATURE_BYTES]
    if not hmac.compare_digest(expected, supplied):
        raise SellerListCursorError("Cursor imzası doğrulanamadı.")

    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SellerListCursorError("Cursor çözümlenemedi.") from exc

    if not isinstance(payload, dict) or set(payload) != {"v", "s", "q", "f", "p"}:
        raise SellerListCursorError("Cursor yapısı geçersiz.")
    if payload.get("v") != LIST_CURSOR_VERSION:
        raise SellerListCursorError("Cursor sürümü desteklenmiyor.")
    if payload.get("s") != seller_id:
        raise SellerListCursorError("Cursor bu satıcıya ait değil.")
    if payload.get("q") != queue:
        raise SellerListCursorError("Cursor bu liste için geçerli değil.")
    actual_fingerprint = payload.get("f")
    if not isinstance(actual_fingerprint, str) or not hmac.compare_digest(
        actual_fingerprint,
        _filter_fingerprint(filters),
    ):
        raise SellerListCursorError("Cursor mevcut filtrelerle uyumlu değil.")

    position = payload.get("p")
    if not isinstance(position, dict) or not position:
        raise SellerListCursorError("Cursor pozisyonu geçersiz.")
    return position


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

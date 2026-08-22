from __future__ import annotations

import re
from typing import Any

from database import get_supabase
from database.whatsapp_event_queue import renew_whatsapp_event_claim
from order_service import list_seller_orders, validate_custom_text

from .transport_context import current_whatsapp_claim


_CONFIRM_YES = {
    "evet",
    "evet onaylıyorum",
    "evet onayliyorum",
    "onaylıyorum",
    "onayliyorum",
    "doğru",
    "dogru",
    "tamam",
    "kabul",
}
_CONFIRM_NO = {
    "hayır",
    "hayir",
    "onaylamıyorum",
    "onaylamiyorum",
    "vazgeçtim",
    "vazgectim",
    "iptal",
    "yanlış",
    "yanlis",
}

_REVISION_PATTERNS = (
    re.compile(
        r"^[\s\"'“”‘’]*(?P<old>.{1,120}?)[\s\"'“”‘’]+(?:değil|degil)[\s\"'“”‘’]+(?P<new>.{1,120}?)[\s\"'“”‘’]+(?:olsun|olacak|yazılsın|yazilsin)[.!?\s]*$",
        re.IGNORECASE,
    ),
    re.compile(
        r"^[\s\"'“”‘’]*(?P<old>.{1,120}?)[\s\"'“”‘’]+yerine[\s\"'“”‘’]+(?P<new>.{1,120}?)[\s\"'“”‘’]+(?:olsun|olacak|yazılsın|yazilsin)[.!?\s]*$",
        re.IGNORECASE,
    ),
)


def _normalize_text(value: str) -> str:
    return " ".join(value.strip(" \t\r\n\"'“”‘’.,!? ").split())


def _casefold_tr(value: str) -> str:
    return _normalize_text(value).translate(str.maketrans({"I": "ı", "İ": "i"})).casefold()


def parse_custom_text_revision(message: str) -> dict[str, Any] | None:
    """Parse only explicit old -> new personalization wording; never guess a new value."""
    if not isinstance(message, str) or not message.strip() or len(message) > 500:
        return None
    for pattern in _REVISION_PATTERNS:
        match = pattern.match(message.strip())
        if match is None:
            continue
        old_text = _normalize_text(match.group("old"))
        new_text = _normalize_text(match.group("new"))
        if not old_text or not new_text or _casefold_tr(old_text) == _casefold_tr(new_text):
            return None
        valid, normalized_new, _ = validate_custom_text(new_text)
        if not valid or normalized_new is None:
            return None
        return {"old_text": old_text, "new_text": normalized_new}
    return None


def confirmation_decision(message: str) -> str | None:
    normalized = _casefold_tr(message)
    if normalized in {_casefold_tr(value) for value in _CONFIRM_YES}:
        return "yes"
    if normalized in {_casefold_tr(value) for value in _CONFIRM_NO}:
        return "no"
    return None


def _order_number_hint(message: str) -> str | None:
    # Explicit numeric/order tokens only; this is a disambiguation hint, not a source of truth.
    match = re.search(r"(?:sipariş|siparis|order)\s*(?:no|numara|numarası|numarasi)?\s*[:#-]?\s*([A-Za-z0-9_-]{3,100})", message, re.IGNORECASE)
    return match.group(1).strip() if match else None


def build_custom_text_change_proposal(
    *,
    seller_id: int,
    customer_id: int,
    message: str,
) -> dict[str, Any]:
    """Resolve an explicit correction against authoritative order data without mutating it."""
    revision = parse_custom_text_revision(message)
    if revision is None:
        return {"status": "not_explicit"}

    listed = list_seller_orders(
        seller_id,
        customer_id=customer_id,
        limit=10,
        offset=0,
    )
    if listed.get("durum") != "başarılı":
        return {"status": "unavailable"}

    rows = [row for row in (listed.get("orders") or []) if isinstance(row, dict)]
    candidates = [
        row
        for row in rows
        if row.get("status") in {"COLLECTING", "COMPLETE"}
        and isinstance(row.get("custom_text"), str)
        and row.get("custom_text").strip()
    ]

    hint = _order_number_hint(message)
    if hint:
        hinted = [
            row
            for row in candidates
            if isinstance(row.get("external_order_number"), str)
            and _casefold_tr(row["external_order_number"]) == _casefold_tr(hint)
        ]
        if len(hinted) == 1:
            candidates = hinted

    old_text = revision["old_text"]
    exact_old = [
        row
        for row in candidates
        if _casefold_tr(str(row.get("custom_text") or "")) == _casefold_tr(old_text)
    ]
    if len(exact_old) == 1:
        candidates = exact_old
    elif len(exact_old) > 1:
        candidates = exact_old
    else:
        return {
            "status": "old_value_mismatch",
            "expected_old_text": old_text,
        }

    if len(candidates) != 1:
        return {
            "status": "ambiguous_order",
            "candidate_count": len(candidates),
        }

    order = candidates[0]
    order_id = order.get("id")
    version = order.get("version")
    if (
        not isinstance(order_id, int)
        or isinstance(order_id, bool)
        or order_id <= 0
        or not isinstance(version, int)
        or isinstance(version, bool)
        or version <= 0
    ):
        return {"status": "unavailable"}

    return {
        "status": "proposal",
        "order_id": order_id,
        "order_version": version,
        "external_order_number": order.get("external_order_number"),
        "old_text": str(order.get("custom_text") or "").strip(),
        "new_text": revision["new_text"],
        "order_status": order.get("status"),
    }


def apply_confirmed_custom_text_change(
    *,
    seller_id: int,
    customer_id: int,
    order_id: int,
    source_message_id: int,
    new_text: str,
    expected_version: int,
) -> dict[str, Any]:
    """Apply a separately confirmed change after renewing the WhatsApp lease when present."""
    valid, normalized_text, _ = validate_custom_text(new_text)
    if not valid or normalized_text is None:
        return {"durum": "doğrulama_hatası", "reason_code": "confirmed_change_invalid"}

    claim = current_whatsapp_claim()
    if claim is not None:
        renewed = renew_whatsapp_event_claim(
            claim.event_id,
            worker_id=claim.worker_id,
            claim_version=claim.claim_version,
        )
        if renewed.get("durum") != "başarılı":
            return {"durum": "çakışma", "reason_code": "whatsapp_claim_lost"}

    try:
        response = get_supabase().rpc(
            "apply_confirmed_order_custom_text_change",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_order_id": order_id,
                "source_message_id": source_message_id,
                "new_custom_text": normalized_text,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "reason_code": "confirmed_change_write_failed"}

    payload = response.data
    if isinstance(payload, list) and len(payload) == 1 and isinstance(payload[0], dict):
        payload = payload[0]
    if not isinstance(payload, dict):
        return {"durum": "hata", "reason_code": "confirmed_change_invalid_response"}

    status = payload.get("status")
    if status == "success":
        return {
            "durum": "başarılı",
            "changed": payload.get("changed") is True,
            "seller_review_required": payload.get("seller_review_required") is True,
            "order": payload.get("order") if isinstance(payload.get("order"), dict) else None,
            "previous_custom_text": payload.get("previous_custom_text"),
            "new_custom_text": payload.get("new_custom_text"),
        }
    if status == "conflict":
        return {
            "durum": "çakışma",
            "reason_code": str(payload.get("reason") or "confirmed_change_conflict"),
            "order": payload.get("order") if isinstance(payload.get("order"), dict) else None,
        }
    if status in {"not_found", "forbidden"}:
        return {"durum": "hata", "reason_code": f"confirmed_change_{status}"}
    return {"durum": "hata", "reason_code": str(payload.get("reason") or "confirmed_change_failed")}

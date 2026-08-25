from __future__ import annotations

from typing import Any

import return_issue_chat_occ as occ


def _request(*, version: int | None = 7, status: str = "COLLECTING") -> dict[str, Any]:
    row: dict[str, Any] = {
        "id": 41,
        "seller_id": 2,
        "customer_id": 14,
        "issue_type": "RETURN_REQUEST",
        "status": status,
    }
    if version is not None:
        row["version"] = version
    return row


def test_order_number_mutation_uses_version_from_authoritative_state(monkeypatch) -> None:
    states = iter(
        [
            {
                "durum": "başarılı",
                "request": _request(version=7),
                "awaiting": "order_number",
                "missing_fields": ["order_number", "reason"],
                "ready_for_review": False,
                "question": "Sipariş numaranızı paylaşır mısınız?",
            },
            {
                "durum": "başarılı",
                "request": _request(version=8),
                "awaiting": "reason",
                "missing_fields": ["reason"],
                "ready_for_review": False,
                "question": "Sorunu kısaca anlatır mısınız?",
            },
        ]
    )
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(occ.base, "get_request_collection_state", lambda *_args: next(states))
    monkeypatch.setattr(
        occ.base,
        "_resolve_order_candidate",
        lambda *_args, **_kwargs: {"durum": "başarılı", "order": None},
    )

    def _update(*args: Any, **kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs)
        return {"durum": "başarılı", "request": _request(version=8)}

    monkeypatch.setattr(occ, "update_return_issue_request_from_message", _update)

    result = occ._collect_into_request(
        seller_id=2,
        customer_id=14,
        request=_request(version=6),
        source_message_id=101,
        message_text="A-123",
        message_type="text",
        starting_control_version=3,
        urgent=False,
    )

    assert result["durum"] == "başarılı"
    assert result["awaiting"] == "reason"
    assert calls[0]["expected_version"] == 7


def test_reason_conflict_is_fail_closed(monkeypatch) -> None:
    monkeypatch.setattr(
        occ.base,
        "get_request_collection_state",
        lambda *_args: {
            "durum": "başarılı",
            "request": _request(version=7),
            "awaiting": "reason",
            "missing_fields": ["reason"],
            "ready_for_review": False,
            "question": "Sorunu kısaca anlatır mısınız?",
        },
    )
    monkeypatch.setattr(
        occ,
        "update_return_issue_request_from_message",
        lambda *args, **kwargs: {
            "durum": "çakışma",
            "mesaj": "İade/sorun talebi başka bir işlemle değişti.",
            "request": _request(version=8),
        },
    )

    result = occ._collect_into_request(
        seller_id=2,
        customer_id=14,
        request=_request(version=6),
        source_message_id=101,
        message_text="Ürün hasarlı geldi",
        message_type="text",
        starting_control_version=3,
        urgent=False,
    )

    assert result["durum"] == "hata"
    assert result["error_code"] == "return_issue_version_conflict"
    assert result["kind"] == "conflict"
    assert result["fail_closed"] is True
    assert result["outgoing_allowed"] is False


def test_evidence_conflict_is_not_treated_as_idempotent_success(monkeypatch) -> None:
    monkeypatch.setattr(
        occ.base,
        "get_request_collection_state",
        lambda *_args: {
            "durum": "başarılı",
            "request": _request(version=7),
            "awaiting": "image",
            "missing_fields": ["image"],
            "ready_for_review": False,
            "question": "Görsel gönderebilir misiniz?",
        },
    )
    calls: list[int] = []

    def _evidence(*args: Any, **kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs["expected_version"])
        return {
            "durum": "çakışma",
            "mesaj": "İade/sorun talebi başka bir işlemle değişti.",
            "request": _request(version=8),
        }

    monkeypatch.setattr(occ, "add_return_issue_request_evidence", _evidence)

    result = occ._collect_into_request(
        seller_id=2,
        customer_id=14,
        request=_request(version=6),
        source_message_id=101,
        message_text="",
        message_type="image",
        starting_control_version=3,
        urgent=False,
    )

    assert calls == [7]
    assert result["error_code"] == "return_issue_version_conflict"
    assert result["fail_closed"] is True
    assert result["outgoing_allowed"] is False


def test_review_transition_threads_request_and_control_versions(monkeypatch) -> None:
    review_calls: list[dict[str, Any]] = []
    control_calls: list[dict[str, Any]] = []

    def _review(*args: Any, **kwargs: Any) -> dict[str, Any]:
        review_calls.append(kwargs)
        return {
            "durum": "başarılı",
            "request": _request(version=9, status="SELLER_REVIEW_REQUIRED"),
            "notification_created": False,
        }

    def _control(**kwargs: Any) -> dict[str, Any]:
        control_calls.append(kwargs)
        return {"durum": "başarılı", "control": {}, "changed": False}

    monkeypatch.setattr(occ, "mark_return_issue_review_required", _review)
    monkeypatch.setattr(occ, "transition_conversation_control", _control)

    result = occ._collect_into_request(
        seller_id=2,
        customer_id=14,
        request=_request(version=9, status="SELLER_REVIEW_REQUIRED"),
        source_message_id=101,
        message_text="devam",
        message_type="text",
        starting_control_version=4,
        urgent=False,
    )

    assert result["durum"] == "başarılı"
    assert review_calls[0]["expected_version"] == 9
    assert control_calls[0]["expected_version"] == 4


def test_missing_request_version_is_fail_closed_before_mutation(monkeypatch) -> None:
    monkeypatch.setattr(
        occ.base,
        "get_request_collection_state",
        lambda *_args: {
            "durum": "başarılı",
            "request": _request(version=None),
            "awaiting": "reason",
            "missing_fields": ["reason"],
            "ready_for_review": False,
            "question": "Sorunu kısaca anlatır mısınız?",
        },
    )
    monkeypatch.setattr(
        occ,
        "update_return_issue_request_from_message",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("mutation must not run")),
    )

    result = occ._collect_into_request(
        seller_id=2,
        customer_id=14,
        request=_request(version=6),
        source_message_id=101,
        message_text="Hasarlı",
        message_type="text",
        starting_control_version=4,
        urgent=False,
    )

    assert result["error_code"] == "return_issue_version_unavailable"
    assert result["fail_closed"] is True
    assert result["outgoing_allowed"] is False

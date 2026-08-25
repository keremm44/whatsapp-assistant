from __future__ import annotations

from typing import Any

import chat_service.dependencies as deps
import chat_service.responses as responses
from chat_service.transport_context import (
    WHATSAPP_PENDING_OUTGOING_PROVIDER,
    current_outgoing_message_id,
    record_incoming_message_id,
    transport_scope,
)


def _active_control(version: int = 7) -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "control": {
            "state": deps.CONTROL_STATE_ASSISTANT_ACTIVE,
            "changed_at": "2026-08-22T10:00:00+00:00",
            "changed_by_profile_id": None,
            "reason_code": None,
            "reason_note": None,
            "resume_after_message_id": None,
            "version": version,
        },
    }


def test_outgoing_response_passes_source_and_expected_version_to_final_write(
    monkeypatch,
) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        responses.deps,
        "get_conversation_control",
        lambda **_kwargs: _active_control(),
    )

    def _save_message(**kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"durum": "başarılı", "message": {"id": 202}}

    monkeypatch.setattr(responses.deps, "save_message", _save_message)

    result = responses.outgoing_response(
        seller_id=11,
        customer_id=22,
        response_text="Merhaba",
        source="template",
        control_context={
            "incoming_message_id": 101,
            "starting_control_version": 7,
        },
        ai_confidence=0.95,
    )

    assert result["durum"] == "başarılı"
    assert captured["source_message_id"] == 101
    assert captured["expected_control_version"] == 7
    assert captured["was_auto_replied"] is True


def test_final_write_suppression_wins_even_after_fail_fast_check_passes(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        responses.deps,
        "get_conversation_control",
        lambda **_kwargs: _active_control(),
    )
    monkeypatch.setattr(
        responses.deps,
        "save_message",
        lambda **_kwargs: {
            "durum": "bastırıldı",
            "reason_code": "outgoing_suppressed_control_changed",
            "mesaj": "Konuşma kontrolü otomatik yanıta kapatıldı veya sürümü değişti.",
        },
    )

    result = responses.outgoing_response(
        seller_id=11,
        customer_id=22,
        response_text="Bu cevap artık yazılmamalı",
        source="template",
        control_context={
            "incoming_message_id": 101,
            "starting_control_version": 7,
        },
    )

    assert result["durum"] == "otomatik_yanıt_yok"
    assert result["cevap"] is None
    assert result["reason_code"] == "outgoing_suppressed_control_changed"
    assert result["incoming_message_id"] == 101


def test_whatsapp_guard_uses_request_local_source_and_records_outgoing_id(
    monkeypatch,
) -> None:
    captured: dict[str, Any] = {}

    def _persist(**kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"durum": "başarılı", "message": {"id": 202}}

    monkeypatch.setattr(deps, "_database_persist_guarded_auto_reply", _persist)

    with transport_scope(WHATSAPP_PENDING_OUTGOING_PROVIDER):
        record_incoming_message_id(101)
        result = deps.save_message(
            seller_id=11,
            customer_id=22,
            direction="outgoing",
            content="Merhaba",
            was_auto_replied=True,
            source_message_id=101,
            expected_control_version=7,
        )
        recorded_outgoing_id = current_outgoing_message_id()

    assert result["durum"] == "başarılı"
    assert captured["provider"] == WHATSAPP_PENDING_OUTGOING_PROVIDER
    assert captured["source_message_id"] == 101
    assert captured["expected_control_version"] == 7
    assert recorded_outgoing_id == 202


def test_whatsapp_guard_rejects_source_context_mismatch(monkeypatch) -> None:
    def _unexpected(**_kwargs: Any) -> dict[str, Any]:
        raise AssertionError("guarded RPC must not be called")

    monkeypatch.setattr(deps, "_database_persist_guarded_auto_reply", _unexpected)

    with transport_scope(WHATSAPP_PENDING_OUTGOING_PROVIDER):
        record_incoming_message_id(101)
        result = deps.save_message(
            seller_id=11,
            customer_id=22,
            direction="outgoing",
            content="Merhaba",
            was_auto_replied=True,
            source_message_id=102,
            expected_control_version=7,
        )

    assert result["durum"] == "hata"


def test_unguarded_internal_persistence_keeps_legacy_path(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    def _legacy(**kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"durum": "başarılı", "message": {"id": 303}}

    monkeypatch.setattr(deps, "_database_save_message", _legacy)

    result = deps.save_message(
        seller_id=11,
        customer_id=22,
        direction="outgoing",
        content="Manuel/legacy yol",
        provider="internal",
    )

    assert result["durum"] == "başarılı"
    assert captured["direction"] == "outgoing"
    assert "source_message_id" not in captured
    assert "expected_control_version" not in captured

from __future__ import annotations

from typing import Any

import pytest

import chat_service
import chat_service.dependencies as deps
from chat_service import transport_context


def _message_result(status: str, message_id: int | None) -> dict[str, Any]:
    return {
        "durum": status,
        "message": {"id": message_id} if message_id is not None else None,
    }


def test_internal_scope_preserves_legacy_save_message_path(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_database_save(**kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs)
        return _message_result("başarılı", 10)

    def unexpected_whatsapp_save(**kwargs: Any) -> dict[str, Any]:
        raise AssertionError("WhatsApp bridge must not run for internal chat")

    monkeypatch.setattr(deps, "_database_save_message", fake_database_save)
    monkeypatch.setattr(
        deps,
        "save_whatsapp_pending_outgoing_message",
        unexpected_whatsapp_save,
    )

    with transport_context.transport_scope("internal"):
        result = deps.save_message(
            seller_id=2,
            customer_id=3,
            direction="outgoing",
            content="Merhaba",
            provider="internal",
        )

    assert result["durum"] == "başarılı"
    assert calls == [
        {
            "seller_id": 2,
            "customer_id": 3,
            "direction": "outgoing",
            "content": "Merhaba",
            "message_type": "text",
            "media_url": None,
            "was_auto_replied": False,
            "ai_confidence": None,
            "provider": "internal",
            "provider_message_id": None,
        }
    ]


def test_whatsapp_scope_correlates_outgoing_to_persisted_incoming(monkeypatch) -> None:
    bridge_calls: list[dict[str, Any]] = []

    def fake_database_save(**kwargs: Any) -> dict[str, Any]:
        assert kwargs["direction"] == "incoming"
        assert kwargs["provider"] == "whatsapp_cloud"
        return _message_result("başarılı", 1001)

    def fake_whatsapp_save(**kwargs: Any) -> dict[str, Any]:
        bridge_calls.append(kwargs)
        return _message_result("başarılı", 1002)

    monkeypatch.setattr(deps, "_database_save_message", fake_database_save)
    monkeypatch.setattr(
        deps,
        "save_whatsapp_pending_outgoing_message",
        fake_whatsapp_save,
    )

    with transport_context.transport_scope("whatsapp_cloud_pending"):
        incoming = deps.save_message(
            seller_id=2,
            customer_id=3,
            direction="incoming",
            content="Merhaba",
            provider="whatsapp_cloud",
            provider_message_id="wamid.in-1",
        )
        outgoing = deps.save_message(
            seller_id=2,
            customer_id=3,
            direction="outgoing",
            content="Merhaba, nasıl yardımcı olabilirim?",
            was_auto_replied=True,
        )

        assert transport_context.current_incoming_message_id() == 1001
        assert transport_context.current_outgoing_message_id() == 1002

    assert incoming["durum"] == "başarılı"
    assert outgoing["durum"] == "başarılı"
    assert bridge_calls == [
        {
            "seller_id": 2,
            "customer_id": 3,
            "source_message_id": 1001,
            "content": "Merhaba, nasıl yardımcı olabilirim?",
            "message_type": "text",
            "media_url": None,
            "was_auto_replied": True,
            "ai_confidence": None,
        }
    ]


def test_whatsapp_duplicate_inbound_recovers_existing_message_id(monkeypatch) -> None:
    monkeypatch.setattr(
        deps,
        "_database_save_message",
        lambda **kwargs: _message_result("duplicate", None),
    )
    monkeypatch.setattr(
        deps,
        "_database_check_message_duplicate",
        lambda **kwargs: {
            "durum": "başarılı",
            "duplicate": True,
            "message": {"id": 1001, "provider_message_id": "wamid.in-1"},
        },
    )

    with transport_context.transport_scope("whatsapp_cloud_pending"):
        result = deps.save_message(
            seller_id=2,
            customer_id=3,
            direction="incoming",
            content="Merhaba",
            provider="whatsapp_cloud",
            provider_message_id="wamid.in-1",
        )

        assert result["durum"] == "duplicate"
        assert result["message"]["id"] == 1001
        assert transport_context.current_incoming_message_id() == 1001


def test_whatsapp_outgoing_fails_closed_without_incoming_correlation(monkeypatch) -> None:
    def unexpected_whatsapp_save(**kwargs: Any) -> dict[str, Any]:
        raise AssertionError("bridge must not run without a source message")

    monkeypatch.setattr(
        deps,
        "save_whatsapp_pending_outgoing_message",
        unexpected_whatsapp_save,
    )

    with transport_context.transport_scope("whatsapp_cloud_pending"):
        result = deps.save_message(
            seller_id=2,
            customer_id=3,
            direction="outgoing",
            content="Merhaba",
        )

    assert result["durum"] == "hata"


def test_transport_scope_resets_after_exception() -> None:
    assert transport_context.current_outgoing_provider() == "internal"
    assert transport_context.current_incoming_message_id() is None

    with pytest.raises(RuntimeError):
        with transport_context.transport_scope("whatsapp_cloud_pending"):
            transport_context.record_incoming_message_id(44)
            transport_context.record_outgoing_message_id(45)
            raise RuntimeError("boom")

    assert transport_context.current_outgoing_provider() == "internal"
    assert transport_context.current_incoming_message_id() is None
    assert transport_context.current_outgoing_message_id() is None


def test_chat_facade_augments_transport_ids_without_changing_internal_result(
    monkeypatch,
) -> None:
    def fake_orchestrator(**kwargs: Any) -> dict[str, Any]:
        transport_context.record_incoming_message_id(1001)
        transport_context.record_outgoing_message_id(1002)
        return {"durum": "başarılı", "cevap": "ok"}

    monkeypatch.setattr(chat_service.orchestrator, "sohbet_isle", fake_orchestrator)

    whatsapp_result = chat_service.sohbet_isle(
        seller_id=2,
        whatsapp_number="905551112233",
        kullanici_mesaji="Merhaba",
        provider="whatsapp_cloud",
        provider_message_id="wamid.in-1",
        outgoing_provider="whatsapp_cloud_pending",
    )
    internal_result = chat_service.sohbet_isle(
        seller_id=2,
        whatsapp_number="905551112233",
        kullanici_mesaji="Merhaba",
    )

    assert whatsapp_result["incoming_message_id"] == 1001
    assert whatsapp_result["outgoing_message_id"] == 1002
    assert "incoming_message_id" not in internal_result
    assert "outgoing_message_id" not in internal_result


def test_chat_facade_rejects_unknown_outgoing_provider_before_orchestrator(
    monkeypatch,
) -> None:
    def unexpected_orchestrator(**kwargs: Any) -> dict[str, Any]:
        raise AssertionError("orchestrator must not run")

    monkeypatch.setattr(chat_service.orchestrator, "sohbet_isle", unexpected_orchestrator)

    with pytest.raises(ValueError):
        chat_service.sohbet_isle(
            seller_id=2,
            whatsapp_number="905551112233",
            kullanici_mesaji="Merhaba",
            outgoing_provider="forged-provider",
        )

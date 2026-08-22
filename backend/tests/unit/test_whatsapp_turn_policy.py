from __future__ import annotations

from whatsapp_webhook.models import InboundMessageEvent
from whatsapp_webhook.turn_policy import (
    TURN_DEBOUNCE_SECONDS,
    TURN_MAX_SECONDS,
    should_process_immediately,
    turn_timing,
)


def _event(text: str, *, message_type: str = "text") -> InboundMessageEvent:
    return InboundMessageEvent(
        "phone-1",
        "wamid.1",
        "905551112233",
        "1",
        message_type,
        text,
        None,
        None,
    )


def test_plain_information_uses_four_second_debounce() -> None:
    event = _event("45892 sipariş numaram")
    assert should_process_immediately(event) is False
    assert turn_timing(event) == (TURN_DEBOUNCE_SECONDS, TURN_MAX_SECONDS)
    assert TURN_DEBOUNCE_SECONDS == 4
    assert TURN_MAX_SECONDS == 12


def test_direct_question_with_question_mark_is_immediate() -> None:
    assert turn_timing(_event("Sipariş numarasını nereden bulacağım?"))[0] == 0


def test_direct_question_without_question_mark_is_immediate() -> None:
    assert turn_timing(_event("sipariş numarasını nereden bulurum"))[0] == 0
    assert turn_timing(_event("kaç görsel gönderebilirim"))[0] == 0


def test_greeting_only_is_immediate_but_greeting_plus_information_can_buffer() -> None:
    assert turn_timing(_event("Merhaba"))[0] == 0
    assert turn_timing(_event("Merhaba sipariş numaram 45892"))[0] == 4


def test_common_return_or_damage_language_flushes_the_turn_immediately() -> None:
    assert turn_timing(_event("ürün kırık geldi"))[0] == 0
    assert turn_timing(_event("iade etmek istiyorum"))[0] == 0
    assert turn_timing(_event("yanlış ürün göndermişsiniz"))[0] == 0


def test_followup_information_stays_bufferable() -> None:
    assert turn_timing(_event("üzerine Elif yazılacak"))[0] == 4
    assert turn_timing(_event("fotoğrafı da atıyorum"))[0] == 4


def test_non_text_keeps_existing_immediate_runtime_behavior() -> None:
    assert turn_timing(_event("", message_type="image"))[0] == 0

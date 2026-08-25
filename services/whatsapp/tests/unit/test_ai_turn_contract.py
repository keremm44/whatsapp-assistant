from __future__ import annotations

from ai_turn_contract import canonicalize_turn_payload


def _payload(
    intent: str,
    *,
    kind: str = "unknown",
    actions=None,
    detected_intents=None,
    **turn_overrides,
):
    turn = {
        "kind": kind,
        "actions": list(actions or []),
        "direct_question": False,
        "expects_more": False,
        "expects_attachment": False,
        "correction_requested": False,
        "seller_attention_requested": False,
    }
    turn.update(turn_overrides)
    return {
        "intent": intent,
        "confidence": 0.95,
        "detected_intents": detected_intents
        if detected_intents is not None
        else [{"intent": intent, "confidence": 0.95}],
        "turn": turn,
    }


def test_invalid_kind_is_repaired_from_direct_question() -> None:
    result = canonicalize_turn_payload(
        _payload("material_question", kind="product_query", direct_question=True)
    )
    assert result["turn"]["kind"] == "question"
    assert result["turn"]["actions"] == ["ask_question"]


def test_invalid_actions_are_dropped_before_contract_validation() -> None:
    result = canonicalize_turn_payload(
        _payload(
            "shipping_time",
            kind="question",
            actions=["invent_answer", "ask_question", "invent_answer"],
            direct_question=True,
        )
    )
    assert result["turn"]["actions"] == ["ask_question"]


def test_greeting_gets_greeting_kind_and_action() -> None:
    result = canonicalize_turn_payload(_payload("greeting"))
    assert result["turn"]["kind"] == "greeting"
    assert result["turn"]["actions"] == ["greet"]


def test_order_confirmation_gets_confirmation_kind() -> None:
    result = canonicalize_turn_payload(_payload("order_confirmation_yes"))
    assert result["turn"]["kind"] == "confirmation"


def test_correction_for_personalization_repairs_kind_and_actions() -> None:
    result = canonicalize_turn_payload(
        _payload(
            "design_request",
            kind="edit_request",
            correction_requested=True,
        )
    )
    assert result["turn"]["kind"] == "correction"
    assert result["turn"]["actions"] == [
        "revise_previous_information",
        "provide_personalization",
    ]


def test_direct_return_and_human_request_is_mixed() -> None:
    result = canonicalize_turn_payload(
        _payload(
            "return_request",
            detected_intents=[{"intent": "return_request", "confidence": 0.95}],
            direct_question=True,
            seller_attention_requested=True,
        )
    )
    assert result["turn"]["kind"] == "mixed"
    assert set(result["turn"]["actions"]) == {
        "ask_question",
        "request_seller",
        "request_return_or_change",
    }


def test_plain_custom_text_statement_is_personalization_information() -> None:
    result = canonicalize_turn_payload(_payload("custom_text_question"))
    assert result["turn"]["kind"] == "information"
    assert result["turn"]["actions"] == ["provide_personalization"]


def test_generic_image_question_does_not_invent_personalization_data() -> None:
    result = canonicalize_turn_payload(
        _payload("image_question", direct_question=True)
    )
    assert result["turn"]["kind"] == "question"
    assert result["turn"]["actions"] == ["ask_question"]


def test_question_mark_repairs_model_false_question_flag() -> None:
    result = canonicalize_turn_payload(
        _payload("design_request", direct_question=False),
        message="Logoyu biraz küçültüp alta alabilir misiniz?",
    )
    assert result["turn"]["direct_question"] is True
    assert "ask_question" in result["turn"]["actions"]
    assert result["turn"]["kind"] == "question"


def test_question_particle_without_question_mark_is_detected() -> None:
    result = canonicalize_turn_payload(
        _payload("shipping_company", direct_question=False),
        message="Aras Kargo ile mi gönderiyorsunuz",
    )
    assert result["turn"]["direct_question"] is True
    assert result["turn"]["actions"] == ["ask_question"]
    assert result["turn"]["kind"] == "question"


def test_question_word_without_question_mark_is_detected() -> None:
    result = canonicalize_turn_payload(
        _payload("shipping_time", direct_question=False),
        message="Kaç günde kargoya verirsiniz",
    )
    assert result["turn"]["direct_question"] is True
    assert result["turn"]["actions"] == ["ask_question"]


def test_plain_information_is_not_promoted_to_question() -> None:
    result = canonicalize_turn_payload(
        _payload("custom_text_question", direct_question=False),
        message="Baskıda Ece yazsın",
    )
    assert result["turn"]["direct_question"] is False
    assert "ask_question" not in result["turn"]["actions"]


def test_bare_ne_exclamation_is_not_question() -> None:
    result = canonicalize_turn_payload(
        _payload("unclear", direct_question=False),
        message="Ne güzel olmuş, böyle kalsın.",
    )
    assert result["turn"]["direct_question"] is False
    assert "ask_question" not in result["turn"]["actions"]


def test_attachment_expectation_adds_announce_attachment() -> None:
    result = canonicalize_turn_payload(
        _payload("image_question", expects_attachment=True),
        message="Fotoğrafı birazdan göndereceğim",
    )
    assert "announce_attachment" in result["turn"]["actions"]


def test_image_mapping_adds_personalization_without_new_attachment() -> None:
    result = canonicalize_turn_payload(
        _payload("image_question", expects_attachment=False),
        message="Birinci fotoğraf ön yüzde, ikinci fotoğraf arka yüzde kullanılsın.",
    )
    assert "provide_personalization" in result["turn"]["actions"]
    assert "announce_attachment" not in result["turn"]["actions"]
    assert result["turn"]["kind"] == "information"

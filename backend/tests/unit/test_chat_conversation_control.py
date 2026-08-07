from __future__ import annotations

from typing import Any

import pytest

import chat_service


def active_seller(**patch: Any) -> dict[str, Any]:
    seller = {
        "id": 11,
        "store_link": "https://example.com/store",
        "product_info": {},
        "emergency_paused": False,
        "ai_enabled": True,
        "onboarding_completed": True,
        "system_status": "active",
    }
    seller.update(patch)
    return seller


def control(
    state: str = chat_service.CONTROL_STATE_ASSISTANT_ACTIVE,
    *,
    version: int = 1,
    cursor: int | None = None,
) -> dict[str, Any]:
    return {
        "state": state,
        "changed_at": "2026-08-06T12:00:00+00:00",
        "changed_by_profile_id": None,
        "reason_code": None,
        "reason_note": None,
        "resume_after_message_id": cursor,
        "version": version,
    }


def classification(intent: str = "greeting") -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "intent": intent,
        "confidence": 0.99,
        "alternatives": [],
    }


class ChatHarness:
    def __init__(self) -> None:
        self.events: list[str] = []
        self.saved_messages: list[dict[str, Any]] = []
        self.control_reads: list[tuple[int, int]] = []
        self.control_transitions: list[dict[str, Any]] = []
        self.flow_transitions: list[dict[str, Any]] = []
        self.notifications: list[dict[str, Any]] = []
        self.unanswered: list[dict[str, Any]] = []
        self.classifier_calls = 0
        self.incoming_id = 101
        self.customer: dict[str, Any] = {
            "id": 22,
            "seller_id": 11,
            "is_blocked": False,
            "muted_until": None,
        }
        self.seller = active_seller()
        self.flow_state: dict[str, Any] = {
            "current_state": "NORMAL",
            "state_data": {},
        }
        self.controls = [control(), control()]
        self.classification_result = classification()
        self.incoming_result: dict[str, Any] | None = None
        self.rules: list[dict[str, Any]] = []
        self.violation_count = 0
        self.active_return_request: dict[str, Any] | None = None
        self.return_issue_calls: list[dict[str, Any]] = []
        self.return_issue_result: dict[str, Any] = {
            "durum": "başarılı",
            "state": "collecting",
            "request": {"id": 501, "status": "COLLECTING"},
            "awaiting": "order_number",
            "question": "Sipariş numaranızı paylaşır mısınız?",
            "review_required": False,
            "outgoing_allowed": True,
        }

    def install(self, monkeypatch: pytest.MonkeyPatch) -> "ChatHarness":
        monkeypatch.setattr(
            chat_service,
            "get_seller_by_id",
            lambda seller_id: self._seller_result(seller_id),
        )
        monkeypatch.setattr(
            chat_service,
            "get_or_create_customer",
            lambda **kwargs: self._customer_result(**kwargs),
        )
        monkeypatch.setattr(chat_service, "save_message", self.save_message)
        monkeypatch.setattr(
            chat_service,
            "get_conversation_control",
            self.get_control,
        )
        monkeypatch.setattr(
            chat_service,
            "is_customer_muted",
            lambda customer: bool(customer.get("muted_until")),
        )
        monkeypatch.setattr(
            chat_service,
            "get_state",
            lambda **kwargs: self._state_result(**kwargs),
        )
        monkeypatch.setattr(
            chat_service,
            "classify_intent",
            self.classify_intent,
        )
        monkeypatch.setattr(
            chat_service,
            "intent_is_safe",
            lambda result: (
                result.get("durum") == "başarılı"
                and result.get("intent") != "unclear"
                and float(result.get("confidence") or 0) >= 0.8
            ),
        )
        monkeypatch.setattr(
            chat_service,
            "get_active_rules",
            lambda seller_id: {"durum": "başarılı", "kurallar": self.rules},
        )
        monkeypatch.setattr(
            chat_service,
            "increment_rule_hit_count",
            lambda rule_id: self.events.append("rule_hit") or {"durum": "başarılı"},
        )
        monkeypatch.setattr(
            chat_service,
            "transition_state",
            self.transition_state,
        )
        monkeypatch.setattr(
            chat_service,
            "transition_conversation_control",
            self.transition_control,
        )
        monkeypatch.setattr(
            chat_service,
            "create_seller_notification",
            self.create_notification,
        )
        monkeypatch.setattr(
            chat_service,
            "unanswered_record_question",
            self.save_unanswered,
        )
        monkeypatch.setattr(
            chat_service,
            "unanswered_find_saved_answer",
            lambda *args, **kwargs: {"durum": "başarılı", "matched": False, "group": None},
        )
        monkeypatch.setattr(
            chat_service,
            "count_recent_violations",
            lambda **kwargs: {"durum": "başarılı", "count": self.violation_count},
        )
        monkeypatch.setattr(
            chat_service,
            "record_violation",
            lambda **kwargs: self.events.append("record_violation")
            or {"durum": "başarılı", "violation": {"id": 71}},
        )
        monkeypatch.setattr(
            chat_service,
            "block_customer",
            lambda **kwargs: self.events.append("block_customer")
            or {"durum": "başarılı"},
        )
        monkeypatch.setattr(
            chat_service,
            "mute_customer",
            lambda **kwargs: self.events.append("mute_customer")
            or {"durum": "başarılı"},
        )
        monkeypatch.setattr(
            chat_service,
            "get_active_return_issue_request",
            lambda **kwargs: {
                "durum": "başarılı",
                "request": self.active_return_request,
            },
        )
        monkeypatch.setattr(
            chat_service,
            "return_issue_process_message",
            self.return_issue_process_message,
        )
        return self

    def _seller_result(self, seller_id: int) -> dict[str, Any]:
        self.events.append("seller")
        return {"durum": "başarılı", "satıcı": self.seller}

    def _customer_result(self, **_kwargs: Any) -> dict[str, Any]:
        self.events.append("customer")
        return {"durum": "mevcut", "customer": self.customer}

    def save_message(self, **kwargs: Any) -> dict[str, Any]:
        direction = kwargs["direction"]
        self.events.append(f"save_{direction}")
        self.saved_messages.append(kwargs)

        if direction == "incoming":
            if self.incoming_result is not None:
                return self.incoming_result
            return {"durum": "başarılı", "message": {"id": self.incoming_id}}

        return {"durum": "başarılı", "message": {"id": 201}}

    def get_control(self, seller_id: int, customer_id: int) -> dict[str, Any]:
        self.events.append("control")
        self.control_reads.append((seller_id, customer_id))
        index = min(len(self.control_reads) - 1, len(self.controls) - 1)
        value = self.controls[index]
        if "durum" in value:
            return value
        return {"durum": "başarılı", "control": value}

    def _state_result(self, **_kwargs: Any) -> dict[str, Any]:
        self.events.append("get_state")
        return {"durum": "başarılı", "state": self.flow_state}

    def classify_intent(self, _message: str) -> dict[str, Any]:
        self.events.append("classify")
        self.classifier_calls += 1
        return self.classification_result

    def return_issue_process_message(self, **kwargs: Any) -> dict[str, Any]:
        self.events.append("return_issue")
        self.return_issue_calls.append(kwargs)
        return self.return_issue_result

    def transition_state(self, **kwargs: Any) -> dict[str, Any]:
        self.events.append("flow_transition")
        self.flow_transitions.append(kwargs)
        return {"durum": "başarılı", "state": {"current_state": kwargs["to_state"]}}

    def transition_control(self, **kwargs: Any) -> dict[str, Any]:
        self.events.append("control_transition")
        self.control_transitions.append(kwargs)
        return {
            "durum": "başarılı",
            "changed": True,
            "control": control(kwargs["to_control_state"], version=2),
        }

    def create_notification(self, **kwargs: Any) -> dict[str, Any]:
        self.events.append("notification")
        self.notifications.append(kwargs)
        return {"durum": "başarılı", "notification": {"id": 81}}

    def save_unanswered(self, **kwargs: Any) -> dict[str, Any]:
        self.events.append("unanswered")
        self.unanswered.append(kwargs)
        return {"durum": "başarılı", "answer_available": False, "group": {"id": 91}, "notification_created": True}

    def send(self, message: str = "Merhaba", **kwargs: Any) -> dict[str, Any]:
        return chat_service.sohbet_isle(
            seller_id=11,
            whatsapp_number="+905551112233",
            kullanici_mesaji=message,
            provider="unit",
            provider_message_id=kwargs.pop("provider_message_id", "msg-1"),
            **kwargs,
        )


@pytest.fixture
def harness(monkeypatch: pytest.MonkeyPatch) -> ChatHarness:
    return ChatHarness().install(monkeypatch)


def assert_only_incoming(harness: ChatHarness) -> None:
    assert [item["direction"] for item in harness.saved_messages] == ["incoming"]


def test_incoming_is_saved_before_lifecycle_security_and_control(
    harness: ChatHarness,
) -> None:
    result = harness.send()

    assert result["durum"] == "başarılı"
    assert harness.events[:5] == [
        "seller",
        "customer",
        "save_incoming",
        "control",
        "get_state",
    ]


@pytest.mark.parametrize(
    ("customer_patch", "expected_reason"),
    [
        ({"is_blocked": True}, "stored_customer_blocked"),
        ({"muted_until": "2099-01-01T00:00:00+00:00"}, "stored_customer_muted"),
    ],
)
def test_blocked_and_muted_customers_are_stored_then_paused(
    harness: ChatHarness,
    customer_patch: dict[str, Any],
    expected_reason: str,
) -> None:
    harness.customer.update(customer_patch)

    result = harness.send()

    assert result["reason_code"] == expected_reason
    assert harness.events.index("save_incoming") < harness.events.index("control")
    assert harness.control_transitions[0]["to_control_state"] == "ASSISTANT_PAUSED"
    assert harness.control_transitions[0]["trigger_message_id"] == 101
    assert harness.classifier_calls == 0
    assert harness.flow_transitions == []
    assert_only_incoming(harness)


def test_already_paused_blocked_customer_does_not_create_another_transition(
    harness: ChatHarness,
) -> None:
    harness.customer["is_blocked"] = True
    harness.controls = [control("ASSISTANT_PAUSED")]

    result = harness.send()

    assert result["reason_code"] == "stored_customer_blocked"
    assert harness.control_transitions == []
    assert_only_incoming(harness)


@pytest.mark.parametrize(
    ("seller_patch", "reason_suffix"),
    [
        ({"emergency_paused": True}, "emergency_paused"),
        ({"ai_enabled": False}, "ai_disabled"),
        ({"onboarding_completed": False}, "onboarding_incomplete"),
        ({"system_status": "suspended"}, "inactive_status"),
    ],
)
def test_seller_lifecycle_block_still_persists_incoming(
    harness: ChatHarness,
    seller_patch: dict[str, Any],
    reason_suffix: str,
) -> None:
    harness.seller.update(seller_patch)

    result = harness.send()

    assert result["reason_code"] == f"stored_seller_{reason_suffix}"
    assert "save_incoming" in harness.events
    assert "control" not in harness.events
    assert_only_incoming(harness)


def test_incoming_failure_stops_all_automation(harness: ChatHarness) -> None:
    harness.incoming_result = {"durum": "hata", "mesaj": "secret database error"}

    result = harness.send()

    assert result["reason_code"] == "incoming_persist_failed"
    assert "secret" not in result["mesaj"]
    assert harness.classifier_calls == 0
    assert harness.control_reads == []
    assert_only_incoming(harness)


def test_missing_incoming_id_stops_all_automation(harness: ChatHarness) -> None:
    harness.incoming_result = {"durum": "başarılı", "message": {}}

    result = harness.send()

    assert result["reason_code"] == "incoming_message_id_unavailable"
    assert harness.control_reads == []
    assert harness.classifier_calls == 0


def test_duplicate_second_delivery_has_no_second_side_effect(
    harness: ChatHarness,
) -> None:
    first = harness.send(provider_message_id="duplicate-1")
    first_effect_count = len(harness.events)
    harness.incoming_result = {"durum": "duplicate", "message": {"id": 101}}

    second = harness.send(provider_message_id="duplicate-1")

    assert first["durum"] == "başarılı"
    assert second["durum"] == "duplicate"
    assert harness.classifier_calls == 1
    assert len(harness.control_reads) == 2
    assert harness.events[first_effect_count:] == ["seller", "customer", "save_incoming"]
    assert [item["direction"] for item in harness.saved_messages] == [
        "incoming",
        "outgoing",
        "incoming",
    ]


@pytest.mark.parametrize(
    ("state", "reason"),
    [
        ("SELLER_TAKEN_OVER", "stored_seller_taken_over"),
        ("RETURN_REVIEW", "stored_return_review"),
        ("ASSISTANT_PAUSED", "stored_assistant_paused"),
    ],
)
def test_inactive_control_states_store_but_do_not_process(
    harness: ChatHarness,
    state: str,
    reason: str,
) -> None:
    harness.controls = [control(state)]

    result = harness.send()

    assert result["reason_code"] == reason
    assert harness.control_reads == [(11, 22)]
    assert harness.classifier_calls == 0
    assert "get_state" not in harness.events
    assert harness.flow_transitions == []
    assert_only_incoming(harness)


def test_control_lookup_failure_is_fail_closed(harness: ChatHarness) -> None:
    harness.controls = [{"durum": "bulunamadı"}]

    result = harness.send()

    assert result["reason_code"] == "stored_control_unavailable"
    assert harness.classifier_calls == 0
    assert_only_incoming(harness)


@pytest.mark.parametrize(
    ("incoming_id", "cursor", "should_reply"),
    [
        (101, 100, True),
        (101, 101, False),
        (101, 102, False),
    ],
)
def test_resume_cursor_uses_numeric_strictly_greater_rule(
    harness: ChatHarness,
    incoming_id: int,
    cursor: int,
    should_reply: bool,
) -> None:
    harness.incoming_id = incoming_id
    harness.controls = [control(cursor=cursor), control(cursor=cursor)]

    result = harness.send()

    if should_reply:
        assert result["durum"] == "başarılı"
        assert [item["direction"] for item in harness.saved_messages] == [
            "incoming",
            "outgoing",
        ]
    else:
        assert result["reason_code"] == "stored_before_resume_cursor"
        assert "get_state" not in harness.events
        assert harness.classifier_calls == 0
        assert_only_incoming(harness)


@pytest.mark.parametrize(
    ("second_control", "expected_reason"),
    [
        (control("SELLER_TAKEN_OVER", version=2), "outgoing_suppressed_control_changed"),
        (control(version=2), "outgoing_suppressed_control_changed"),
        (control(version=1, cursor=101), "outgoing_suppressed_before_resume_cursor"),
        ({"durum": "hata"}, "outgoing_suppressed_control_unavailable"),
    ],
)
def test_candidate_response_is_suppressed_when_final_control_changes(
    harness: ChatHarness,
    second_control: dict[str, Any],
    expected_reason: str,
) -> None:
    harness.controls = [control(), second_control]

    result = harness.send()

    assert result["reason_code"] == expected_reason
    assert harness.classifier_calls == 1
    assert_only_incoming(harness)


@pytest.mark.parametrize("response_path", ["template", "rule", "flow"])
def test_every_automatic_response_path_uses_final_control_guard(
    harness: ChatHarness,
    response_path: str,
) -> None:
    harness.controls = [control(), control("SELLER_TAKEN_OVER", version=2)]

    if response_path == "rule":
        harness.classification_result = classification("material_question")
        harness.rules = [
            {"id": 5, "trigger_text": "malzeme", "response_text": "Seramiktir."}
        ]
        message = "Malzeme nedir?"
    elif response_path == "flow":
        harness.flow_state = {
            "current_state": "AWAITING_ORDER_NUMBER",
            "state_data": {},
        }
        message = "ETSY-12345"
    else:
        message = "Merhaba"

    result = harness.send(message)

    assert result["reason_code"] == "outgoing_suppressed_control_changed"
    assert_only_incoming(harness)


def test_critical_violation_pauses_with_incoming_trigger(
    harness: ChatHarness,
) -> None:
    result = harness.send("Sizi öldürürüm")

    assert result["aksiyon"] == "blocked"
    assert harness.events.index("save_incoming") < harness.events.index("record_violation")
    transition = harness.control_transitions[0]
    assert transition["to_control_state"] == "ASSISTANT_PAUSED"
    assert transition["reason_code"] == "security"
    assert transition["trigger_message_id"] == 101
    assert transition["expected_version"] == 1
    assert_only_incoming(harness)


def test_second_violation_mutes_and_pauses(harness: ChatHarness) -> None:
    harness.violation_count = 1

    result = harness.send("Aptal mısınız?")

    assert result["aksiyon"] == "muted_24h"
    assert "mute_customer" in harness.events
    assert harness.control_transitions[0]["reason_code"] == "violation"
    assert_only_incoming(harness)


def test_light_first_violation_keeps_existing_threshold(harness: ChatHarness) -> None:
    result = harness.send("Salak mısınız?")

    assert result["aksiyon"] == "seller_notified"
    assert harness.control_transitions == []
    assert "block_customer" not in harness.events
    assert "mute_customer" not in harness.events
    assert_only_incoming(harness)


def test_return_request_starts_persistent_collection_without_direct_review(
    harness: ChatHarness,
) -> None:
    harness.classification_result = classification("return_request")

    result = harness.send("Ürünü iade etmek istiyorum")

    assert result["durum"] == "başarılı"
    assert result["kaynak"] == "return_issue"
    assert result["cevap"] == "Sipariş numaranızı paylaşır mısınız?"
    assert harness.notifications == []
    assert harness.control_transitions == []
    assert harness.return_issue_calls == [{
        "seller_id": 11,
        "customer_id": 22,
        "source_message_id": 101,
        "message_text": "Ürünü iade etmek istiyorum",
        "message_type": "text",
        "intent": "return_request",
        "starting_control_version": 1,
    }]
    assert harness.flow_transitions == []


def test_return_service_fail_closed_never_continues_normal_flow(
    harness: ChatHarness,
) -> None:
    harness.classification_result = classification("complaint")
    harness.return_issue_result = {
        "durum": "hata",
        "error_code": "return_issue_review_transition_failed",
        "mesaj": "Talep kaydedildi fakat control güncellenemedi.",
        "kind": "conflict",
        "fail_closed": True,
        "outgoing_allowed": False,
        "request": {"id": 501, "status": "SELLER_REVIEW_REQUIRED"},
        "notification_created": True,
    }

    result = harness.send("Ürün kırık geldi")

    assert result["reason_code"] == "return_issue_review_transition_failed"
    assert result["notification_created"] is True
    assert result["fail_closed"] is True
    assert harness.flow_transitions == []
    assert_only_incoming(harness)


def test_next_message_in_return_review_is_only_stored(harness: ChatHarness) -> None:
    harness.controls = [control("RETURN_REVIEW")]

    result = harness.send("Sipariş numaram 1234567")

    assert result["reason_code"] == "stored_return_review"
    assert harness.classifier_calls == 0
    assert harness.flow_transitions == []
    assert_only_incoming(harness)


def test_unknown_question_escalates_without_changing_control_or_flow(
    harness: ChatHarness,
) -> None:
    harness.classification_result = classification("unclear")
    harness.classification_result["confidence"] = 0.1

    result = harness.send("Özel kaplama yoğunluğu nedir?")

    assert result["durum"] == "başarılı"
    assert len(harness.unanswered) == 1
    assert len(harness.notifications) == 0
    assert harness.control_transitions == []
    assert harness.flow_transitions == []
    assert all(
        transition.get("to_state") != "AWAITING_SELLER"
        for transition in harness.flow_transitions
    )
    assert [item["direction"] for item in harness.saved_messages] == [
        "incoming",
        "outgoing",
    ]


def test_active_conversation_can_answer_after_an_unknown_question(
    harness: ChatHarness,
) -> None:
    harness.classification_result = classification("unclear")
    harness.classification_result["confidence"] = 0.1
    first = harness.send("Bilinmeyen soru", provider_message_id="unknown-1")
    harness.classification_result = classification("greeting")
    harness.controls.extend([control(), control()])
    second = harness.send("Merhaba", provider_message_id="safe-2")

    assert first["durum"] == "başarılı"
    assert second["durum"] == "başarılı"
    assert second["kaynak"] == "template"
    assert harness.control_transitions == []
    assert harness.flow_transitions == []


@pytest.mark.parametrize(
    ("flow_state", "message", "message_type", "media_url", "expected_state"),
    [
        ("AWAITING_ORDER_NUMBER", "ETSY-12345", "text", None, "AWAITING_IMAGE"),
        (
            "AWAITING_IMAGE",
            "",
            "image",
            "https://example.com/image.jpg",
            "AWAITING_CUSTOM_TEXT",
        ),
        ("AWAITING_CUSTOM_TEXT", "İyi ki doğdun", "text", None, "NORMAL"),
    ],
)
def test_active_order_flow_regression(
    harness: ChatHarness,
    flow_state: str,
    message: str,
    message_type: str,
    media_url: str | None,
    expected_state: str,
) -> None:
    harness.flow_state = {
        "current_state": flow_state,
        "state_data": {
            "order_number": "ETSY-12345",
            "image_url": "https://example.com/image.jpg",
        },
    }

    result = harness.send(message, message_type=message_type, media_url=media_url)

    assert result["durum"] == "başarılı"
    assert harness.flow_transitions[0]["to_state"] == expected_state
    assert harness.control_transitions == []
    assert [item["direction"] for item in harness.saved_messages] == [
        "incoming",
        "outgoing",
    ]


def test_control_and_flow_state_remain_independent(harness: ChatHarness) -> None:
    harness.flow_state = {
        "current_state": "AWAITING_ORDER_NUMBER",
        "state_data": {},
    }
    harness.controls = [control("SELLER_TAKEN_OVER")]

    result = harness.send("ETSY-12345")

    assert result["reason_code"] == "stored_seller_taken_over"
    assert harness.flow_transitions == []
    assert harness.control_transitions == []
    assert_only_incoming(harness)


@pytest.mark.parametrize(
    ("control_state", "expected_reason"),
    [
        ("SELLER_TAKEN_OVER", "stored_seller_taken_over"),
        ("RETURN_REVIEW", "stored_return_review"),
        ("ASSISTANT_PAUSED", "stored_assistant_paused"),
    ],
)
def test_inactive_control_blocks_order_collection_services_before_flow(
    harness: ChatHarness,
    monkeypatch: pytest.MonkeyPatch,
    control_state: str,
    expected_reason: str,
) -> None:
    harness.controls = [control(control_state)]
    harness.flow_state = {
        "current_state": "AWAITING_ORDER_FIELD",
        "state_data": {"order_id": 1, "field_snapshot_id": 77},
    }

    def forbidden(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        pytest.fail("Conversation control kapalıyken order collection servisi çağrıldı.")

    monkeypatch.setattr(chat_service, "order_get_next_collection_step", forbidden)
    monkeypatch.setattr(chat_service, "order_update_core_from_message", forbidden)
    monkeypatch.setattr(chat_service, "order_record_field_value", forbidden)

    result = harness.send("Ali")

    assert result["reason_code"] == expected_reason
    assert "get_state" not in harness.events
    assert harness.classifier_calls == 0
    assert_only_incoming(harness)


def test_resume_cursor_blocks_old_order_field_message_before_collection_services(
    harness: ChatHarness,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness.controls = [control(cursor=101)]
    harness.incoming_id = 101
    harness.flow_state = {
        "current_state": "AWAITING_ORDER_FIELD",
        "state_data": {"order_id": 1, "field_snapshot_id": 77},
    }

    def forbidden(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        pytest.fail("Resume cursor öncesi mesaj order collection'a ulaşmamalı.")

    monkeypatch.setattr(chat_service, "order_get_next_collection_step", forbidden)
    monkeypatch.setattr(chat_service, "order_update_core_from_message", forbidden)
    monkeypatch.setattr(chat_service, "order_record_field_value", forbidden)

    result = harness.send("Ali", provider_message_id="old-order-field")

    assert result["reason_code"] == "stored_before_resume_cursor"
    assert "get_state" not in harness.events
    assert harness.classifier_calls == 0
    assert_only_incoming(harness)

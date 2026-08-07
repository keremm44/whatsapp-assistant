from __future__ import annotations

from typing import Any

import pytest

import chat_service


def _seller() -> dict[str, Any]:
    return {
        "id": 11,
        "store_link": "https://example.com/store",
        "product_info": {},
        "emergency_paused": False,
        "ai_enabled": True,
        "onboarding_completed": True,
        "system_status": "active",
    }


def _control(
    state: str = chat_service.CONTROL_STATE_ASSISTANT_ACTIVE,
    *,
    version: int = 1,
    cursor: int | None = None,
) -> dict[str, Any]:
    return {
        "state": state,
        "changed_at": "2026-08-07T12:00:00+00:00",
        "changed_by_profile_id": None,
        "reason_code": None,
        "reason_note": None,
        "resume_after_message_id": cursor,
        "version": version,
    }


def _classification(intent: str = "greeting") -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "intent": intent,
        "confidence": 0.99,
        "alternatives": [],
    }


def _collecting_result(
    *,
    request_id: int = 501,
    awaiting: str = "order_number",
    question: str = "Sipariş numaranızı paylaşır mısınız?",
) -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "state": "collecting",
        "request": {
            "id": request_id,
            "seller_id": 11,
            "customer_id": 22,
            "status": "COLLECTING",
        },
        "awaiting": awaiting,
        "missing_fields": [awaiting],
        "question": question,
        "review_required": False,
        "outgoing_allowed": True,
    }


def _review_result(*, request_id: int = 501) -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "state": "seller_review_required",
        "request": {
            "id": request_id,
            "seller_id": 11,
            "customer_id": 22,
            "status": "SELLER_REVIEW_REQUIRED",
        },
        "review_required": True,
        "outgoing_allowed": False,
        "notification_created": True,
        "control_changed": True,
    }


class ReturnChatHarness:
    def __init__(self) -> None:
        self.seller = _seller()
        self.customer = {
            "id": 22,
            "seller_id": 11,
            "is_blocked": False,
            "muted_until": None,
        }
        self.incoming_id = 101
        self.incoming_result: dict[str, Any] | None = None
        self.controls: list[dict[str, Any]] = [_control(), _control()]
        self.control_reads = 0
        self.flow_state: dict[str, Any] = {
            "current_state": "NORMAL",
            "state_data": {},
        }
        self.classification_result = _classification()
        self.classifier_calls = 0
        self.active_request: dict[str, Any] | None = None
        self.active_lookup_result: dict[str, Any] | None = None
        self.active_lookup_calls: list[dict[str, Any]] = []
        self.return_result: dict[str, Any] = _collecting_result()
        self.return_calls: list[dict[str, Any]] = []
        self.saved_messages: list[dict[str, Any]] = []
        self.notifications: list[dict[str, Any]] = []
        self.flow_transitions: list[dict[str, Any]] = []
        self.order_core_calls: list[dict[str, Any]] = []
        self.order_field_calls: list[dict[str, Any]] = []
        self.order_initialize_calls: list[dict[str, Any]] = []
        self.rules: list[dict[str, Any]] = []

    def install(self, monkeypatch: pytest.MonkeyPatch) -> "ReturnChatHarness":
        monkeypatch.setattr(
            chat_service,
            "get_seller_by_id",
            lambda seller_id: {"durum": "başarılı", "satıcı": self.seller},
        )
        monkeypatch.setattr(
            chat_service,
            "get_or_create_customer",
            lambda **kwargs: {"durum": "mevcut", "customer": self.customer},
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
            lambda **kwargs: {"durum": "başarılı", "state": self.flow_state},
        )
        monkeypatch.setattr(chat_service, "classify_intent", self.classify_intent)
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
            "get_active_return_issue_request",
            self.get_active_request,
        )
        monkeypatch.setattr(
            chat_service,
            "return_issue_process_message",
            self.process_return_issue,
        )
        monkeypatch.setattr(
            chat_service,
            "transition_state",
            self.transition_state,
        )
        monkeypatch.setattr(
            chat_service,
            "create_seller_notification",
            self.create_notification,
        )
        monkeypatch.setattr(
            chat_service,
            "get_active_rules",
            lambda seller_id: {"durum": "başarılı", "kurallar": self.rules},
        )
        monkeypatch.setattr(
            chat_service,
            "increment_rule_hit_count",
            lambda rule_id: {"durum": "başarılı"},
        )
        monkeypatch.setattr(
            chat_service,
            "unanswered_record_question",
            lambda **kwargs: {
                "durum": "başarılı",
                "answer_available": False,
                "group": {"id": 1},
                "notification_created": True,
            },
        )
        monkeypatch.setattr(
            chat_service,
            "unanswered_find_saved_answer",
            lambda *args, **kwargs: {
                "durum": "başarılı",
                "matched": False,
                "group": None,
            },
        )
        monkeypatch.setattr(
            chat_service,
            "count_recent_violations",
            lambda **kwargs: {"durum": "başarılı", "count": 0},
        )
        monkeypatch.setattr(
            chat_service,
            "record_violation",
            lambda **kwargs: {"durum": "başarılı", "violation": {"id": 1}},
        )
        monkeypatch.setattr(
            chat_service,
            "block_customer",
            lambda **kwargs: {"durum": "başarılı"},
        )
        monkeypatch.setattr(
            chat_service,
            "mute_customer",
            lambda **kwargs: {"durum": "başarılı"},
        )
        monkeypatch.setattr(
            chat_service,
            "order_update_core_from_message",
            self.order_update_core,
        )
        monkeypatch.setattr(
            chat_service,
            "order_record_field_value",
            self.order_record_field,
        )
        monkeypatch.setattr(
            chat_service,
            "order_initialize_collection",
            self.order_initialize,
        )
        monkeypatch.setattr(
            chat_service,
            "order_get_next_collection_step",
            lambda seller_id, order_id: {
                "durum": "hata",
                "mesaj": "Return chat testinde order step çalışmamalı.",
            },
        )
        return self

    def save_message(self, **kwargs: Any) -> dict[str, Any]:
        self.saved_messages.append(kwargs)
        if kwargs.get("direction") == "incoming":
            if self.incoming_result is not None:
                return self.incoming_result
            return {"durum": "başarılı", "message": {"id": self.incoming_id}}
        return {"durum": "başarılı", "message": {"id": 901}}

    def get_control(self, seller_id: int, customer_id: int) -> dict[str, Any]:
        index = min(self.control_reads, len(self.controls) - 1)
        self.control_reads += 1
        value = self.controls[index]
        if "durum" in value:
            return value
        return {"durum": "başarılı", "control": value}

    def classify_intent(self, message: str) -> dict[str, Any]:
        self.classifier_calls += 1
        return self.classification_result

    def get_active_request(self, **kwargs: Any) -> dict[str, Any]:
        self.active_lookup_calls.append(kwargs)
        if self.active_lookup_result is not None:
            return self.active_lookup_result
        return {"durum": "başarılı", "request": self.active_request}

    def process_return_issue(self, **kwargs: Any) -> dict[str, Any]:
        self.return_calls.append(kwargs)
        return self.return_result

    def transition_state(self, **kwargs: Any) -> dict[str, Any]:
        self.flow_transitions.append(kwargs)
        return {"durum": "başarılı", "state": {"current_state": kwargs["to_state"]}}

    def create_notification(self, **kwargs: Any) -> dict[str, Any]:
        self.notifications.append(kwargs)
        return {"durum": "başarılı", "notification": {"id": 701}}

    def order_update_core(self, **kwargs: Any) -> dict[str, Any]:
        self.order_core_calls.append(kwargs)
        return {"durum": "hata", "mesaj": "Order mutation çalışmamalı."}

    def order_record_field(self, **kwargs: Any) -> dict[str, Any]:
        self.order_field_calls.append(kwargs)
        return {"durum": "hata", "mesaj": "Order mutation çalışmamalı."}

    def order_initialize(self, **kwargs: Any) -> dict[str, Any]:
        self.order_initialize_calls.append(kwargs)
        return {"durum": "hata", "mesaj": "Order init çalışmamalı."}

    def send(
        self,
        message: str,
        *,
        message_type: str = "text",
        media_url: str | None = None,
        provider_message_id: str = "RET-1",
    ) -> dict[str, Any]:
        return chat_service.sohbet_isle(
            seller_id=11,
            whatsapp_number="+905551112233",
            kullanici_mesaji=message,
            customer_name="Test",
            provider="unit",
            provider_message_id=provider_message_id,
            message_type=message_type,
            media_url=media_url,
        )


def _only_incoming(harness: ReturnChatHarness) -> bool:
    return [m.get("direction") for m in harness.saved_messages] == ["incoming"]


def test_normal_return_intent_starts_persistent_collection_and_sends_one_question(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ReturnChatHarness().install(monkeypatch)
    harness.classification_result = _classification("return_request")

    result = harness.send("Ürünü iade etmek istiyorum")

    assert result == {
        "durum": "başarılı",
        "cevap": "Sipariş numaranızı paylaşır mısınız?",
        "kaynak": "return_issue",
        "customer_id": 22,
    }
    assert harness.return_calls[0]["intent"] == "return_request"
    assert harness.return_calls[0]["source_message_id"] == 101
    assert harness.notifications == []
    assert [m["direction"] for m in harness.saved_messages] == ["incoming", "outgoing"]


def test_existing_collecting_request_consumes_plain_followup_before_normal_flow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ReturnChatHarness().install(monkeypatch)
    harness.active_request = {"id": 501, "status": "COLLECTING"}
    harness.flow_state = {
        "current_state": "AWAITING_ORDER_NUMBER",
        "state_data": {"order_id": 1},
    }
    harness.return_result = _collecting_result(
        awaiting="reason",
        question="Sorunu kısaca anlatır mısınız?",
    )
    harness.classification_result = _classification("greeting")

    result = harness.send("TR12345")

    assert result["kaynak"] == "return_issue"
    assert result["cevap"] == "Sorunu kısaca anlatır mısınız?"
    assert harness.return_calls[0]["intent"] == "continue"
    assert harness.return_calls[0]["message_text"] == "TR12345"
    assert harness.order_core_calls == []
    assert harness.classifier_calls == 1  # order interruption precheck only


@pytest.mark.parametrize(
    ("flow_state", "state_data", "intent"),
    [
        ("AWAITING_ORDER_NUMBER", {"order_id": 1}, "return_request"),
        ("AWAITING_CUSTOM_TEXT", {"order_id": 1}, "complaint"),
        (
            "AWAITING_ORDER_FIELD",
            {"order_id": 1, "field_snapshot_id": 77},
            "complaint",
        ),
    ],
)
def test_return_intent_interrupts_order_before_any_order_mutation(
    monkeypatch: pytest.MonkeyPatch,
    flow_state: str,
    state_data: dict[str, Any],
    intent: str,
) -> None:
    harness = ReturnChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": flow_state, "state_data": state_data}
    harness.classification_result = _classification(intent)

    result = harness.send("Ürün kırık geldi, iade etmek istiyorum")

    assert result["kaynak"] == "return_issue"
    assert harness.return_calls[0]["intent"] == intent
    assert harness.order_core_calls == []
    assert harness.order_field_calls == []


def test_review_required_result_is_silent_and_chat_does_not_duplicate_notification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ReturnChatHarness().install(monkeypatch)
    harness.classification_result = _classification("complaint")
    harness.return_result = _review_result()

    result = harness.send("Ürün kırık geldi")

    assert result["durum"] == "otomatik_yanıt_yok"
    assert result["reason_code"] == "stored_return_issue_review"
    assert result["return_issue_request_id"] == 501
    assert result["notification_created"] is True
    assert harness.notifications == []
    assert _only_incoming(harness)


def test_urgent_review_result_sends_no_collection_question(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ReturnChatHarness().install(monkeypatch)
    harness.classification_result = _classification("complaint")
    harness.return_result = _review_result(request_id=777)

    result = harness.send("Ürün alev aldı ve elim yandı")

    assert result["reason_code"] == "stored_return_issue_review"
    assert result["return_issue_request_id"] == 777
    assert _only_incoming(harness)


def test_fail_closed_service_error_never_falls_through_to_normal_flow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ReturnChatHarness().install(monkeypatch)
    harness.classification_result = _classification("return_request")
    harness.return_result = {
        "durum": "hata",
        "error_code": "return_issue_review_transition_failed",
        "mesaj": "Control transition başarısız.",
        "fail_closed": True,
        "outgoing_allowed": False,
        "request": {"id": 501, "status": "SELLER_REVIEW_REQUIRED"},
        "notification_created": True,
    }

    result = harness.send("İade etmek istiyorum")

    assert result["reason_code"] == "return_issue_review_transition_failed"
    assert result["fail_closed"] is True
    assert _only_incoming(harness)
    assert harness.flow_transitions == []


def test_seller_review_request_gate_retries_domain_before_any_normal_flow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ReturnChatHarness().install(monkeypatch)
    harness.active_request = {"id": 501, "status": "SELLER_REVIEW_REQUIRED"}
    harness.return_result = _review_result()
    harness.classification_result = _classification("greeting")

    result = harness.send("Merhaba")

    assert result["reason_code"] == "stored_return_issue_review"
    assert harness.return_calls[0]["intent"] == "continue"
    assert harness.classifier_calls == 0
    assert _only_incoming(harness)


def test_required_image_followup_passes_real_image_message_type_to_domain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ReturnChatHarness().install(monkeypatch)
    harness.active_request = {"id": 501, "status": "COLLECTING"}
    harness.return_result = _review_result()

    result = harness.send(
        "",
        message_type="image",
        media_url="https://provider.invalid/private-media",
    )

    assert result["reason_code"] == "stored_return_issue_review"
    assert harness.return_calls[0]["message_type"] == "image"
    assert harness.return_calls[0]["message_text"] == ""
    assert harness.return_calls[0]["source_message_id"] == 101


def test_return_question_uses_central_outgoing_control_recheck(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ReturnChatHarness().install(monkeypatch)
    harness.active_request = {"id": 501, "status": "COLLECTING"}
    harness.controls = [
        _control(version=1),
        _control(chat_service.CONTROL_STATE_SELLER_TAKEN_OVER, version=2),
    ]

    result = harness.send("TR12345")

    assert result["reason_code"] == "outgoing_suppressed_control_changed"
    assert _only_incoming(harness)
    assert harness.return_calls[0]["intent"] == "continue"


@pytest.mark.parametrize(
    "control_state",
    [
        chat_service.CONTROL_STATE_SELLER_TAKEN_OVER,
        chat_service.CONTROL_STATE_RETURN_REVIEW,
        chat_service.CONTROL_STATE_ASSISTANT_PAUSED,
    ],
)
def test_inactive_conversation_control_never_runs_return_domain(
    monkeypatch: pytest.MonkeyPatch,
    control_state: str,
) -> None:
    harness = ReturnChatHarness().install(monkeypatch)
    harness.controls = [_control(control_state)]
    harness.active_request = {"id": 501, "status": "COLLECTING"}
    harness.classification_result = _classification("return_request")

    result = harness.send("İade etmek istiyorum")

    assert result["durum"] == "otomatik_yanıt_yok"
    assert harness.active_lookup_calls == []
    assert harness.return_calls == []
    assert harness.classifier_calls == 0


def test_resume_cursor_old_message_never_runs_return_domain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ReturnChatHarness().install(monkeypatch)
    harness.controls = [_control(cursor=101)]
    harness.active_request = {"id": 501, "status": "COLLECTING"}

    result = harness.send("TR12345")

    assert result["reason_code"] == "stored_before_resume_cursor"
    assert harness.active_lookup_calls == []
    assert harness.return_calls == []


def test_duplicate_incoming_never_runs_return_domain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ReturnChatHarness().install(monkeypatch)
    harness.incoming_result = {"durum": "duplicate", "message": {"id": 101}}
    harness.active_request = {"id": 501, "status": "COLLECTING"}

    result = harness.send("TR12345")

    assert result["durum"] == "duplicate"
    assert harness.active_lookup_calls == []
    assert harness.return_calls == []


def test_active_request_lookup_failure_is_fail_closed_before_normal_or_order_flow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ReturnChatHarness().install(monkeypatch)
    harness.active_lookup_result = {"durum": "hata", "mesaj": "DB yok"}
    harness.flow_state = {
        "current_state": "AWAITING_ORDER_NUMBER",
        "state_data": {"order_id": 1},
    }
    harness.classification_result = _classification("greeting")

    result = harness.send("TR12345")

    assert result["reason_code"] == "return_issue_active_lookup_unavailable"
    assert result["fail_closed"] is True
    assert harness.return_calls == []
    assert harness.order_core_calls == []
    assert _only_incoming(harness)


def test_collection_question_contains_no_commercial_decision_promise(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ReturnChatHarness().install(monkeypatch)
    harness.classification_result = _classification("return_request")

    result = harness.send("İade etmek istiyorum")

    answer = result["cevap"].lower()
    for forbidden in ("onaylandı", "iade edildi", "para iadesi", "değişim yapılacak", "telafi"):
        assert forbidden not in answer

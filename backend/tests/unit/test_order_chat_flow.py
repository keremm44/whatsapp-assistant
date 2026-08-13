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


def classification(intent: str = "greeting", *, confidence: float = 0.99) -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "intent": intent,
        "confidence": confidence,
        "alternatives": [],
    }


def order_record(
    *,
    order_id: int = 1,
    status: str = "COLLECTING",
    version: int = 1,
    external_order_number: str | None = None,
    image_message_id: int | None = None,
    custom_text: str | None = None,
    product_id: int | None = None,
) -> dict[str, Any]:
    return {
        "id": order_id,
        "seller_id": 11,
        "customer_id": 22,
        "product_id": product_id,
        "product_name_snapshot": None,
        "external_order_number": external_order_number,
        "customer_phone_snapshot": "+905551112244",
        "customer_note": None,
        "image_message_id": image_message_id,
        "custom_text": custom_text,
        "status": status,
        "review_reason_code": None,
        "review_reason_note": None,
        "created_from_message_id": 101,
        "last_source_message_id": None,
        "version": version,
        "created_at": "2026-08-06T12:00:00+00:00",
        "updated_at": "2026-08-06T12:00:00+00:00",
        "completed_at": None,
        "closed_at": None,
    }


def field_snapshot(
    *,
    snapshot_id: int = 77,
    field_key: str = "print_name",
    label: str = "Kupaya yazılacak isim",
    field_type: str = "short_text",
    options: list[dict[str, Any]] | None = None,
    validation_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": snapshot_id,
        "field_key": field_key,
        "label": label,
        "field_type": field_type,
        "options": options or [],
        "validation_config": validation_config or {},
    }


def step_order_number() -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "complete": False,
        "blocked": False,
        "step": "order_number",
        "question": "Sipariş numaranızı paylaşır mısınız?",
        "order": order_record(),
    }


def step_image() -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "complete": False,
        "blocked": False,
        "step": "image",
        "question": "Üründe kullanılacak görseli gönderebilir misiniz?",
        "order": order_record(external_order_number="ETSY-12345"),
    }


def step_custom_text() -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "complete": False,
        "blocked": False,
        "step": "custom_text",
        "question": "Üründe kullanılacak özel yazıyı paylaşır mısınız?",
        "order": order_record(external_order_number="ETSY-12345", image_message_id=101),
    }


def step_dynamic(field: dict[str, Any] | None = None) -> dict[str, Any]:
    field = field or field_snapshot()
    question = f"{field['label']} bilgisini paylaşır mısınız?"
    if field["field_type"] == "boolean":
        question = f"{field['label']} için evet veya hayır olarak yanıtlayabilir misiniz?"
    elif field["field_type"] in {"single_choice", "multi_choice"}:
        labels = ", ".join(str(option["label"]) for option in field["options"])
        question = f"{field['label']} tercihiniz nedir?\nSeçenekler: {labels}"
    elif field["field_type"] == "image":
        question = f"{field['label']} görselini gönderebilir misiniz?"

    return {
        "durum": "başarılı",
        "complete": False,
        "blocked": False,
        "step": "dynamic_field",
        "field": field,
        "question": question,
        "order": order_record(external_order_number="ETSY-12345", image_message_id=101),
    }


def step_complete() -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "complete": True,
        "blocked": False,
        "step": "complete",
        "order": order_record(status="COMPLETE"),
    }


class ChatHarness:
    def __init__(self) -> None:
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
        self.controls = [control(), control(), control(), control()]
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

        self.order_initialize_result: dict[str, Any] = {
            "durum": "başarılı",
            "order": order_record(),
            "created": True,
            "changed": True,
            "idempotent": False,
            "snapshot_count": 0,
        }
        self.order_core_result: dict[str, Any] = {
            "durum": "başarılı",
            "order": order_record(),
            "changed": True,
            "completed": False,
            "idempotent": False,
        }
        self.order_field_result: dict[str, Any] = {
            "durum": "başarılı",
            "order": order_record(),
            "changed": True,
            "completed": False,
            "idempotent": False,
        }
        self.next_steps: list[dict[str, Any]] = []
        self.order_initialize_calls: list[dict[str, Any]] = []
        self.order_core_calls: list[dict[str, Any]] = []
        self.order_field_calls: list[dict[str, Any]] = []
        self.order_next_step_calls: list[tuple[int, int]] = []
        self.product_decision_calls: list[int] = []
        self.product_list_calls: list[int] = []
        self.product_assign_calls: list[dict[str, Any]] = []
        self.product_decision_result: dict[str, Any] = {
            "durum": "başarılı",
            "decision": "none",
            "products": [],
        }
        self.product_list_result: dict[str, Any] = {
            "durum": "başarılı",
            "products": [],
        }
        self.product_assign_result: dict[str, Any] = {
            "durum": "başarılı",
            "order": order_record(product_id=5),
            "snapshot_count": 1,
        }

    def install(self, monkeypatch: pytest.MonkeyPatch) -> "ChatHarness":
        monkeypatch.setattr(chat_service, "get_seller_by_id", lambda seller_id: {"durum": "başarılı", "satıcı": self.seller})
        monkeypatch.setattr(chat_service, "get_or_create_customer", lambda **kwargs: {"durum": "mevcut", "customer": self.customer})
        monkeypatch.setattr(chat_service, "save_message", self.save_message)
        monkeypatch.setattr(chat_service, "get_conversation_control", self.get_control)
        monkeypatch.setattr(chat_service, "is_customer_muted", lambda customer: bool(customer.get("muted_until")))
        monkeypatch.setattr(chat_service, "get_state", lambda **kwargs: {"durum": "başarılı", "state": self.flow_state})
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
        monkeypatch.setattr(chat_service, "transition_state", self.transition_state)
        monkeypatch.setattr(chat_service, "transition_conversation_control", self.transition_control)
        monkeypatch.setattr(chat_service, "create_seller_notification", self.create_notification)
        monkeypatch.setattr(chat_service, "unanswered_record_question", self.save_unanswered)
        monkeypatch.setattr(
            chat_service,
            "unanswered_find_saved_answer",
            lambda *args, **kwargs: {"durum": "başarılı", "matched": False, "group": None},
        )
        monkeypatch.setattr(chat_service, "get_active_rules", lambda seller_id: {"kurallar": self.rules})
        monkeypatch.setattr(chat_service, "increment_rule_hit_count", lambda rule_id: {"durum": "başarılı"})
        monkeypatch.setattr(chat_service, "count_recent_violations", lambda **kwargs: {"durum": "başarılı", "count": self.violation_count})
        monkeypatch.setattr(chat_service, "record_violation", lambda **kwargs: {"durum": "başarılı", "violation": {"id": 1}})
        monkeypatch.setattr(chat_service, "block_customer", lambda **kwargs: {"durum": "başarılı"})
        monkeypatch.setattr(chat_service, "mute_customer", lambda **kwargs: {"durum": "başarılı"})
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

        monkeypatch.setattr(chat_service, "order_initialize_collection", self.order_initialize_collection)
        monkeypatch.setattr(chat_service, "order_update_core_from_message", self.order_update_core_from_message)
        monkeypatch.setattr(chat_service, "order_get_next_collection_step", self.order_get_next_collection_step)
        monkeypatch.setattr(chat_service, "order_record_field_value", self.order_record_field_value)
        monkeypatch.setattr(chat_service, "order_resolve_new_order_product", self.order_resolve_new_order_product)
        monkeypatch.setattr(chat_service, "order_list_active_products", self.order_list_active_products)
        monkeypatch.setattr(chat_service, "order_set_order_product", self.order_set_order_product)
        return self

    def save_message(self, **kwargs: Any) -> dict[str, Any]:
        self.saved_messages.append(kwargs)
        if kwargs.get("direction") == "incoming":
            if self.incoming_result is not None:
                return self.incoming_result
            return {"durum": "başarılı", "message": {"id": self.incoming_id}}
        return {"durum": "başarılı", "message": {"id": 999}}

    def get_control(self, seller_id: int, customer_id: int) -> dict[str, Any]:
        self.control_reads.append((seller_id, customer_id))
        index = min(len(self.control_reads) - 1, len(self.controls) - 1)
        value = self.controls[index]
        if "durum" in value:
            return value
        return {"durum": "başarılı", "control": value}

    def classify_intent(self, message: str) -> dict[str, Any]:
        self.classifier_calls += 1
        return self.classification_result

    def transition_state(self, **kwargs: Any) -> dict[str, Any]:
        self.flow_transitions.append(kwargs)
        self.flow_state = {
            "current_state": kwargs["to_state"],
            "state_data": kwargs.get("state_data") or {},
        }
        return {"durum": "başarılı", "state": self.flow_state}

    def transition_control(self, **kwargs: Any) -> dict[str, Any]:
        self.control_transitions.append(kwargs)
        return {"durum": "başarılı", "control": control()}

    def create_notification(self, **kwargs: Any) -> dict[str, Any]:
        self.notifications.append(kwargs)
        return {"durum": "başarılı", "notification": {"id": 1}}

    def save_unanswered(self, **kwargs: Any) -> dict[str, Any]:
        self.unanswered.append(kwargs)
        return {"durum": "başarılı", "question": {"id": 1}}

    def return_issue_process_message(self, **kwargs: Any) -> dict[str, Any]:
        self.return_issue_calls.append(kwargs)
        return self.return_issue_result

    def order_initialize_collection(self, **kwargs: Any) -> dict[str, Any]:
        self.order_initialize_calls.append(kwargs)
        return self.order_initialize_result

    def order_update_core_from_message(self, **kwargs: Any) -> dict[str, Any]:
        self.order_core_calls.append(kwargs)
        return self.order_core_result

    def order_get_next_collection_step(self, seller_id: int, order_id: int) -> dict[str, Any]:
        self.order_next_step_calls.append((seller_id, order_id))
        if not self.next_steps:
            return {"durum": "hata", "mesaj": "Test next step ayarlanmadı."}
        if len(self.next_steps) == 1:
            return self.next_steps[0]
        return self.next_steps.pop(0)

    def order_record_field_value(self, **kwargs: Any) -> dict[str, Any]:
        self.order_field_calls.append(kwargs)
        return self.order_field_result

    def order_resolve_new_order_product(self, seller_id: int) -> dict[str, Any]:
        self.product_decision_calls.append(seller_id)
        return self.product_decision_result

    def order_list_active_products(self, seller_id: int) -> dict[str, Any]:
        self.product_list_calls.append(seller_id)
        return self.product_list_result

    def order_set_order_product(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        if args:
            kwargs.setdefault("seller_id", args[0])
            kwargs.setdefault("customer_id", args[1])
            kwargs.setdefault("order_id", args[2])
            kwargs.setdefault("product_id", args[3])
        self.product_assign_calls.append(kwargs)
        return self.product_assign_result

    def send(
        self,
        message: str,
        *,
        message_type: str = "text",
        media_url: str | None = None,
        provider_message_id: str | None = None,
    ) -> dict[str, Any]:
        return chat_service.sohbet_isle(
            seller_id=11,
            whatsapp_number="+905551112244",
            kullanici_mesaji=message,
            customer_name="Test",
            provider="internal",
            provider_message_id=provider_message_id or f"MSG-{self.incoming_id}",
            message_type=message_type,
            media_url=media_url,
        )


def test_order_confirmation_initializes_collection_and_keeps_only_pointer(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_ORDER_CONFIRMATION", "state_data": {}}
    harness.classification_result = classification("order_confirmation_yes")
    harness.next_steps = [step_order_number()]

    result = harness.send("Evet aldım")

    assert result["durum"] == "başarılı"
    assert harness.order_initialize_calls == [{"seller_id": 11, "customer_id": 22, "source_message_id": 101}]
    assert harness.flow_state == {"current_state": "AWAITING_ORDER_NUMBER", "state_data": {"order_id": 1}}


def test_order_initialization_failure_does_not_advance_state(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_ORDER_CONFIRMATION", "state_data": {}}
    harness.classification_result = classification("order_confirmation_yes")
    harness.order_initialize_result = {"durum": "hata", "mesaj": "DB yok"}

    result = harness.send("Evet aldım")

    assert result["reason_code"] == "order_persist_failed"
    assert harness.flow_transitions == []


def test_order_number_uses_source_aware_mutation_and_next_step(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_ORDER_NUMBER", "state_data": {"order_id": 1}}
    harness.next_steps = [step_image()]

    result = harness.send("ETSY-12345")

    assert result["durum"] == "başarılı"
    assert harness.order_core_calls == [{
        "seller_id": 11,
        "customer_id": 22,
        "order_id": 1,
        "source_message_id": 101,
        "external_order_number": "ETSY-12345",
    }]
    assert harness.flow_state == {"current_state": "AWAITING_IMAGE", "state_data": {"order_id": 1}}


def test_order_number_failure_does_not_advance(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_ORDER_NUMBER", "state_data": {"order_id": 1}}
    harness.order_core_result = {"durum": "hata", "mesaj": "DB yok"}

    result = harness.send("ETSY-12345")

    assert result["reason_code"] == "order_persist_failed"
    assert harness.flow_transitions == []


def test_main_image_requires_real_image_message_type(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_IMAGE", "state_data": {"order_id": 1}}
    harness.classification_result = classification("greeting")
    # Config-authority kontrolü: görsel hâlâ istenen adım (image_required
    # legacy/TRUE) ise görsel dışı mesaj eskisi gibi sessizce düşürülür.
    harness.next_steps = [step_image()]

    result = harness.send("görsel", message_type="text", media_url="https://example.com/fake.jpg")

    assert result["durum"] == "başarılı"
    assert result["kaynak"] == "template"
    assert harness.order_core_calls == []
    assert harness.flow_transitions == []


def test_stale_image_state_realigns_when_image_no_longer_required(monkeypatch: pytest.MonkeyPatch) -> None:
    # Seller konuşma AWAITING_IMAGE'de açıkken image_required=false yaptı
    # (ya da config baştan görsel istemiyordu). Görsel dışı bir mesaj
    # geldiğinde akış kilitli kalmaz; gerçek adıma (custom_text) hizalanır.
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_IMAGE", "state_data": {"order_id": 1}}
    harness.next_steps = [step_custom_text()]

    result = harness.send("merhaba", message_type="text")

    assert result["durum"] == "başarılı"
    assert harness.order_core_calls == []
    assert harness.flow_state["current_state"] == "AWAITING_CUSTOM_TEXT"


def test_stale_image_state_realigns_to_completion_when_nothing_remains(monkeypatch: pytest.MonkeyPatch) -> None:
    # Görsel istenmiyor ve başka açık adım da yoksa parked AWAITING_IMAGE
    # konuşma completion kısa-devresine hizalanır.
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_IMAGE", "state_data": {"order_id": 1}}
    harness.next_steps = [step_complete()]

    result = harness.send("tamam", message_type="text")

    assert result["durum"] == "başarılı"
    assert harness.order_core_calls == []
    assert harness.flow_state["current_state"] == "NORMAL"


def test_main_image_is_persisted_by_incoming_message_reference(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_IMAGE", "state_data": {"order_id": 1}}
    harness.next_steps = [step_custom_text()]

    result = harness.send("", message_type="image", media_url="https://example.com/image.jpg")

    assert result["durum"] == "başarılı"
    assert harness.order_core_calls[0]["image_message_id"] == 101
    assert harness.order_core_calls[0]["source_message_id"] == 101
    assert harness.flow_state["current_state"] == "AWAITING_CUSTOM_TEXT"


def test_main_image_can_skip_custom_text_and_go_to_dynamic_field(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    field = field_snapshot(snapshot_id=88, label="Renk", field_type="single_choice", options=[{"value": "black", "label": "Siyah"}])
    harness.flow_state = {"current_state": "AWAITING_IMAGE", "state_data": {"order_id": 1}}
    harness.next_steps = [step_dynamic(field)]

    result = harness.send("", message_type="image")

    assert result["durum"] == "başarılı"
    assert harness.flow_state == {"current_state": "AWAITING_ORDER_FIELD", "state_data": {"order_id": 1, "field_snapshot_id": 88}}


def test_required_custom_text_is_persisted_then_completes(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_CUSTOM_TEXT", "state_data": {"order_id": 1}}
    harness.next_steps = [step_custom_text(), step_complete()]
    harness.order_core_result["completed"] = True

    result = harness.send("Ali")

    assert result["durum"] == "başarılı"
    assert harness.order_core_calls[0]["custom_text"] == "Ali"
    assert harness.order_core_calls[0]["source_message_id"] == 101
    assert harness.flow_state["current_state"] == "NORMAL"
    assert len(harness.notifications) == 1


def test_required_custom_text_cannot_be_skipped_with_yok(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_CUSTOM_TEXT", "state_data": {"order_id": 1}}
    harness.next_steps = [step_custom_text()]

    result = harness.send("yok")

    assert result["durum"] == "başarılı"
    assert harness.order_core_calls == []
    assert harness.flow_transitions == []
    assert "zorunlu" in result["cevap"].lower()


def test_stale_custom_text_state_does_not_consume_dynamic_field_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    field = field_snapshot(snapshot_id=90, label="Renk", field_type="single_choice", options=[{"value": "black", "label": "Siyah"}])
    harness.flow_state = {"current_state": "AWAITING_CUSTOM_TEXT", "state_data": {"order_id": 1}}
    harness.next_steps = [step_dynamic(field)]

    result = harness.send("Siyah")

    assert result["durum"] == "başarılı"
    assert harness.order_core_calls == []
    assert harness.order_field_calls == []
    assert harness.flow_state["current_state"] == "AWAITING_ORDER_FIELD"


def _run_dynamic_answer(
    monkeypatch: pytest.MonkeyPatch,
    *,
    field: dict[str, Any],
    answer: str,
    message_type: str = "text",
) -> ChatHarness:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {
        "current_state": "AWAITING_ORDER_FIELD",
        "state_data": {"order_id": 1, "field_snapshot_id": field["id"]},
    }
    harness.next_steps = [step_dynamic(field), step_complete()]
    harness.order_field_result["completed"] = True
    result = harness.send(answer, message_type=message_type)
    assert result["durum"] == "başarılı"
    return harness


def test_dynamic_short_text_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = _run_dynamic_answer(monkeypatch, field=field_snapshot(), answer="Ali")
    assert harness.order_field_calls[0]["value"] == "Ali"


def test_dynamic_boolean_is_normalized(monkeypatch: pytest.MonkeyPatch) -> None:
    field = field_snapshot(field_type="boolean", label="Hediye paketi")
    harness = _run_dynamic_answer(monkeypatch, field=field, answer="evet")
    assert harness.order_field_calls[0]["value"] is True


def test_dynamic_single_choice_label_is_normalized(monkeypatch: pytest.MonkeyPatch) -> None:
    field = field_snapshot(field_type="single_choice", label="Renk", options=[{"value": "black", "label": "Siyah"}, {"value": "white", "label": "Beyaz"}])
    harness = _run_dynamic_answer(monkeypatch, field=field, answer="SİYAH")
    assert harness.order_field_calls[0]["value"] == "black"


def test_dynamic_multi_choice_labels_are_normalized(monkeypatch: pytest.MonkeyPatch) -> None:
    field = field_snapshot(field_type="multi_choice", label="Renkler", options=[{"value": "black", "label": "Siyah"}, {"value": "white", "label": "Beyaz"}])
    harness = _run_dynamic_answer(monkeypatch, field=field, answer="Siyah, Beyaz")
    assert harness.order_field_calls[0]["value"] == ["black", "white"]


def test_dynamic_image_uses_safe_message_reference(monkeypatch: pytest.MonkeyPatch) -> None:
    field = field_snapshot(field_type="image", label="Ek görsel")
    harness = _run_dynamic_answer(monkeypatch, field=field, answer="", message_type="image")
    assert harness.order_field_calls[0]["value"] == {"message_id": 101}


def test_dynamic_image_rejects_text_and_url(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    field = field_snapshot(field_type="image", label="Ek görsel")
    harness.flow_state = {"current_state": "AWAITING_ORDER_FIELD", "state_data": {"order_id": 1, "field_snapshot_id": field["id"]}}
    harness.next_steps = [step_dynamic(field)]

    result = harness.send("https://example.com/image.jpg", message_type="text")

    assert result["durum"] == "başarılı"
    assert harness.order_field_calls == []
    assert harness.flow_transitions == []
    assert "görsel" in result["cevap"].lower()


def test_invalid_dynamic_choice_does_not_advance_or_write(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    field = field_snapshot(field_type="single_choice", label="Renk", options=[{"value": "black", "label": "Siyah"}])
    harness.flow_state = {"current_state": "AWAITING_ORDER_FIELD", "state_data": {"order_id": 1, "field_snapshot_id": field["id"]}}
    harness.next_steps = [step_dynamic(field)]

    result = harness.send("Mor")

    assert result["durum"] == "başarılı"
    assert harness.order_field_calls == []
    assert harness.flow_transitions == []
    assert "Siyah" in result["cevap"]


def test_dynamic_field_pointer_mismatch_resyncs_without_consuming(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    canonical = field_snapshot(snapshot_id=99, label="Renk", field_type="single_choice", options=[{"value": "black", "label": "Siyah"}])
    harness.flow_state = {"current_state": "AWAITING_ORDER_FIELD", "state_data": {"order_id": 1, "field_snapshot_id": 77}}
    harness.next_steps = [step_dynamic(canonical)]

    result = harness.send("Siyah")

    assert result["durum"] == "başarılı"
    assert harness.order_field_calls == []
    assert harness.flow_state["state_data"]["field_snapshot_id"] == 99


def test_dynamic_completion_notification_only_when_mutation_completed(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    field = field_snapshot()
    harness.flow_state = {"current_state": "AWAITING_ORDER_FIELD", "state_data": {"order_id": 1, "field_snapshot_id": 77}}
    harness.next_steps = [step_dynamic(field), step_complete()]
    harness.order_field_result["completed"] = False

    result = harness.send("Ali")

    assert result["durum"] == "başarılı"
    assert harness.flow_state["current_state"] == "NORMAL"
    assert harness.notifications == []


@pytest.mark.parametrize(
    ("flow_state", "state_data", "message"),
    [
        ("AWAITING_ORDER_NUMBER", {"order_id": 1}, "Ürün kırık geldi, iade etmek istiyorum"),
        ("AWAITING_CUSTOM_TEXT", {"order_id": 1}, "Ürün kırık geldi, iade etmek istiyorum"),
        ("AWAITING_ORDER_FIELD", {"order_id": 1, "field_snapshot_id": 77}, "Yanlış ürün geldi, iade istiyorum"),
        ("AWAITING_ORDER_PRODUCT", {"order_id": 1}, "Ürün kırık geldi, iade etmek istiyorum"),
    ],
)
def test_return_or_complaint_interrupts_order_mutation_before_write(
    monkeypatch: pytest.MonkeyPatch,
    flow_state: str,
    state_data: dict[str, Any],
    message: str,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": flow_state, "state_data": state_data}
    harness.classification_result = classification("return_request")

    result = harness.send(message)

    assert result["durum"] == "başarılı"
    assert result["kaynak"] == "return_issue"
    assert result["cevap"] == "Sipariş numaranızı paylaşır mısınız?"
    assert harness.order_core_calls == []
    assert harness.order_field_calls == []
    assert harness.control_transitions == []
    assert harness.return_issue_calls[0]["intent"] == "return_request"


def test_complaint_interrupts_order_field_before_write(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_ORDER_FIELD", "state_data": {"order_id": 1, "field_snapshot_id": 77}}
    harness.classification_result = classification("complaint")

    result = harness.send("Baskı tamamen hatalı")

    assert result["durum"] == "başarılı"
    assert result["kaynak"] == "return_issue"
    assert harness.order_field_calls == []
    assert harness.return_issue_calls[0]["intent"] == "complaint"


def test_control_inactive_does_not_call_any_order_collection_service(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.controls = [control(chat_service.CONTROL_STATE_SELLER_TAKEN_OVER)]
    harness.flow_state = {"current_state": "AWAITING_ORDER_CONFIRMATION", "state_data": {}}
    harness.classification_result = classification("order_confirmation_yes")

    result = harness.send("Evet aldım")

    assert result["durum"] == "otomatik_yanıt_yok"
    assert harness.order_initialize_calls == []
    assert harness.order_core_calls == []
    assert harness.order_field_calls == []
    assert harness.order_next_step_calls == []


def test_duplicate_incoming_does_not_call_order_collection_service(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.incoming_result = {"durum": "duplicate", "message": None, "mesaj": "Mesaj daha önce işlendi."}
    harness.flow_state = {"current_state": "AWAITING_ORDER_CONFIRMATION", "state_data": {}}
    harness.classification_result = classification("order_confirmation_yes")

    result = harness.send("Evet aldım")

    assert result["durum"] == "duplicate"
    assert harness.order_initialize_calls == []


def test_completion_keeps_conversation_control_active_and_next_faq_can_continue(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_CUSTOM_TEXT", "state_data": {"order_id": 1}}
    harness.next_steps = [step_custom_text(), step_complete()]
    harness.order_core_result["completed"] = True

    first = harness.send("Ali", provider_message_id="order-101")

    harness.incoming_id = 102
    harness.classification_result = classification("greeting")
    second = harness.send("Merhaba", provider_message_id="faq-102")

    assert first["durum"] == "başarılı"
    assert second["durum"] == "başarılı"
    assert second["kaynak"] == "template"
    assert harness.control_transitions == []


def test_final_control_guard_can_suppress_order_question(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.controls = [control(), control(chat_service.CONTROL_STATE_SELLER_TAKEN_OVER, version=2)]
    harness.flow_state = {"current_state": "AWAITING_ORDER_NUMBER", "state_data": {"order_id": 1}}
    harness.next_steps = [step_image()]

    result = harness.send("ETSY-12345")

    assert result["reason_code"] == "outgoing_suppressed_control_changed"
    assert [message["direction"] for message in harness.saved_messages] == ["incoming"]


def test_legacy_order_number_state_is_still_migratable(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_ORDER_NUMBER", "state_data": {}}

    result = harness.send("ETSY-12345")

    assert result["durum"] == "başarılı"
    assert harness.order_core_calls == []
    assert harness.flow_state == {"current_state": "AWAITING_IMAGE", "state_data": {"order_number": "ETSY-12345"}}


def test_legacy_image_state_is_still_migratable(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_IMAGE", "state_data": {"order_number": "ETSY-12345"}}

    result = harness.send("", message_type="image", media_url="https://example.com/image.jpg")

    assert result["durum"] == "başarılı"
    assert harness.flow_state["current_state"] == "AWAITING_CUSTOM_TEXT"


def test_legacy_custom_text_state_can_finish_without_touching_order_domain(monkeypatch: pytest.MonkeyPatch) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {
        "current_state": "AWAITING_CUSTOM_TEXT",
        "state_data": {"order_number": "ETSY-12345", "image_url": "https://example.com/image.jpg"},
    }

    result = harness.send("Ali")

    assert result["durum"] == "başarılı"
    assert harness.order_core_calls == []
    assert harness.flow_state["current_state"] == "NORMAL"
    assert len(harness.notifications) == 1


def test_order_intent_transition_failure_sends_no_question(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.classification_result = classification("order_intent")

    def fail_transition(**kwargs: Any) -> dict[str, Any]:
        harness.flow_transitions.append(kwargs)
        return {"durum": "hata", "mesaj": "db unavailable"}

    monkeypatch.setattr(chat_service, "transition_state", fail_transition)

    result = harness.send("Sipariş vermek istiyorum")

    assert result["durum"] == "hata"
    assert result["reason_code"] == "order_flow_transition_failed"
    assert result["cevap"] is None
    assert harness.flow_transitions[0]["to_state"] == "AWAITING_ORDER_CONFIRMATION"
    assert [message["direction"] for message in harness.saved_messages] == ["incoming"]


def test_legacy_order_number_transition_failure_sends_no_followup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_ORDER_NUMBER", "state_data": {}}

    def fail_transition(**kwargs: Any) -> dict[str, Any]:
        harness.flow_transitions.append(kwargs)
        return {"durum": "hata"}

    monkeypatch.setattr(chat_service, "transition_state", fail_transition)

    result = harness.send("ETSY-12345")

    assert result["durum"] == "hata"
    assert result["reason_code"] == "order_flow_transition_failed"
    assert result["cevap"] is None
    assert [message["direction"] for message in harness.saved_messages] == ["incoming"]


def test_legacy_image_transition_failure_sends_no_followup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {
        "current_state": "AWAITING_IMAGE",
        "state_data": {"order_number": "ETSY-12345"},
    }

    def fail_transition(**kwargs: Any) -> dict[str, Any]:
        harness.flow_transitions.append(kwargs)
        return {"durum": "hata"}

    monkeypatch.setattr(chat_service, "transition_state", fail_transition)

    result = harness.send(
        "",
        message_type="image",
        media_url="https://example.com/image.jpg",
    )

    assert result["durum"] == "hata"
    assert result["reason_code"] == "order_flow_transition_failed"
    assert result["cevap"] is None
    assert [message["direction"] for message in harness.saved_messages] == ["incoming"]


def _active_products() -> list[dict[str, Any]]:
    return [
        {"id": 5, "name": "Kupa"},
        {"id": 8, "name": "Termos"},
    ]


def test_zero_products_keeps_legacy_flow_without_assignment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_ORDER_CONFIRMATION", "state_data": {}}
    harness.classification_result = classification("order_confirmation_yes")
    harness.next_steps = [step_order_number()]

    result = harness.send("Evet aldım")

    assert result["durum"] == "başarılı"
    assert harness.product_decision_calls == [11]
    assert harness.product_assign_calls == []
    assert harness.flow_state == {
        "current_state": "AWAITING_ORDER_NUMBER",
        "state_data": {"order_id": 1},
    }


def test_one_active_product_is_auto_assigned_then_collection_continues(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_ORDER_CONFIRMATION", "state_data": {}}
    harness.classification_result = classification("order_confirmation_yes")
    harness.product_decision_result = {
        "durum": "başarılı",
        "decision": "single",
        "product": {"id": 5, "name": "Kupa"},
        "products": [{"id": 5, "name": "Kupa"}],
    }
    harness.next_steps = [step_order_number()]

    result = harness.send("Evet aldım")

    assert result["durum"] == "başarılı"
    assert harness.product_assign_calls[0]["product_id"] == 5
    assert harness.product_assign_calls[0]["order_id"] == 1
    assert harness.flow_state["current_state"] == "AWAITING_ORDER_NUMBER"


def test_multiple_products_enter_selection_without_guessing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_ORDER_CONFIRMATION", "state_data": {}}
    harness.classification_result = classification("order_confirmation_yes")
    harness.product_decision_result = {
        "durum": "başarılı",
        "decision": "multiple",
        "products": _active_products(),
    }

    result = harness.send("Evet aldım")

    assert result["durum"] == "başarılı"
    assert harness.product_assign_calls == []
    assert harness.flow_state == {
        "current_state": "AWAITING_ORDER_PRODUCT",
        "state_data": {"order_id": 1},
    }
    assert "1. Kupa" in result["cevap"]
    assert "2. Termos" in result["cevap"]


def test_product_selection_accepts_list_number(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {
        "current_state": "AWAITING_ORDER_PRODUCT",
        "state_data": {"order_id": 1},
    }
    harness.product_list_result = {"durum": "başarılı", "products": _active_products()}
    harness.next_steps = [step_order_number()]

    result = harness.send("2")

    assert result["durum"] == "başarılı"
    assert harness.product_assign_calls[0]["product_id"] == 8
    assert harness.flow_state["current_state"] == "AWAITING_ORDER_NUMBER"


def test_product_selection_accepts_normalized_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {
        "current_state": "AWAITING_ORDER_PRODUCT",
        "state_data": {"order_id": 1},
    }
    harness.product_list_result = {"durum": "başarılı", "products": _active_products()}
    harness.next_steps = [step_order_number()]

    result = harness.send("  KUPA  ")

    assert result["durum"] == "başarılı"
    assert harness.product_assign_calls[0]["product_id"] == 5


def test_invalid_product_number_stays_in_selection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {
        "current_state": "AWAITING_ORDER_PRODUCT",
        "state_data": {"order_id": 1},
    }
    harness.product_list_result = {"durum": "başarılı", "products": _active_products()}

    result = harness.send("9")

    assert result["durum"] == "başarılı"
    assert harness.product_assign_calls == []
    assert harness.flow_transitions == []
    assert harness.flow_state["current_state"] == "AWAITING_ORDER_PRODUCT"
    assert "1. Kupa" in result["cevap"]


def test_unknown_product_name_stays_in_selection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {
        "current_state": "AWAITING_ORDER_PRODUCT",
        "state_data": {"order_id": 1},
    }
    harness.product_list_result = {"durum": "başarılı", "products": _active_products()}

    result = harness.send("Bardak")

    assert result["durum"] == "başarılı"
    assert harness.product_assign_calls == []
    assert harness.flow_state["current_state"] == "AWAITING_ORDER_PRODUCT"


def test_partial_product_name_is_not_guessed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {
        "current_state": "AWAITING_ORDER_PRODUCT",
        "state_data": {"order_id": 1},
    }
    harness.product_list_result = {"durum": "başarılı", "products": _active_products()}

    result = harness.send("Kup")

    assert result["durum"] == "başarılı"
    assert harness.product_assign_calls == []
    assert harness.flow_state["current_state"] == "AWAITING_ORDER_PRODUCT"


def test_inactive_product_cannot_be_selected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {
        "current_state": "AWAITING_ORDER_PRODUCT",
        "state_data": {"order_id": 1},
    }
    harness.product_list_result = {
        "durum": "başarılı",
        "products": _active_products(),
    }

    result = harness.send("Eski Ürün")

    assert result["durum"] == "başarılı"
    assert harness.product_assign_calls == []
    assert harness.flow_state["current_state"] == "AWAITING_ORDER_PRODUCT"


def test_product_list_failure_does_not_guess(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_ORDER_CONFIRMATION", "state_data": {}}
    harness.classification_result = classification("order_confirmation_yes")
    harness.product_decision_result = {
        "durum": "hata",
        "error_code": "order_product_list_unavailable",
        "mesaj": "Aktif ürün listesi okunamadı.",
    }

    result = harness.send("Evet aldım")

    assert result["reason_code"] == "order_product_list_unavailable"
    assert harness.product_assign_calls == []
    assert harness.flow_transitions == []


def test_product_assignment_failure_does_not_advance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {
        "current_state": "AWAITING_ORDER_PRODUCT",
        "state_data": {"order_id": 1},
    }
    harness.product_list_result = {"durum": "başarılı", "products": _active_products()}
    harness.product_assign_result = {
        "durum": "hata",
        "error_code": "order_product_assignment_failed",
        "mesaj": "Ürün atanamadı.",
    }

    result = harness.send("1")

    assert result["reason_code"] == "order_product_assignment_failed"
    assert harness.flow_state["current_state"] == "AWAITING_ORDER_PRODUCT"


def test_existing_open_order_is_not_retrofitted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_ORDER_CONFIRMATION", "state_data": {}}
    harness.classification_result = classification("order_confirmation_yes")
    harness.order_initialize_result = {
        "durum": "başarılı",
        "order": order_record(external_order_number="ETSY-1"),
        "created": False,
        "changed": False,
        "idempotent": True,
        "snapshot_count": 0,
    }
    harness.product_decision_result = {
        "durum": "başarılı",
        "decision": "single",
        "product": {"id": 5, "name": "Kupa"},
        "products": [{"id": 5, "name": "Kupa"}],
    }
    harness.next_steps = [step_image()]

    result = harness.send("Evet aldım")

    assert result["durum"] == "başarılı"
    assert harness.product_decision_calls == []
    assert harness.product_assign_calls == []
    assert harness.flow_state["current_state"] == "AWAITING_IMAGE"


def test_product_selection_transition_failure_does_not_send_prompt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = ChatHarness().install(monkeypatch)
    harness.flow_state = {"current_state": "AWAITING_ORDER_CONFIRMATION", "state_data": {}}
    harness.classification_result = classification("order_confirmation_yes")
    harness.product_decision_result = {
        "durum": "başarılı",
        "decision": "multiple",
        "products": _active_products(),
    }

    def fail_transition(**kwargs: Any) -> dict[str, Any]:
        harness.flow_transitions.append(kwargs)
        return {"durum": "hata", "mesaj": "db unavailable"}

    monkeypatch.setattr(chat_service, "transition_state", fail_transition)

    result = harness.send("Evet aldım")

    assert result["reason_code"] == "order_flow_transition_failed"
    assert result["cevap"] is None
    assert [message["direction"] for message in harness.saved_messages] == ["incoming"]

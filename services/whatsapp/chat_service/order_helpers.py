from __future__ import annotations

from typing import Any

from . import dependencies as deps
from . import responses
from .content import OutgoingControlContext


def _order_flow_error(
    *,
    customer_id: int,
    incoming_message_id: int | None,
    message: str,
    reason_code: str = "order_persist_failed",
) -> dict[str, Any]:
    return {
        "durum": "hata",
        "cevap": None,
        "reason_code": reason_code,
        "mesaj": message,
        "customer_id": customer_id,
        "incoming_message_id": incoming_message_id,
    }


def _transition_order_collection_step(
    *,
    seller_id: int,
    customer_id: int,
    order_id: int,
    step_result: dict[str, Any],
    source_message_id: int,
    control_context: OutgoingControlContext,
    completion_just_happened: bool = False,
    ai_confidence: float | None = None,
) -> dict[str, Any]:
    if step_result.get("durum") != "başarılı":
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_collection_unavailable",
            message=step_result.get("mesaj") or "Sipariş toplama adımı belirlenemedi.",
        )
    if step_result.get("blocked") is True:
        return responses.stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_seller_review_required",
            reason_text="Sipariş satıcı incelemesi gerektiriyor; otomatik toplama ilerletilmedi.",
        )

    step = step_result.get("step")
    if step == "complete" or step_result.get("complete") is True:
        transition_result = deps.transition_state(
            seller_id=seller_id,
            customer_id=customer_id,
            to_state="NORMAL",
            reason_code="user_action",
            trigger_message_id=source_message_id,
            state_data={},
        )
        if transition_result.get("durum") != "başarılı":
            return _order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_flow_transition_failed",
                message="Sipariş tamamlandı fakat sohbet akışı güvenli biçimde güncellenemedi.",
            )
        if completion_just_happened:
            deps.create_seller_notification(
                seller_id=seller_id,
                customer_id=customer_id,
                notification_type="new_order",
                severity="info",
                title="Yeni sipariş bilgileri alındı",
                message="Sipariş bilgileri tamamlandı.",
                related_entity_type="customer",
                related_entity_id=customer_id,
                action_url=f"/panel/customers/{customer_id}",
            )
        return responses.outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text="Bilgilerinizi aldım. Satıcımız siparişinizi kontrol edecek.",
            source="state",
            control_context=control_context,
            ai_confidence=ai_confidence,
        )

    state_by_step = {
        "order_number": "AWAITING_ORDER_NUMBER",
        "image": "AWAITING_IMAGE",
        "custom_text": "AWAITING_CUSTOM_TEXT",
        "dynamic_field": "AWAITING_ORDER_FIELD",
    }
    target_state = state_by_step.get(step)
    if target_state is None:
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_collection_invalid_step",
            message="Sipariş toplama servisi geçersiz bir adım döndürdü.",
        )

    state_data: dict[str, Any] = {"order_id": order_id}
    if step == "dynamic_field":
        field = step_result.get("field")
        field_snapshot_id = field.get("id") if isinstance(field, dict) else None
        if (
            not isinstance(field_snapshot_id, int)
            or isinstance(field_snapshot_id, bool)
            or field_snapshot_id <= 0
        ):
            return _order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_collection_invalid_field",
                message="Zorunlu sipariş alanı güvenli biçimde belirlenemedi.",
            )
        state_data["field_snapshot_id"] = field_snapshot_id

    question = step_result.get("question")
    if not isinstance(question, str) or not question.strip():
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_collection_invalid_question",
            message="Sipariş toplama sorusu güvenli biçimde oluşturulamadı.",
        )

    transition_result = deps.transition_state(
        seller_id=seller_id,
        customer_id=customer_id,
        to_state=target_state,
        reason_code="user_action",
        trigger_message_id=source_message_id,
        state_data=state_data,
        expires_in_hours=24,
    )
    if transition_result.get("durum") != "başarılı":
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_flow_transition_failed",
            message="Sipariş toplama akışı güvenli biçimde ilerletilemedi.",
        )
    return responses.outgoing_response(
        seller_id=seller_id,
        customer_id=customer_id,
        response_text=question.strip(),
        source="state",
        control_context=control_context,
        ai_confidence=ai_confidence,
    )


def _continue_order_after_product_assignment(
    *,
    seller_id: int,
    customer_id: int,
    order_id: int,
    product_id: int,
    source_message_id: int,
    control_context: OutgoingControlContext,
    expected_version: int | None = None,
    ai_confidence: float | None = None,
) -> dict[str, Any]:
    assign_result = deps.order_set_order_product(
        seller_id,
        customer_id,
        order_id,
        product_id,
        expected_version=expected_version,
    )
    if assign_result.get("durum") == "ürün_değişikliği_inceleme_gerekli":
        step_result = deps.order_get_next_collection_step(seller_id, order_id)
        return _transition_order_collection_step(
            seller_id=seller_id,
            customer_id=customer_id,
            order_id=order_id,
            step_result=step_result,
            source_message_id=source_message_id,
            control_context=control_context,
            ai_confidence=ai_confidence,
        )
    if assign_result.get("durum") != "başarılı":
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code=str(assign_result.get("error_code") or "order_product_assignment_failed"),
            message=assign_result.get("mesaj") or "Sipariş ürünü güvenli biçimde atanamadı.",
        )
    step_result = deps.order_get_next_collection_step(seller_id, order_id)
    return _transition_order_collection_step(
        seller_id=seller_id,
        customer_id=customer_id,
        order_id=order_id,
        step_result=step_result,
        source_message_id=source_message_id,
        control_context=control_context,
        ai_confidence=ai_confidence,
    )


def _is_positive_order_id(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _order_has_assigned_product(order: dict[str, Any]) -> bool:
    return _is_positive_order_id(order.get("product_id"))


def _order_collection_has_progressed(order: dict[str, Any]) -> bool:
    if _is_positive_order_id(order.get("image_message_id")):
        return True
    custom_text = order.get("custom_text")
    return isinstance(custom_text, str) and bool(custom_text.strip())


def _should_attempt_order_product_resolution(
    order_result: dict[str, Any],
    state: dict[str, Any],
) -> bool:
    if order_result.get("created") is True:
        return True
    return (state.get("state_data") or {}).get("awaiting_product_resolution") is True


def _ensure_product_resolution_marker(
    *,
    seller_id: int,
    customer_id: int,
    order_id: int,
    source_message_id: int,
    state_data: dict[str, Any],
) -> dict[str, Any] | None:
    if state_data.get("awaiting_product_resolution") is True:
        return None
    transition_result = deps.transition_state(
        seller_id=seller_id,
        customer_id=customer_id,
        to_state="AWAITING_ORDER_CONFIRMATION",
        reason_code="user_action",
        trigger_message_id=source_message_id,
        state_data={"order_id": order_id, "awaiting_product_resolution": True},
        expires_in_hours=24,
    )
    if transition_result.get("durum") != "başarılı":
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_flow_transition_failed",
            message="Ürün seçim akışı güvenli biçimde işaretlenemedi.",
        )
    return None


def _resolve_order_product_for_new_or_retry(
    *,
    seller_id: int,
    customer_id: int,
    order: dict[str, Any],
    order_id: int,
    source_message_id: int,
    control_context: OutgoingControlContext,
    state_data: dict[str, Any],
    ai_confidence: float | None = None,
) -> dict[str, Any] | None:
    if _order_has_assigned_product(order) or _order_collection_has_progressed(order):
        return None
    marker_error = _ensure_product_resolution_marker(
        seller_id=seller_id,
        customer_id=customer_id,
        order_id=order_id,
        source_message_id=source_message_id,
        state_data=state_data,
    )
    if marker_error is not None:
        return marker_error

    decision = deps.order_resolve_new_order_product(seller_id)
    if decision.get("durum") != "başarılı":
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code=str(decision.get("error_code") or "order_product_list_unavailable"),
            message=decision.get("mesaj") or "Aktif ürün listesi okunamadı.",
        )
    if decision.get("decision") == "single":
        product = decision.get("product") or {}
        product_id = product.get("id")
        if not _is_positive_order_id(product_id):
            return _order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_product_assignment_failed",
                message="Aktif ürün kimliği doğrulanamadı.",
            )
        expected_version = order.get("version")
        return _continue_order_after_product_assignment(
            seller_id=seller_id,
            customer_id=customer_id,
            order_id=order_id,
            product_id=product_id,
            source_message_id=source_message_id,
            control_context=control_context,
            expected_version=expected_version if _is_positive_order_id(expected_version) else None,
            ai_confidence=ai_confidence,
        )
    if decision.get("decision") == "multiple":
        return _prompt_order_product_selection(
            seller_id=seller_id,
            customer_id=customer_id,
            order_id=order_id,
            products=list(decision.get("products") or []),
            source_message_id=source_message_id,
            control_context=control_context,
            ai_confidence=ai_confidence,
        )
    return None


def _prompt_order_product_selection(
    *,
    seller_id: int,
    customer_id: int,
    order_id: int,
    products: list[dict[str, Any]],
    source_message_id: int,
    control_context: OutgoingControlContext,
    ai_confidence: float | None = None,
) -> dict[str, Any]:
    question = deps.order_build_product_selection_question(products)
    if not question.strip():
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_product_question_unavailable",
            message="Ürün seçim sorusu güvenli biçimde oluşturulamadı.",
        )
    transition_result = deps.transition_state(
        seller_id=seller_id,
        customer_id=customer_id,
        to_state="AWAITING_ORDER_PRODUCT",
        reason_code="user_action",
        trigger_message_id=source_message_id,
        state_data={"order_id": order_id},
        expires_in_hours=24,
    )
    if transition_result.get("durum") != "başarılı":
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_flow_transition_failed",
            message="Ürün seçim akışı güvenli biçimde ilerletilemedi.",
        )
    return responses.outgoing_response(
        seller_id=seller_id,
        customer_id=customer_id,
        response_text=question,
        source="state",
        control_context=control_context,
        ai_confidence=ai_confidence,
    )


def _invalid_dynamic_field_response(
    field: dict[str, Any],
    fallback_question: str,
) -> str:
    field_type = field.get("field_type")
    if field_type == "number":
        return "Bu alan için sayısal bir değer paylaşır mısınız?"
    if field_type == "boolean":
        return "Bu alan için evet veya hayır olarak yanıtlayabilir misiniz?"
    if field_type == "image":
        return "Bu alan için bir görsel gönderebilir misiniz?"
    if field_type in {"single_choice", "multi_choice"}:
        labels = [
            str(option.get("label")).strip()
            for option in field.get("options", [])
            if isinstance(option, dict)
            and isinstance(option.get("label"), str)
            and option.get("label").strip()
        ]
        if labels:
            return "Bu alan için şu seçeneklerden birini paylaşır mısınız? " + ", ".join(labels)
    return fallback_question

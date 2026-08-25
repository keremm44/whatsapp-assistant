from __future__ import annotations

from typing import Any

from . import content
from . import dependencies as deps
from . import order_helpers
from . import responses
from .content import OutgoingControlContext


def process_active_state(
    seller_id: int,
    customer_id: int,
    state: dict[str, Any],
    user_message: str,
    message_type: str,
    media_url: str | None,
    source_message_id: int | None,
    store_link: str,
    control_context: OutgoingControlContext,
) -> dict[str, Any] | None:
    current_state = state.get("current_state", "NORMAL")
    if current_state == "NORMAL":
        return None
    if source_message_id is None:
        return order_helpers._order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="incoming_message_id_unavailable",
            message="Sipariş akışı için kaynak mesaj kimliği bulunamadı.",
        )

    if current_state == "AWAITING_ORDER_CONFIRMATION":
        classification = deps.classify_intent(user_message)
        if (
            classification.get("intent") == "order_confirmation_yes"
            and deps.intent_is_safe(classification)
        ):
            order_result = deps.order_initialize_collection(
                seller_id=seller_id,
                customer_id=customer_id,
                source_message_id=source_message_id,
            )
            if order_result.get("durum") != "başarılı":
                return order_helpers._order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    message="Sipariş kaydı oluşturulamadı; yeniden denenebilir.",
                )
            order = order_result.get("order")
            order_id = order.get("id") if isinstance(order, dict) else None
            if not isinstance(order_id, int) or isinstance(order_id, bool) or order_id <= 0:
                return order_helpers._order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    reason_code="order_id_unavailable",
                    message="Sipariş kimliği doğrulanamadı.",
                )
            if order_helpers._should_attempt_order_product_resolution(order_result, state):
                product_response = order_helpers._resolve_order_product_for_new_or_retry(
                    seller_id=seller_id,
                    customer_id=customer_id,
                    order=order,
                    order_id=order_id,
                    source_message_id=source_message_id,
                    control_context=control_context,
                    state_data=state.get("state_data") or {},
                    ai_confidence=classification.get("confidence"),
                )
                if product_response is not None:
                    return product_response
            step_result = deps.order_get_next_collection_step(seller_id, order_id)
            return order_helpers._transition_order_collection_step(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                step_result=step_result,
                source_message_id=source_message_id,
                control_context=control_context,
                ai_confidence=classification.get("confidence"),
            )

        if (
            classification.get("intent") == "order_confirmation_no"
            and deps.intent_is_safe(classification)
        ):
            transition_result = deps.transition_state(
                seller_id=seller_id,
                customer_id=customer_id,
                to_state="NORMAL",
                reason_code="user_action",
                trigger_message_id=source_message_id,
            )
            if transition_result.get("durum") != "başarılı":
                return order_helpers._order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    reason_code="order_flow_transition_failed",
                    message="Sipariş onayı akışı güvenli biçimde kapatılamadı.",
                )
            link_text = store_link or content.DEFAULT_STORE_LINK_TEXT
            return responses.outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=(
                    "Mağazamızdan sipariş verdikten sonra sipariş numaranızı "
                    f"buradan paylaşabilirsiniz: {link_text}"
                ),
                source="state",
                control_context=control_context,
                ai_confidence=classification.get("confidence"),
            )
        return None

    if current_state == "AWAITING_ORDER_PRODUCT":
        state_data = state.get("state_data") or {}
        order_id = state_data.get("order_id")
        if not isinstance(order_id, int) or isinstance(order_id, bool) or order_id <= 0:
            return order_helpers._order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_flow_state_invalid",
                message="Ürün seçim state pointer'ı geçersiz.",
            )
        listed = deps.order_list_active_products(seller_id)
        if listed.get("durum") != "başarılı":
            return order_helpers._order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code=str(listed.get("error_code") or "order_product_list_unavailable"),
                message=listed.get("mesaj") or "Aktif ürün listesi okunamadı.",
            )
        products = list(listed.get("products") or [])
        if len(products) == 0:
            step_result = deps.order_get_next_collection_step(seller_id, order_id)
            return order_helpers._transition_order_collection_step(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                step_result=step_result,
                source_message_id=source_message_id,
                control_context=control_context,
            )
        if len(products) == 1:
            product_id = products[0].get("id")
            if not isinstance(product_id, int) or isinstance(product_id, bool) or product_id <= 0:
                return order_helpers._order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    reason_code="order_product_assignment_failed",
                    message="Aktif ürün kimliği doğrulanamadı.",
                )
            return order_helpers._continue_order_after_product_assignment(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                product_id=product_id,
                source_message_id=source_message_id,
                control_context=control_context,
            )

        match = deps.order_match_product_selection(user_message, products)
        if match.get("durum") != "başarılı":
            question = deps.order_build_product_selection_question(products)
            return responses.outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=question,
                source="state",
                control_context=control_context,
            )
        product = match.get("product") or {}
        product_id = product.get("id")
        if not isinstance(product_id, int) or isinstance(product_id, bool) or product_id <= 0:
            return order_helpers._order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_product_assignment_failed",
                message="Seçilen ürün kimliği doğrulanamadı.",
            )
        return order_helpers._continue_order_after_product_assignment(
            seller_id=seller_id,
            customer_id=customer_id,
            order_id=order_id,
            product_id=product_id,
            source_message_id=source_message_id,
            control_context=control_context,
        )

    if current_state == "AWAITING_ORDER_NUMBER":
        order_number = content.extract_order_number(user_message)
        if order_number:
            state_data = state.get("state_data") or {}
            order_id = state_data.get("order_id")
            if order_id is not None:
                core_result = deps.order_update_core_from_message(
                    seller_id=seller_id,
                    customer_id=customer_id,
                    order_id=order_id,
                    source_message_id=source_message_id,
                    external_order_number=order_number,
                )
                if core_result.get("durum") != "başarılı":
                    return order_helpers._order_flow_error(
                        customer_id=customer_id,
                        incoming_message_id=source_message_id,
                        message="Sipariş numarası kaydedilemedi; yeniden denenebilir.",
                    )
                step_result = deps.order_get_next_collection_step(seller_id, order_id)
                return order_helpers._transition_order_collection_step(
                    seller_id=seller_id,
                    customer_id=customer_id,
                    order_id=order_id,
                    step_result=step_result,
                    source_message_id=source_message_id,
                    control_context=control_context,
                    completion_just_happened=core_result.get("completed") is True,
                )

            transition_result = deps.transition_state(
                seller_id=seller_id,
                customer_id=customer_id,
                to_state="AWAITING_IMAGE",
                reason_code="user_action",
                trigger_message_id=source_message_id,
                state_data={"order_number": order_number},
                expires_in_hours=24,
            )
            if transition_result.get("durum") != "başarılı":
                return order_helpers._order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    reason_code="order_flow_transition_failed",
                    message="Eski sipariş akışı görsel adımına güvenli biçimde ilerletilemedi.",
                )
            return responses.outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=(
                    f"Sipariş numaranızı {order_number} olarak aldım. "
                    "Şimdi kupaya basılacak görselinizi gönderebilirsiniz."
                ),
                source="state",
                control_context=control_context,
            )
        if content.check_negative_order_context(user_message):
            return responses.outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text="Sipariş numaranızı bulduğunuzda buradan paylaşabilirsiniz.",
                source="state",
                control_context=control_context,
            )
        return None

    if current_state == "AWAITING_IMAGE":
        state_data = state.get("state_data") or {}
        order_id = state_data.get("order_id")
        if order_id is not None:
            if message_type != "image":
                current_step = deps.order_get_next_collection_step(seller_id, order_id)
                if current_step.get("durum") != "başarılı" or current_step.get("step") != "image":
                    return order_helpers._transition_order_collection_step(
                        seller_id=seller_id,
                        customer_id=customer_id,
                        order_id=order_id,
                        step_result=current_step,
                        source_message_id=source_message_id,
                        control_context=control_context,
                    )
                return None

            core_result = deps.order_update_core_from_message(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                source_message_id=source_message_id,
                image_message_id=source_message_id,
            )
            if core_result.get("durum") != "başarılı":
                return order_helpers._order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    message="Görsel kaydedilemedi; yeniden denenebilir.",
                )
            step_result = deps.order_get_next_collection_step(seller_id, order_id)
            return order_helpers._transition_order_collection_step(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                step_result=step_result,
                source_message_id=source_message_id,
                control_context=control_context,
                completion_just_happened=core_result.get("completed") is True,
            )

        is_image = message_type == "image" or bool(media_url)
        if is_image:
            next_state_data = {
                "order_number": state_data.get("order_number"),
                "image_url": media_url,
            }
            transition_result = deps.transition_state(
                seller_id=seller_id,
                customer_id=customer_id,
                to_state="AWAITING_CUSTOM_TEXT",
                reason_code="user_action",
                trigger_message_id=source_message_id,
                state_data=next_state_data,
                expires_in_hours=24,
            )
            if transition_result.get("durum") != "başarılı":
                return order_helpers._order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    reason_code="order_flow_transition_failed",
                    message="Eski sipariş akışı özel metin adımına güvenli biçimde ilerletilemedi.",
                )
            return responses.outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=(
                    "Görselinizi aldım. Kupaya eklenmesini istediğiniz özel "
                    "bir yazı varsa paylaşabilirsiniz. Yoksa “yok” yazabilirsiniz."
                ),
                source="state",
                control_context=control_context,
            )
        return None

    if current_state == "AWAITING_CUSTOM_TEXT":
        state_data = state.get("state_data") or {}
        order_id = state_data.get("order_id")
        custom_text = user_message.strip()
        if order_id is not None:
            current_step = deps.order_get_next_collection_step(seller_id, order_id)
            if current_step.get("durum") != "başarılı":
                return order_helpers._transition_order_collection_step(
                    seller_id=seller_id,
                    customer_id=customer_id,
                    order_id=order_id,
                    step_result=current_step,
                    source_message_id=source_message_id,
                    control_context=control_context,
                )
            if current_step.get("step") != "custom_text":
                return order_helpers._transition_order_collection_step(
                    seller_id=seller_id,
                    customer_id=customer_id,
                    order_id=order_id,
                    step_result=current_step,
                    source_message_id=source_message_id,
                    control_context=control_context,
                )
            if not custom_text:
                return None
            if custom_text.lower() in {"yok", "istemiyorum", "olmasın", "hayır"}:
                return responses.outgoing_response(
                    seller_id=seller_id,
                    customer_id=customer_id,
                    response_text=(
                        "Bu sipariş için özel yazı zorunlu. "
                        "Üründe kullanılacak özel yazıyı paylaşır mısınız?"
                    ),
                    source="state",
                    control_context=control_context,
                )
            core_result = deps.order_update_core_from_message(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                source_message_id=source_message_id,
                custom_text=custom_text,
            )
            if core_result.get("durum") != "başarılı":
                return order_helpers._order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    message="Özel metin kaydedilemedi; yeniden denenebilir.",
                )
            step_result = deps.order_get_next_collection_step(seller_id, order_id)
            return order_helpers._transition_order_collection_step(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                step_result=step_result,
                source_message_id=source_message_id,
                control_context=control_context,
                completion_just_happened=core_result.get("completed") is True,
            )

        if not custom_text:
            return None
        custom_text_value = None
        if custom_text.lower() not in {"yok", "istemiyorum", "olmasın", "hayır"}:
            custom_text_value = custom_text
        transition_result = deps.transition_state(
            seller_id=seller_id,
            customer_id=customer_id,
            to_state="NORMAL",
            reason_code="user_action",
            trigger_message_id=source_message_id,
            state_data={},
            metadata={
                "order_number": state_data.get("order_number"),
                "image_url": state_data.get("image_url"),
                "custom_text": custom_text_value,
            },
        )
        if transition_result.get("durum") != "başarılı":
            return order_helpers._order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_flow_transition_failed",
                message="Eski sipariş akışı güvenli biçimde tamamlanamadı.",
            )
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
        )

    if current_state == "AWAITING_ORDER_FIELD":
        state_data = state.get("state_data") or {}
        order_id = state_data.get("order_id")
        expected_field_snapshot_id = state_data.get("field_snapshot_id")
        if (
            not isinstance(order_id, int)
            or isinstance(order_id, bool)
            or order_id <= 0
            or not isinstance(expected_field_snapshot_id, int)
            or isinstance(expected_field_snapshot_id, bool)
            or expected_field_snapshot_id <= 0
        ):
            return order_helpers._order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_flow_state_invalid",
                message="Dinamik sipariş alanı state pointer'ları geçersiz.",
            )

        current_step = deps.order_get_next_collection_step(seller_id, order_id)
        if current_step.get("durum") != "başarılı":
            return order_helpers._transition_order_collection_step(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                step_result=current_step,
                source_message_id=source_message_id,
                control_context=control_context,
            )
        field = current_step.get("field")
        current_field_snapshot_id = field.get("id") if isinstance(field, dict) else None
        if current_step.get("step") != "dynamic_field" or current_field_snapshot_id != expected_field_snapshot_id:
            return order_helpers._transition_order_collection_step(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                step_result=current_step,
                source_message_id=source_message_id,
                control_context=control_context,
            )

        assert isinstance(field, dict)
        field_type = field.get("field_type")
        raw_value: Any = user_message
        if field_type == "image":
            if message_type != "image":
                return responses.outgoing_response(
                    seller_id=seller_id,
                    customer_id=customer_id,
                    response_text=order_helpers._invalid_dynamic_field_response(
                        field,
                        current_step.get("question") or "Bir görsel gönderebilir misiniz?",
                    ),
                    source="state",
                    control_context=control_context,
                )
            raw_value = {"message_id": source_message_id}

        parse_result = deps.order_parse_collection_field_answer(field, raw_value)
        if parse_result.get("durum") != "başarılı":
            return responses.outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=order_helpers._invalid_dynamic_field_response(
                    field,
                    current_step.get("question") or "Bu bilgiyi yeniden paylaşır mısınız?",
                ),
                source="state",
                control_context=control_context,
            )

        record_result = deps.order_record_field_value(
            seller_id=seller_id,
            customer_id=customer_id,
            order_id=order_id,
            field_snapshot_id=expected_field_snapshot_id,
            field_type=str(field_type),
            value=parse_result["value"],
            source_message_id=source_message_id,
            options=field.get("options") if isinstance(field.get("options"), list) else [],
            validation_config=(
                field.get("validation_config")
                if isinstance(field.get("validation_config"), dict)
                else {}
            ),
        )
        if record_result.get("durum") != "başarılı":
            return order_helpers._order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                message="Sipariş alanı kaydedilemedi; yeniden denenebilir.",
            )
        step_result = deps.order_get_next_collection_step(seller_id, order_id)
        return order_helpers._transition_order_collection_step(
            seller_id=seller_id,
            customer_id=customer_id,
            order_id=order_id,
            step_result=step_result,
            source_message_id=source_message_id,
            control_context=control_context,
            completion_just_happened=record_result.get("completed") is True,
        )

    if current_state == "AWAITING_SELLER":
        return None
    return None

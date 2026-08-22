from __future__ import annotations

from typing import Any

from . import content
from . import dependencies as deps
from . import order_change_confirmation
from . import order_helpers
from . import order_state
from . import responses
from . import return_flow
from .content import OutgoingControlContext


def _pending_change_response(
    *,
    seller_id: int,
    customer_id: int,
    source_message_id: int,
    state: dict[str, Any],
    user_message: str,
    message_type: str,
    control_context: OutgoingControlContext,
) -> dict[str, Any] | None:
    if state.get("current_state") != "AWAITING_ORDER_CHANGE_CONFIRMATION":
        return None

    classification = deps.classify_intent(user_message or "")
    if (
        deps.intent_is_safe(classification)
        and classification.get("intent") in {"return_request", "complaint"}
    ):
        return return_flow.handle_return_review_intent(
            seller_id=seller_id,
            customer_id=customer_id,
            user_message=user_message or "",
            message_type=message_type,
            incoming_message_id=source_message_id,
            intent=str(classification["intent"]),
            control_context=control_context,
        )

    state_data = state.get("state_data") or {}
    order_id = state_data.get("order_id")
    expected_version = state_data.get("order_version")
    old_text = state_data.get("old_text")
    new_text = state_data.get("new_text")
    external_order_number = state_data.get("external_order_number")
    if (
        not isinstance(order_id, int)
        or isinstance(order_id, bool)
        or order_id <= 0
        or not isinstance(expected_version, int)
        or isinstance(expected_version, bool)
        or expected_version <= 0
        or not isinstance(old_text, str)
        or not old_text.strip()
        or not isinstance(new_text, str)
        or not new_text.strip()
    ):
        return responses.stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_change_confirmation_state_invalid",
            reason_text="Bekleyen kişiselleştirme değişikliği güvenli biçimde doğrulanamadı.",
            fail_closed=True,
        )

    decision = order_change_confirmation.confirmation_decision(user_message)
    if decision == "no":
        transition_result = deps.transition_state(
            seller_id=seller_id,
            customer_id=customer_id,
            to_state="NORMAL",
            reason_code="user_action",
            trigger_message_id=source_message_id,
            state_data={},
        )
        if transition_result.get("durum") != "başarılı":
            return order_helpers._order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_flow_transition_failed",
                message="Değişiklik onayı güvenli biçimde kapatılamadı.",
            )
        return responses.outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text="Değişikliği uygulamadım. Mevcut kişiselleştirme bilgisi aynı kaldı.",
            source="state",
            control_context=control_context,
            ai_confidence=classification.get("confidence"),
        )

    if decision == "yes":
        applied = order_change_confirmation.apply_confirmed_custom_text_change(
            seller_id=seller_id,
            customer_id=customer_id,
            order_id=order_id,
            source_message_id=source_message_id,
            new_text=new_text,
            expected_version=expected_version,
        )
        if applied.get("durum") != "başarılı":
            return responses.stored_no_auto_reply(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code=str(applied.get("reason_code") or "confirmed_change_failed"),
                reason_text="Sipariş siz onaylarken değişti veya güncelleme güvenli biçimde yapılamadı; satıcı incelemesi gerekiyor.",
                fail_closed=True,
            )

        transition_result = deps.transition_state(
            seller_id=seller_id,
            customer_id=customer_id,
            to_state="NORMAL",
            reason_code="user_action",
            trigger_message_id=source_message_id,
            state_data={},
        )
        if transition_result.get("durum") != "başarılı":
            return order_helpers._order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_flow_transition_failed",
                message="Değişiklik kaydedildi fakat onay state'i güvenli biçimde kapatılamadı.",
            )

        if applied.get("seller_review_required") is True:
            deps.create_seller_notification(
                seller_id=seller_id,
                customer_id=customer_id,
                notification_type="order_review",
                severity="warning",
                title="Onaylanmış kişiselleştirme değişikliği",
                message="Müşteri tamamlanmış siparişte kişiselleştirme yazısı değişikliğini onayladı.",
                related_entity_type="order",
                related_entity_id=order_id,
                action_url=f"/seller/orders?order={order_id}",
            )
            response_text = (
                f"Değişikliği onayladınız: “{old_text}” yerine “{new_text}”. "
                "Bilgi kaydedildi ve üretim açısından satıcı incelemesine bırakıldı."
            )
        else:
            response_text = f"Değişikliği onayladınız: “{old_text}” yerine “{new_text}” olarak kaydettim."

        return responses.outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text=response_text,
            source="state",
            control_context=control_context,
            ai_confidence=classification.get("confidence"),
        )

    order_label = (
        f"Sipariş {external_order_number}: "
        if isinstance(external_order_number, str) and external_order_number.strip()
        else "Bu sipariş için "
    )
    return responses.outgoing_response(
        seller_id=seller_id,
        customer_id=customer_id,
        response_text=(
            f"{order_label}“{old_text}” yerine “{new_text}” yazılmasını istediğinizi anladım. "
            "Doğruysa “onaylıyorum”, vazgeçtiyseniz “iptal” yazabilirsiniz."
        ),
        source="state",
        control_context=control_context,
        ai_confidence=classification.get("confidence"),
    )


def _maybe_start_personalization_change_confirmation(
    *,
    seller_id: int,
    customer_id: int,
    source_message_id: int,
    user_message: str,
    classification: dict[str, Any],
    control_context: OutgoingControlContext,
) -> dict[str, Any] | None:
    turn = classification.get("turn")
    if (
        not deps.intent_is_safe(classification)
        or classification.get("turn_understanding_valid") is not True
        or not isinstance(turn, dict)
        or turn.get("correction_requested") is not True
    ):
        return None

    proposal = order_change_confirmation.build_custom_text_change_proposal(
        seller_id=seller_id,
        customer_id=customer_id,
        message=user_message,
    )
    status = proposal.get("status")
    if status == "not_explicit":
        return responses.outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text=(
                "Değiştirmek istediğiniz bilgiyi kesinleştirebilmem için eski ve yeni yazıyı birlikte belirtin. "
                "Örneğin: “Elif değil Ayşe olsun.”"
            ),
            source="state",
            control_context=control_context,
            ai_confidence=classification.get("confidence"),
        )
    if status == "ambiguous_order":
        return responses.outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text=(
                "Birden fazla siparişinizle eşleşebilecek bir değişiklik görüyorum. "
                "Yanlış siparişi değiştirmemek için sipariş numaranızı da yazar mısınız?"
            ),
            source="state",
            control_context=control_context,
            ai_confidence=classification.get("confidence"),
        )
    if status == "old_value_mismatch":
        return responses.outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text=(
                "Belirttiğiniz eski yazı kayıtlı kişiselleştirme bilgisiyle güvenli biçimde eşleşmedi. "
                "Sipariş numarasıyla birlikte “eski yazı değil yeni yazı olsun” şeklinde tekrar yazar mısınız?"
            ),
            source="state",
            control_context=control_context,
            ai_confidence=classification.get("confidence"),
        )
    if status != "proposal":
        return responses.stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_change_proposal_unavailable",
            reason_text="Kişiselleştirme değişikliği güvenli biçimde siparişle eşleştirilemedi.",
            fail_closed=True,
        )

    transition_result = deps.transition_state(
        seller_id=seller_id,
        customer_id=customer_id,
        to_state="AWAITING_ORDER_CHANGE_CONFIRMATION",
        reason_code="user_action",
        trigger_message_id=source_message_id,
        state_data={
            "order_id": proposal["order_id"],
            "order_version": proposal["order_version"],
            "external_order_number": proposal.get("external_order_number"),
            "old_text": proposal["old_text"],
            "new_text": proposal["new_text"],
        },
        expires_in_hours=24,
    )
    if transition_result.get("durum") != "başarılı":
        return order_helpers._order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_flow_transition_failed",
            message="Kişiselleştirme değişikliği onay adımına güvenli biçimde alınamadı.",
        )

    order_label = (
        f"Sipariş {proposal.get('external_order_number')}: "
        if proposal.get("external_order_number")
        else "Bu sipariş için "
    )
    return responses.outgoing_response(
        seller_id=seller_id,
        customer_id=customer_id,
        response_text=(
            f"{order_label}“{proposal['old_text']}” yerine “{proposal['new_text']}” yazılmasını istediğinizi anladım. "
            "Bu değişiklik üretim bilgisini etkileyebilir. Doğruysa “onaylıyorum” yazabilirsiniz."
        ),
        source="state",
        control_context=control_context,
        ai_confidence=classification.get("confidence"),
    )


def sohbet_isle(
    seller_id: int,
    whatsapp_number: str,
    kullanici_mesaji: str,
    customer_name: str | None = None,
    provider: str = "internal",
    provider_message_id: str | None = None,
    message_type: str = "text",
    media_url: str | None = None,
) -> dict[str, Any]:
    """Ana güvenli sohbet akışı."""
    if not kullanici_mesaji and not media_url and message_type != "image":
        return {"durum": "hata", "mesaj": "Boş mesaj işlenemez."}

    seller_result = deps.get_seller_by_id(seller_id)
    if seller_result.get("durum") != "başarılı":
        return {"durum": "hata", "mesaj": "Satıcı bulunamadı."}

    seller = seller_result["satıcı"]
    store_link = str(seller.get("store_link") or "").strip()
    product_info = seller.get("product_info") or {}

    customer_result = deps.get_or_create_customer(
        seller_id=seller_id,
        whatsapp_number=whatsapp_number,
        name=customer_name,
    )
    if customer_result.get("durum") == "hata":
        return customer_result

    customer = customer_result["customer"]
    customer_id = customer["id"]
    incoming_result = deps.save_message(
        seller_id=seller_id,
        customer_id=customer_id,
        direction="incoming",
        content=kullanici_mesaji,
        message_type=message_type,
        media_url=media_url,
        provider=provider,
        provider_message_id=provider_message_id,
    )
    if incoming_result.get("durum") == "duplicate":
        return {
            "durum": "duplicate",
            "cevap": None,
            "customer_id": customer_id,
            "mesaj": "Mesaj daha önce işlendi.",
        }
    if incoming_result.get("durum") != "başarılı":
        return {
            "durum": "hata",
            "cevap": None,
            "reason_code": "incoming_persist_failed",
            "mesaj": "Gelen mesaj kaydedilemedi; yeniden denenebilir.",
            "customer_id": customer_id,
        }

    incoming_message = incoming_result["message"]
    incoming_message_id = incoming_message.get("id")
    if (
        not isinstance(incoming_message_id, int)
        or isinstance(incoming_message_id, bool)
        or incoming_message_id <= 0
    ):
        return {
            "durum": "hata",
            "cevap": None,
            "reason_code": "incoming_message_id_unavailable",
            "mesaj": "Kaydedilen mesaj kimliği doğrulanamadı.",
            "customer_id": customer_id,
        }

    lifecycle_block = content.seller_lifecycle_block(seller)
    if lifecycle_block:
        reason_code, reason_text = lifecycle_block
        return responses.stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code=f"stored_seller_{reason_code}",
            reason_text=reason_text,
        )

    control_result = deps.get_conversation_control(
        seller_id=seller_id,
        customer_id=customer_id,
    )
    if control_result.get("durum") != "başarılı":
        return responses.stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code="stored_control_unavailable",
            reason_text="Konuşma kontrol kaydı güvenli biçimde okunamadı.",
        )

    control = control_result["control"]
    if customer.get("is_blocked"):
        return responses.pause_for_customer_security(
            seller_id=seller_id,
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            control=control,
            reason_code="stored_customer_blocked",
            reason_text="Müşteri için otomatik yanıt durdurulmuş.",
        )
    if deps.is_customer_muted(customer):
        return responses.pause_for_customer_security(
            seller_id=seller_id,
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            control=control,
            reason_code="stored_customer_muted",
            reason_text="Müşteri için otomatik yanıt geçici olarak durdurulmuş.",
            muted_until=customer.get("muted_until"),
        )

    control_state = control.get("state")
    control_reason_codes = {
        deps.CONTROL_STATE_SELLER_TAKEN_OVER: "stored_seller_taken_over",
        deps.CONTROL_STATE_RETURN_REVIEW: "stored_return_review",
        deps.CONTROL_STATE_ASSISTANT_PAUSED: "stored_assistant_paused",
    }
    if control_state != deps.CONTROL_STATE_ASSISTANT_ACTIVE:
        return responses.stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code=control_reason_codes.get(control_state, "stored_control_unavailable"),
            reason_text="Konuşma otomatik yanıta açık değil.",
            control_state=control_state,
        )

    resume_after_message_id = control.get("resume_after_message_id")
    if resume_after_message_id is not None and incoming_message_id <= resume_after_message_id:
        return responses.stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code="stored_before_resume_cursor",
            reason_text="Mesaj asistana geri bırakma sınırından eski.",
        )

    control_context: OutgoingControlContext = {
        "incoming_message_id": incoming_message_id,
        "starting_control_version": control["version"],
    }

    violation = content.uygunsuz_icerik_bul(kullanici_mesaji or "")
    if violation:
        return responses.handle_violation(
            seller_id=seller_id,
            customer_id=customer_id,
            source_message_id=incoming_message_id,
            matched_term=violation["matched_term"],
            severity=violation["severity"],
            starting_control_version=control["version"],
        )

    state_result = deps.get_state(seller_id=seller_id, customer_id=customer_id)
    if state_result.get("durum") != "başarılı":
        return state_result
    state = state_result["state"]

    pending_change_response = _pending_change_response(
        seller_id=seller_id,
        customer_id=customer_id,
        source_message_id=incoming_message_id,
        state=state,
        user_message=kullanici_mesaji or "",
        message_type=message_type,
        control_context=control_context,
    )
    if pending_change_response is not None:
        return pending_change_response

    preclassified: dict[str, Any] | None = None
    current_flow_state = state.get("current_state", "NORMAL")
    if (
        current_flow_state in return_flow.ORDER_COLLECTION_MUTATION_STATES
        and isinstance(kullanici_mesaji, str)
        and kullanici_mesaji.strip()
    ):
        preclassified = deps.classify_intent(kullanici_mesaji)
        if (
            deps.intent_is_safe(preclassified)
            and preclassified.get("intent") in {"return_request", "complaint"}
        ):
            return return_flow.handle_return_review_intent(
                seller_id=seller_id,
                customer_id=customer_id,
                user_message=kullanici_mesaji,
                message_type=message_type,
                incoming_message_id=incoming_message_id,
                intent=str(preclassified["intent"]),
                control_context=control_context,
            )

    return_issue_response = return_flow.continue_active_return_issue_request(
        seller_id=seller_id,
        customer_id=customer_id,
        user_message=kullanici_mesaji or "",
        message_type=message_type,
        incoming_message_id=incoming_message_id,
        control_context=control_context,
    )
    if return_issue_response is not None:
        return return_issue_response

    if message_type == "text":
        quantity_result = deps.handle_quantity_message(
            seller_id=seller_id,
            customer_id=customer_id,
            source_message_id=incoming_message_id,
            message_text=kullanici_mesaji or "",
            product_info=product_info,
        )
        if quantity_result.get("handled") is True:
            if quantity_result.get("durum") != "başarılı":
                return responses.stored_no_auto_reply(
                    customer_id=customer_id,
                    incoming_message_id=incoming_message_id,
                    reason_code=str(quantity_result.get("error_code") or "quantity_limit_processing_failed"),
                    reason_text=str(
                        quantity_result.get("mesaj")
                        or "Sipariş adet sınırı güvenli biçimde değerlendirilemedi."
                    ),
                    fail_closed=True,
                )
            response_text = quantity_result.get("response_text")
            if not isinstance(response_text, str) or not response_text.strip():
                return responses.stored_no_auto_reply(
                    customer_id=customer_id,
                    incoming_message_id=incoming_message_id,
                    reason_code="quantity_limit_response_unavailable",
                    reason_text="Sipariş adet sınırı için güvenli yanıt oluşturulamadı.",
                    fail_closed=True,
                )
            response = responses.outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=response_text.strip(),
                source="quantity_limit",
                control_context=control_context,
                ai_confidence=1.0,
            )
            if response.get("durum") == "başarılı":
                request = quantity_result.get("request")
                response["quantity_review_required"] = quantity_result.get("review_required") is True
                response["return_issue_request_id"] = request.get("id") if isinstance(request, dict) else None
                response["notification_created"] = quantity_result.get("notification_created") is True
            return response

    state_response = order_state.process_active_state(
        seller_id=seller_id,
        customer_id=customer_id,
        state=state,
        user_message=kullanici_mesaji or "",
        message_type=message_type,
        media_url=media_url,
        source_message_id=incoming_message_id,
        store_link=store_link,
        control_context=control_context,
    )
    if state_response:
        return state_response

    classification = preclassified or deps.classify_intent(kullanici_mesaji or "")
    if not deps.intent_is_safe(classification):
        saved_answer_response = responses._saved_unanswered_answer_response(
            seller_id=seller_id,
            customer_id=customer_id,
            question_text=kullanici_mesaji or "",
            message_type=message_type,
            current_flow_state=current_flow_state,
            classification=classification,
            control_context=control_context,
        )
        if saved_answer_response is not None:
            return saved_answer_response
        return responses.escalate_question(
            seller_id=seller_id,
            customer_id=customer_id,
            question_text=kullanici_mesaji or "[medya mesajı]",
            source_message_id=incoming_message_id,
            category=classification.get("intent", "unclear"),
            reason="düşük_güven_veya_belirsiz_niyet",
            control_context=control_context,
        )

    intent = classification["intent"]
    confidence = classification.get("confidence")
    if intent in {"return_request", "complaint"}:
        return return_flow.handle_return_review_intent(
            seller_id=seller_id,
            customer_id=customer_id,
            user_message=kullanici_mesaji or "",
            message_type=message_type,
            incoming_message_id=incoming_message_id,
            intent=intent,
            control_context=control_context,
        )

    if current_flow_state == "NORMAL":
        change_response = _maybe_start_personalization_change_confirmation(
            seller_id=seller_id,
            customer_id=customer_id,
            source_message_id=incoming_message_id,
            user_message=kullanici_mesaji or "",
            classification=classification,
            control_context=control_context,
        )
        if change_response is not None:
            return change_response

    if intent == "order_intent":
        transition_result = deps.transition_state(
            seller_id=seller_id,
            customer_id=customer_id,
            to_state="AWAITING_ORDER_CONFIRMATION",
            reason_code="user_action",
            trigger_message_id=incoming_message_id,
            expires_in_hours=24,
        )
        if transition_result.get("durum") != "başarılı":
            return order_helpers._order_flow_error(
                customer_id=customer_id,
                incoming_message_id=incoming_message_id,
                reason_code="order_flow_transition_failed",
                message="Sipariş akışı güvenli biçimde başlatılamadı.",
            )
        return responses.outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text="Mağazamızdan sipariş verdiniz mi?",
            source="state",
            control_context=control_context,
            ai_confidence=confidence,
        )

    if intent in {"order_confirmation_yes", "order_confirmation_no"}:
        return responses.escalate_question(
            seller_id=seller_id,
            customer_id=customer_id,
            question_text=kullanici_mesaji,
            source_message_id=incoming_message_id,
            category=intent,
            reason="bağlam_dışı_sipariş_onayı",
            control_context=control_context,
        )

    rules_result = deps.get_active_rules(seller_id)
    rules = rules_result.get("kurallar", [])
    matched_rule = content.basit_kural_esleme(kullanici_mesaji, rules)
    if matched_rule:
        deps.increment_rule_hit_count(matched_rule["id"])
        return responses.outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text=matched_rule["response_text"],
            source="rule",
            control_context=control_context,
            ai_confidence=1.0,
        )

    product_response, suggested_field = content.product_info_response(
        intent=intent,
        product_info=product_info,
    )
    if product_response:
        return responses.outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text=product_response,
            source="product_info",
            control_context=control_context,
            ai_confidence=confidence,
        )

    template_response = content.safe_template_response(intent=intent, store_link=store_link)
    if template_response:
        return responses.outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text=template_response,
            source="template",
            control_context=control_context,
            ai_confidence=confidence,
        )

    saved_answer_response = responses._saved_unanswered_answer_response(
        seller_id=seller_id,
        customer_id=customer_id,
        question_text=kullanici_mesaji or "",
        message_type=message_type,
        current_flow_state=current_flow_state,
        classification=classification,
        control_context=control_context,
    )
    if saved_answer_response is not None:
        return saved_answer_response

    return responses.escalate_question(
        seller_id=seller_id,
        customer_id=customer_id,
        question_text=kullanici_mesaji or "[medya mesajı]",
        source_message_id=incoming_message_id,
        category=intent,
        suggested_field=suggested_field,
        reason="kayıtlı_cevap_bulunamadı",
        control_context=control_context,
    )

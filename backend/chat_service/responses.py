from __future__ import annotations

from typing import Any

from . import dependencies as deps
from .content import ESCALATION_RESPONSE, OutgoingControlContext


def stored_no_auto_reply(
    customer_id: int,
    incoming_message_id: int,
    reason_code: str,
    reason_text: str,
    **extra: Any,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "durum": "otomatik_yanıt_yok",
        "cevap": None,
        "sebep": reason_text,
        "reason_code": reason_code,
        "customer_id": customer_id,
        "incoming_message_id": incoming_message_id,
    }
    result.update(extra)
    return result


def pause_for_customer_security(
    seller_id: int,
    customer_id: int,
    incoming_message_id: int,
    control: dict[str, Any],
    reason_code: str,
    reason_text: str,
    **extra: Any,
) -> dict[str, Any]:
    if control.get("state") == deps.CONTROL_STATE_ASSISTANT_ACTIVE:
        pause_result = deps.transition_conversation_control(
            seller_id=seller_id,
            customer_id=customer_id,
            to_control_state=deps.CONTROL_STATE_ASSISTANT_PAUSED,
            reason_code="security",
            trigger_message_id=incoming_message_id,
            expected_version=control.get("version"),
        )
        if pause_result.get("durum") != "başarılı":
            return stored_no_auto_reply(
                customer_id=customer_id,
                incoming_message_id=incoming_message_id,
                reason_code="assistant_pause_transition_failed",
                reason_text=(
                    "Müşteri güvenlik durumu kaydedildi fakat konuşma "
                    "kontrolü durdurulamadı."
                ),
                security_reason_code=reason_code,
                **extra,
            )
    return stored_no_auto_reply(
        customer_id=customer_id,
        incoming_message_id=incoming_message_id,
        reason_code=reason_code,
        reason_text=reason_text,
        **extra,
    )


def validate_outgoing_control(
    seller_id: int,
    customer_id: int,
    context: OutgoingControlContext,
) -> tuple[bool, str, str]:
    control_result = deps.get_conversation_control(
        seller_id=seller_id,
        customer_id=customer_id,
    )
    if control_result.get("durum") != "başarılı":
        return False, "outgoing_suppressed_control_unavailable", "Konuşma kontrolü yeniden doğrulanamadı."

    control = control_result["control"]
    if control.get("state") != deps.CONTROL_STATE_ASSISTANT_ACTIVE:
        return False, "outgoing_suppressed_control_changed", "Konuşma kontrolü otomatik yanıta kapatıldı."
    if control.get("version") != context["starting_control_version"]:
        return False, "outgoing_suppressed_control_changed", "Konuşma kontrol sürümü işleme sırasında değişti."

    resume_after_message_id = control.get("resume_after_message_id")
    incoming_message_id = context["incoming_message_id"]
    if resume_after_message_id is not None and incoming_message_id <= resume_after_message_id:
        return False, "outgoing_suppressed_before_resume_cursor", "Mesaj asistana geri bırakma sınırından eski."
    return True, "", ""


def outgoing_response(
    seller_id: int,
    customer_id: int,
    response_text: str,
    source: str,
    control_context: OutgoingControlContext,
    ai_confidence: float | None = None,
) -> dict[str, Any]:
    # Keep the existing fail-fast read so expensive/legacy callers receive the
    # same early suppression semantics. The guarded DB write below is the final
    # authority and closes the check-then-insert race with seller takeover.
    is_allowed, reason_code, reason_text = validate_outgoing_control(
        seller_id=seller_id,
        customer_id=customer_id,
        context=control_context,
    )
    if not is_allowed:
        return stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=control_context["incoming_message_id"],
            reason_code=reason_code,
            reason_text=reason_text,
        )

    save_result = deps.save_message(
        seller_id=seller_id,
        customer_id=customer_id,
        direction="outgoing",
        content=response_text,
        was_auto_replied=True,
        ai_confidence=ai_confidence,
        provider="internal",
        provider_message_id=None,
        source_message_id=control_context["incoming_message_id"],
        expected_control_version=control_context["starting_control_version"],
    )
    if save_result.get("durum") == "bastırıldı":
        return stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=control_context["incoming_message_id"],
            reason_code=str(
                save_result.get("reason_code")
                or "outgoing_suppressed_control_unavailable"
            ),
            reason_text=str(
                save_result.get("mesaj")
                or "Konuşma kontrolü son yazma sınırında doğrulanamadı."
            ),
        )
    if save_result.get("durum") != "başarılı":
        return {"durum": "hata", "mesaj": "Cevap üretildi fakat giden mesaj kaydedilemedi."}
    return {
        "durum": "başarılı",
        "cevap": response_text,
        "kaynak": source,
        "customer_id": customer_id,
    }


def escalate_question(
    seller_id: int,
    customer_id: int,
    question_text: str,
    source_message_id: int | None,
    category: str = "unclear",
    suggested_field: str | None = None,
    reason: str = "bilgi_yok",
    control_context: OutgoingControlContext | None = None,
) -> dict[str, Any]:
    if source_message_id is None:
        return {"durum": "hata", "mesaj": "Cevaplanamayan soru için kaynak mesaj kimliği bulunamadı."}

    question_result = deps.unanswered_record_question(
        seller_id=seller_id,
        customer_id=customer_id,
        source_message_id=source_message_id,
        question_text=question_text,
        category=category,
        suggested_field=suggested_field,
        reason=reason,
    )
    if question_result.get("durum") != "başarılı":
        return stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="unanswered_question_persist_failed",
            reason_text="Cevaplanamayan soru güvenli biçimde kaydedilemedi.",
        )
    if control_context is None:
        return {"durum": "hata", "mesaj": "Otomatik yanıt kontrol bağlamı bulunamadı."}

    if question_result.get("answer_available") is True:
        answer = question_result.get("answer")
        if isinstance(answer, str) and answer.strip():
            return outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=answer.strip(),
                source="seller_answer",
                control_context=control_context,
            )
    return outgoing_response(
        seller_id=seller_id,
        customer_id=customer_id,
        response_text=ESCALATION_RESPONSE,
        source="escalation",
        control_context=control_context,
    )


def _saved_unanswered_answer_response(
    seller_id: int,
    customer_id: int,
    question_text: str,
    message_type: str,
    current_flow_state: str,
    classification: dict[str, Any],
    control_context: OutgoingControlContext,
) -> dict[str, Any] | None:
    if message_type != "text" or current_flow_state != "NORMAL":
        return None
    if classification.get("intent") in {
        "return_request",
        "complaint",
        "order_intent",
        "order_confirmation_yes",
        "order_confirmation_no",
    }:
        return None

    lookup = deps.unanswered_find_saved_answer(seller_id, question_text)
    if lookup.get("durum") != "başarılı" or lookup.get("matched") is not True:
        return None
    answer = lookup.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        return None
    return outgoing_response(
        seller_id=seller_id,
        customer_id=customer_id,
        response_text=answer.strip(),
        source="seller_answer",
        control_context=control_context,
        ai_confidence=1.0,
    )


def handle_violation(
    seller_id: int,
    customer_id: int,
    source_message_id: int | None,
    matched_term: str,
    severity: str,
    starting_control_version: int,
) -> dict[str, Any]:
    previous_result = deps.count_recent_violations(
        seller_id=seller_id,
        customer_id=customer_id,
        days=30,
    )
    if previous_result.get("durum") != "başarılı":
        return {"durum": "hata", "mesaj": "İhlal geçmişi kontrol edilemedi."}

    new_count = int(previous_result.get("count") or 0) + 1
    action_taken = "seller_notified"
    if severity == "critical":
        action_taken = "blocked"
    elif new_count == 2:
        action_taken = "muted_24h"
    elif new_count >= 3:
        action_taken = "blocked"

    record_result = deps.record_violation(
        seller_id=seller_id,
        customer_id=customer_id,
        severity=severity,
        matched_term=matched_term,
        message_id=source_message_id,
        action_taken=action_taken,
        metadata={"violation_number_in_30_days": new_count},
    )
    if record_result.get("durum") != "başarılı":
        return {"durum": "hata", "mesaj": "İhlal kaydı oluşturulamadı."}

    violation_id = record_result["violation"]["id"]
    if action_taken == "blocked":
        deps.block_customer(
            customer_id=customer_id,
            reason="Tekrarlanan veya ağır uygunsuz mesaj",
        )
        notification_message = f"Müşteri bloklandı. Tespit edilen ifade: {matched_term}"
        notification_severity = "urgent"
    elif action_taken == "muted_24h":
        deps.mute_customer(customer_id=customer_id, hours=24)
        notification_message = (
            "Müşteri ikinci ihlal nedeniyle 24 saat susturuldu. "
            f"Tespit edilen ifade: {matched_term}"
        )
        notification_severity = "warning"
    else:
        notification_message = (
            f"Müşteri uygunsuz mesaj gönderdi. Tespit edilen ifade: {matched_term}"
        )
        notification_severity = "warning"

    deps.create_seller_notification(
        seller_id=seller_id,
        customer_id=customer_id,
        notification_type="violation",
        severity=notification_severity,
        title="Uygunsuz müşteri mesajı",
        message=notification_message,
        related_entity_type="customer_violation",
        related_entity_id=violation_id,
        action_url=f"/panel/customers/{customer_id}",
    )

    if action_taken in {"muted_24h", "blocked"}:
        reason_code = "security" if severity == "critical" else "violation"
        pause_result = deps.transition_conversation_control(
            seller_id=seller_id,
            customer_id=customer_id,
            to_control_state=deps.CONTROL_STATE_ASSISTANT_PAUSED,
            reason_code=reason_code,
            trigger_message_id=source_message_id,
            expected_version=starting_control_version,
        )
        if pause_result.get("durum") != "başarılı":
            return {
                "durum": "hata",
                "cevap": None,
                "reason_code": "assistant_pause_transition_failed",
                "mesaj": "İhlal kaydedildi fakat otomasyon durdurulamadı.",
                "customer_id": customer_id,
                "incoming_message_id": source_message_id,
                "aksiyon": action_taken,
            }

    return {
        "durum": "engellendi",
        "cevap": None,
        "sebep": "Uygunsuz içerik tespit edildi",
        "customer_id": customer_id,
        "aksiyon": action_taken,
        "ihlal_sayisi": new_count,
    }

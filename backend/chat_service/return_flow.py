from __future__ import annotations

from typing import Any

from . import dependencies as deps
from . import responses
from .content import OutgoingControlContext


ORDER_COLLECTION_MUTATION_STATES = {
    "AWAITING_ORDER_PRODUCT",
    "AWAITING_ORDER_NUMBER",
    "AWAITING_IMAGE",
    "AWAITING_CUSTOM_TEXT",
    "AWAITING_ORDER_FIELD",
}


def _return_issue_chat_response(
    *,
    seller_id: int,
    customer_id: int,
    incoming_message_id: int,
    service_result: dict[str, Any],
    control_context: OutgoingControlContext,
) -> dict[str, Any]:
    request = service_result.get("request")
    request_id = request.get("id") if isinstance(request, dict) else None
    common_extra: dict[str, Any] = {
        "return_issue_request_id": request_id,
        "review_required": service_result.get("review_required") is True,
        "notification_created": service_result.get("notification_created") is True,
    }

    if service_result.get("durum") != "başarılı":
        return responses.stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code=str(
                service_result.get("error_code")
                or service_result.get("code")
                or service_result.get("reason_code")
                or "return_issue_processing_failed"
            ),
            reason_text=str(
                service_result.get("mesaj")
                or "İade/sorun talebi güvenli biçimde işlenemedi; normal otomasyon durduruldu."
            ),
            fail_closed=True,
            **common_extra,
        )

    if service_result.get("outgoing_allowed") is False:
        return responses.stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code=(
                "stored_return_issue_review"
                if service_result.get("review_required") is True
                else "stored_return_issue_silent"
            ),
            reason_text=(
                "Talep satıcı incelemesine bırakıldı."
                if service_result.get("review_required") is True
                else "İade/sorun talebi kaydedildi; otomatik yanıt gönderilmedi."
            ),
            control_changed=service_result.get("control_changed") is True,
            **common_extra,
        )

    question = service_result.get("question")
    if not isinstance(question, str) or not question.strip():
        return responses.stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code="return_issue_question_unavailable",
            reason_text=(
                "İade/sorun talebi kaydedildi fakat güvenli takip sorusu oluşturulamadı."
            ),
            fail_closed=True,
            **common_extra,
        )

    return responses.outgoing_response(
        seller_id=seller_id,
        customer_id=customer_id,
        response_text=question.strip(),
        source="return_issue",
        control_context=control_context,
    )


def handle_return_review_intent(
    *,
    seller_id: int,
    customer_id: int,
    user_message: str,
    message_type: str,
    incoming_message_id: int,
    intent: str,
    control_context: OutgoingControlContext,
) -> dict[str, Any]:
    service_result = deps.return_issue_process_message(
        seller_id=seller_id,
        customer_id=customer_id,
        source_message_id=incoming_message_id,
        message_text=user_message,
        message_type=message_type,
        intent=intent,
        starting_control_version=control_context["starting_control_version"],
    )
    return _return_issue_chat_response(
        seller_id=seller_id,
        customer_id=customer_id,
        incoming_message_id=incoming_message_id,
        service_result=service_result,
        control_context=control_context,
    )


def continue_active_return_issue_request(
    *,
    seller_id: int,
    customer_id: int,
    user_message: str,
    message_type: str,
    incoming_message_id: int,
    control_context: OutgoingControlContext,
) -> dict[str, Any] | None:
    active_result = deps.get_active_collectable_return_issue_request(
        seller_id=seller_id,
        customer_id=customer_id,
    )
    if active_result.get("durum") != "başarılı":
        return responses.stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code="return_issue_active_lookup_unavailable",
            reason_text=(
                "Açık iade/sorun talebi güvenli biçimde kontrol edilemedi; normal otomasyon durduruldu."
            ),
            fail_closed=True,
        )
    if active_result.get("request") is None:
        return None

    service_result = deps.return_issue_process_message(
        seller_id=seller_id,
        customer_id=customer_id,
        source_message_id=incoming_message_id,
        message_text=user_message,
        message_type=message_type,
        intent="continue",
        starting_control_version=control_context["starting_control_version"],
    )
    return _return_issue_chat_response(
        seller_id=seller_id,
        customer_id=customer_id,
        incoming_message_id=incoming_message_id,
        service_result=service_result,
        control_context=control_context,
    )

from __future__ import annotations

from typing import Any

from database import (
    CONTROL_STATE_RETURN_REVIEW,
    add_return_issue_request_evidence,
    create_or_get_return_issue_request,
    mark_return_issue_review_required,
    transition_conversation_control,
    update_return_issue_request_from_message,
)
from return_issue_repository import get_active_collectable_return_issue_request
import return_issue_service as base


def _request_version(request: Any) -> int | None:
    if not isinstance(request, dict):
        return None
    version = request.get("version")
    if isinstance(version, int) and not isinstance(version, bool) and version > 0:
        return version
    return None


def _version_unavailable(request: dict[str, Any] | None = None) -> dict[str, Any]:
    return base._error(
        "return_issue_version_unavailable",
        "İade/sorun talebinin eşzamanlılık sürümü doğrulanamadı.",
        kind="conflict",
        fail_closed=True,
        request=request,
    )


def _conflict_result(result: dict[str, Any]) -> dict[str, Any]:
    mapped = base._map_database_error(
        result,
        default_code="return_issue_mutation_failed",
        default_message="İade/sorun talebi güvenli biçimde güncellenemedi.",
    )
    return {**mapped, "fail_closed": True, "outgoing_allowed": False}


def _finalize_review(
    *,
    seller_id: int,
    customer_id: int,
    request_id: int,
    source_message_id: int,
    starting_control_version: int,
    expected_request_version: int,
    force_review: bool,
    review_reason_code: str | None = None,
    review_note: str | None = None,
) -> dict[str, Any]:
    if not base._is_positive_int(expected_request_version):
        return _version_unavailable()

    review_result = mark_return_issue_review_required(
        seller_id,
        customer_id,
        request_id,
        force_review=force_review,
        review_reason_code=review_reason_code,
        review_note=review_note,
        expected_version=expected_request_version,
    )

    if review_result.get("durum") != "başarılı":
        if review_result.get("durum") == "çakışma":
            return _conflict_result(review_result)
        request = review_result.get("request")
        return base._error(
            "return_issue_review_persist_failed",
            "Talep satıcı incelemesine güvenli biçimde alınamadı.",
            kind="unavailable",
            fail_closed=True,
            request=request,
        )

    request = review_result["request"]

    control_result = transition_conversation_control(
        seller_id=seller_id,
        customer_id=customer_id,
        to_control_state=CONTROL_STATE_RETURN_REVIEW,
        reason_code="return_issue_review",
        reason_note=review_note,
        trigger_message_id=source_message_id,
        expected_version=starting_control_version,
    )

    if control_result.get("durum") != "başarılı":
        return base._error(
            "return_issue_review_transition_failed",
            (
                "Talep kalıcı olarak satıcı incelemesine alındı fakat konuşma "
                "kontrolü güncellenemedi. Normal otomasyon kapalı tutulmalıdır."
            ),
            kind=(
                "conflict"
                if control_result.get("durum") == "çakışma"
                else "unavailable"
            ),
            fail_closed=True,
            request=request,
        ) | {
            "notification_created": review_result.get("notification_created") is True,
        }

    return {
        "durum": "başarılı",
        "state": "seller_review_required",
        "request": request,
        "review_required": True,
        "outgoing_allowed": False,
        "notification_created": review_result.get("notification_created") is True,
        "control": control_result.get("control"),
        "control_changed": control_result.get("changed") is True,
    }


def _collect_into_request(
    *,
    seller_id: int,
    customer_id: int,
    request: dict[str, Any],
    source_message_id: int,
    message_text: str,
    message_type: str,
    starting_control_version: int,
    urgent: bool,
    consume_as_answer: bool = True,
) -> dict[str, Any]:
    request_id = request.get("id")
    if not base._is_positive_int(request_id):
        return base._error(
            "return_issue_request_invalid",
            "İade/sorun talebi kimliği geçersiz.",
            fail_closed=True,
        )

    if request.get("issue_type") == base.QUANTITY_LIMIT_ISSUE_TYPE:
        return base._error(
            "return_issue_collection_type_invalid",
            "Adet sınırı talebi bilgi toplama akışına alınamaz.",
            kind="conflict",
            fail_closed=True,
            request=request,
        )

    if request.get("status") == base.RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED:
        version = _request_version(request)
        if version is None:
            return _version_unavailable(request)
        return _finalize_review(
            seller_id=seller_id,
            customer_id=customer_id,
            request_id=request_id,
            source_message_id=source_message_id,
            starting_control_version=starting_control_version,
            expected_request_version=version,
            force_review=False,
        )

    if request.get("status") != base.RETURN_ISSUE_STATUS_COLLECTING:
        return base._error(
            "return_issue_request_not_collecting",
            "İade/sorun talebi bilgi toplama durumunda değil.",
            kind="conflict",
            fail_closed=True,
            request=request,
        )

    state = base.get_request_collection_state(seller_id, request_id)
    if state.get("durum") != "başarılı":
        return {**state, "fail_closed": True, "outgoing_allowed": False}

    current_request = state.get("request")
    current_version = _request_version(current_request)
    if current_version is None:
        return _version_unavailable(
            current_request if isinstance(current_request, dict) else request
        )

    if message_type == "image":
        evidence_result = add_return_issue_request_evidence(
            seller_id,
            customer_id,
            request_id,
            source_message_id,
            expected_version=current_version,
        )
        if evidence_result.get("durum") == "çakışma":
            return _conflict_result(evidence_result)
        if evidence_result.get("durum") != "başarılı":
            return base._error(
                "return_issue_evidence_persist_failed",
                "Gönderilen görsel güvenli biçimde kaydedilemedi.",
                fail_closed=True,
                request=state.get("request"),
            )
        evidence_request = evidence_result.get("request")
        evidence_version = _request_version(evidence_request)
        if evidence_version is None:
            return _version_unavailable(
                evidence_request if isinstance(evidence_request, dict) else None
            )
        current_request = evidence_request
        current_version = evidence_version

    awaiting = state.get("awaiting")
    normalized_text = (message_text or "").strip()

    if not consume_as_answer:
        if urgent:
            return _finalize_review(
                seller_id=seller_id,
                customer_id=customer_id,
                request_id=request_id,
                source_message_id=source_message_id,
                starting_control_version=starting_control_version,
                expected_request_version=current_version,
                force_review=True,
                review_reason_code="urgent_customer_issue",
                review_note=(
                    "Yüksek riskli müşteri sorunu otomatik bilgi toplama "
                    "yapılmadan satıcıya bırakıldı."
                ),
            )

        refreshed = base.get_request_collection_state(seller_id, request_id)
        if refreshed.get("durum") != "başarılı":
            return {**refreshed, "fail_closed": True, "outgoing_allowed": False}

        refreshed_request = refreshed.get("request")
        refreshed_version = _request_version(refreshed_request)
        if refreshed_version is None:
            return _version_unavailable(
                refreshed_request if isinstance(refreshed_request, dict) else None
            )

        if refreshed["ready_for_review"]:
            return _finalize_review(
                seller_id=seller_id,
                customer_id=customer_id,
                request_id=request_id,
                source_message_id=source_message_id,
                starting_control_version=starting_control_version,
                expected_request_version=refreshed_version,
                force_review=False,
            )

        return {
            "durum": "başarılı",
            "state": "collecting",
            "request": refreshed["request"],
            "awaiting": refreshed["awaiting"],
            "missing_fields": refreshed["missing_fields"],
            "question": refreshed["question"],
            "review_required": False,
            "outgoing_allowed": True,
        }

    if urgent:
        return _finalize_review(
            seller_id=seller_id,
            customer_id=customer_id,
            request_id=request_id,
            source_message_id=source_message_id,
            starting_control_version=starting_control_version,
            expected_request_version=current_version,
            force_review=True,
            review_reason_code="urgent_customer_issue",
            review_note=(
                "Yüksek riskli müşteri sorunu otomatik bilgi toplama "
                "yapılmadan satıcıya bırakıldı."
            ),
        )

    if awaiting == "order_number" and message_type != "image":
        if not normalized_text or len(normalized_text) > 100:
            return {
                "durum": "başarılı",
                "state": "collecting",
                "request": state["request"],
                "awaiting": "order_number",
                "question": base.build_collection_question("order_number"),
                "validation_error": "Sipariş numarası geçerli değil.",
                "review_required": False,
                "outgoing_allowed": True,
            }

        order_number = base.parse_order_number_answer(normalized_text)
        if order_number is None:
            return {
                "durum": "başarılı",
                "state": "collecting",
                "request": state["request"],
                "awaiting": "order_number",
                "question": base.build_collection_question("order_number"),
                "validation_error": "Sipariş numarası geçerli değil.",
                "review_required": False,
                "outgoing_allowed": True,
            }

        order_lookup = base._resolve_order_candidate(
            seller_id,
            customer_id,
            external_order_number=order_number,
        )
        if order_lookup.get("durum") != "başarılı":
            return {**order_lookup, "fail_closed": True, "outgoing_allowed": False}

        linked_order = order_lookup.get("order")
        update_result = update_return_issue_request_from_message(
            seller_id,
            customer_id,
            request_id,
            source_message_id,
            external_order_number=order_number,
            order_id=(linked_order or {}).get("id"),
            expected_version=current_version,
        )
        if update_result.get("durum") != "başarılı":
            return _conflict_result(update_result) if update_result.get("durum") == "çakışma" else (
                base._map_database_error(
                    update_result,
                    default_code="return_issue_order_persist_failed",
                    default_message="Sipariş bilgisi kaydedilemedi.",
                ) | {"fail_closed": True, "outgoing_allowed": False}
            )

        updated_request = update_result.get("request")
        updated_version = _request_version(updated_request)
        if updated_version is None:
            return _version_unavailable(
                updated_request if isinstance(updated_request, dict) else None
            )
        current_request = updated_request
        current_version = updated_version

    elif awaiting == "reason" and message_type != "image":
        if not normalized_text or len(normalized_text) > 2000:
            return {
                "durum": "başarılı",
                "state": "collecting",
                "request": state["request"],
                "awaiting": "reason",
                "question": base.build_collection_question("reason"),
                "validation_error": "Sorun açıklaması geçerli değil.",
                "review_required": False,
                "outgoing_allowed": True,
            }

        update_result = update_return_issue_request_from_message(
            seller_id,
            customer_id,
            request_id,
            source_message_id,
            reason_text=normalized_text,
            expected_version=current_version,
        )
        if update_result.get("durum") != "başarılı":
            return _conflict_result(update_result) if update_result.get("durum") == "çakışma" else (
                base._map_database_error(
                    update_result,
                    default_code="return_issue_reason_persist_failed",
                    default_message="Sorun açıklaması kaydedilemedi.",
                ) | {"fail_closed": True, "outgoing_allowed": False}
            )

        updated_request = update_result.get("request")
        updated_version = _request_version(updated_request)
        if updated_version is None:
            return _version_unavailable(
                updated_request if isinstance(updated_request, dict) else None
            )
        current_request = updated_request
        current_version = updated_version

    elif awaiting == "image" and message_type != "image":
        return {
            "durum": "başarılı",
            "state": "collecting",
            "request": state["request"],
            "awaiting": "image",
            "question": base.build_collection_question("image"),
            "validation_error": "Bu adım için görsel gereklidir.",
            "review_required": False,
            "outgoing_allowed": True,
        }

    refreshed = base.get_request_collection_state(seller_id, request_id)
    if refreshed.get("durum") != "başarılı":
        return {**refreshed, "fail_closed": True, "outgoing_allowed": False}

    refreshed_request = refreshed.get("request")
    refreshed_version = _request_version(refreshed_request)
    if refreshed_version is None:
        return _version_unavailable(
            refreshed_request if isinstance(refreshed_request, dict) else None
        )

    if refreshed["ready_for_review"]:
        return _finalize_review(
            seller_id=seller_id,
            customer_id=customer_id,
            request_id=request_id,
            source_message_id=source_message_id,
            starting_control_version=starting_control_version,
            expected_request_version=refreshed_version,
            force_review=False,
        )

    return {
        "durum": "başarılı",
        "state": "collecting",
        "request": refreshed["request"],
        "awaiting": refreshed["awaiting"],
        "missing_fields": refreshed["missing_fields"],
        "question": refreshed["question"],
        "review_required": False,
        "outgoing_allowed": True,
    }


def process_customer_issue_message(
    *,
    seller_id: int,
    customer_id: int,
    source_message_id: int,
    message_text: str,
    message_type: str,
    intent: str,
    starting_control_version: int,
) -> dict[str, Any]:
    """Chat-only return flow with request-version OCC on every mutation."""
    if (
        not base._is_positive_int(seller_id)
        or not base._is_positive_int(customer_id)
        or not base._is_positive_int(source_message_id)
        or not base._is_positive_int(starting_control_version)
    ):
        return base._error(
            "return_issue_validation_error",
            "İade/sorun işlem kimlikleri geçersiz.",
            kind="validation",
            fail_closed=True,
        )

    if intent not in {"return_request", "complaint", "continue"}:
        return base._error(
            "return_issue_validation_error",
            "İade/sorun intent değeri geçersiz.",
            kind="validation",
            fail_closed=True,
        )

    if message_type not in {"text", "image"}:
        return base._error(
            "return_issue_unsupported_message_type",
            "Bu mesaj türü otomatik iade/sorun toplama için desteklenmiyor.",
            kind="validation",
            fail_closed=True,
        )

    active_result = get_active_collectable_return_issue_request(seller_id, customer_id)
    if active_result.get("durum") != "başarılı":
        return base._map_database_error(
            active_result,
            default_code="return_issue_active_lookup_unavailable",
            default_message="Açık iade/sorun talebi kontrol edilemedi.",
        ) | {"fail_closed": True, "outgoing_allowed": False}

    active_request = active_result.get("request")
    urgent = base.is_urgent_issue_message(message_text)

    if active_request is not None:
        return _collect_into_request(
            seller_id=seller_id,
            customer_id=customer_id,
            request=active_request,
            source_message_id=source_message_id,
            message_text=message_text,
            message_type=message_type,
            starting_control_version=starting_control_version,
            urgent=urgent,
        )

    if intent == "continue":
        return base._error(
            "return_issue_not_found",
            "Devam ettirilecek açık iade/sorun talebi bulunamadı.",
            kind="not_found",
            fail_closed=True,
        )

    issue_type = base.classify_issue_type(intent, message_text)
    explicit_order_number = base.extract_explicit_order_number(message_text)
    reason = base.initial_reason_candidate(issue_type, message_text)

    order_lookup = base._resolve_order_candidate(
        seller_id,
        customer_id,
        external_order_number=explicit_order_number,
    )
    if order_lookup.get("durum") != "başarılı":
        return {**order_lookup, "fail_closed": True, "outgoing_allowed": False}

    linked_order = order_lookup.get("order")

    create_result = create_or_get_return_issue_request(
        seller_id,
        customer_id,
        source_message_id,
        issue_type,
        initial_reason_text=reason,
        order_id=(linked_order or {}).get("id"),
        external_order_number=explicit_order_number,
    )
    if create_result.get("durum") != "başarılı":
        return base._map_database_error(
            create_result,
            default_code="return_issue_create_failed",
            default_message="İade/sorun talebi kaydedilemedi.",
        ) | {"fail_closed": True, "outgoing_allowed": False}

    request = create_result["request"]

    return _collect_into_request(
        seller_id=seller_id,
        customer_id=customer_id,
        request=request,
        source_message_id=source_message_id,
        message_text=message_text,
        message_type=message_type,
        starting_control_version=starting_control_version,
        urgent=urgent,
        consume_as_answer=False,
    )

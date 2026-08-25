from __future__ import annotations

import re
from typing import Any

from .common import extract_rpc_payload as _extract_rpc_payload
from .common import is_positive_int as _is_positive_int


def get_supabase():
    import database
    return database.get_supabase()


RETURN_ISSUE_TYPES = {
    "RETURN_REQUEST",
    "DAMAGED_ITEM",
    "WRONG_ITEM",
    "PRINT_OR_PERSONALIZATION_ISSUE",
    "DELIVERY_ISSUE",
    "OTHER_ORDER_ISSUE",
}

RETURN_ISSUE_STATUS_COLLECTING = "COLLECTING"
RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED = "SELLER_REVIEW_REQUIRED"
RETURN_ISSUE_STATUS_HANDLED = "HANDLED"

VALID_RETURN_ISSUE_STATUSES = {
    RETURN_ISSUE_STATUS_COLLECTING,
    RETURN_ISSUE_STATUS_SELLER_REVIEW_REQUIRED,
    RETURN_ISSUE_STATUS_HANDLED,
}

RETURN_IMAGE_REQUIREMENTS = {"REQUIRED", "OPTIONAL", "NOT_REQUESTED"}


def _return_issue_rpc_response(data: Any) -> dict[str, Any]:
    payload = _extract_rpc_payload(data)
    if payload is None:
        return {"durum": "hata", "mesaj": "İade/sorun işlemi geçersiz yanıt döndürdü."}
    status = payload.get("status")
    if status == "not_found":
        return {"durum": "bulunamadı", "mesaj": "İade/sorun talebi bulunamadı."}
    if status == "forbidden":
        return {"durum": "reddedildi", "mesaj": "İade/sorun işlemi bu tenant için geçersiz."}
    if status == "conflict":
        response: dict[str, Any] = {
            "durum": "çakışma",
            "mesaj": payload.get("message") or "İade/sorun talebi değişti.",
        }
        if payload.get("request") is not None:
            response["request"] = payload["request"]
        if payload.get("setting") is not None:
            response["setting"] = payload["setting"]
        if payload.get("current_version") is not None:
            response["current_version"] = payload["current_version"]
        return response
    if status == "not_ready":
        response = {
            "durum": "hazır_değil",
            "mesaj": payload.get("message") or "Talep satıcı incelemesine hazır değil.",
        }
        if payload.get("request") is not None:
            response["request"] = payload["request"]
        return response
    if status == "error":
        return {"durum": "hata", "mesaj": payload.get("message") or "İade/sorun işlemi tamamlanamadı."}
    if status != "success":
        return {"durum": "hata", "mesaj": "İade/sorun işlemi geçersiz yanıt döndürdü."}

    response: dict[str, Any] = {"durum": "başarılı"}
    for key in ("request", "evidence", "setting"):
        if payload.get(key) is not None:
            response[key] = payload[key]
    for key in ("changed", "created", "idempotent", "race_resolved", "notification_created"):
        if payload.get(key) is not None:
            response[key] = payload[key] is True
    if payload.get("current_version") is not None:
        response["current_version"] = payload["current_version"]
    return response


def create_or_get_return_issue_request(
    seller_id: int,
    customer_id: int,
    source_message_id: int,
    issue_type: str,
    *,
    initial_reason_text: str | None = None,
    order_id: int | None = None,
    external_order_number: str | None = None,
) -> dict[str, Any]:
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
        or not _is_positive_int(source_message_id)
    ):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id, customer_id ve source_message_id pozitif tam sayı olmalıdır."}
    if issue_type not in RETURN_ISSUE_TYPES:
        return {"durum": "doğrulama_hatası", "mesaj": f"Geçersiz iade/sorun tipi: {issue_type}"}
    if order_id is not None and not _is_positive_int(order_id):
        return {"durum": "doğrulama_hatası", "mesaj": "order_id pozitif tam sayı olmalıdır."}
    if initial_reason_text is not None:
        normalized_reason = initial_reason_text.strip()
        if not normalized_reason or len(normalized_reason) > 2000:
            return {"durum": "doğrulama_hatası", "mesaj": "initial_reason_text 1 ile 2000 karakter arasında olmalıdır."}
        initial_reason_text = normalized_reason
    if external_order_number is not None:
        normalized_number = external_order_number.strip()
        if not normalized_number or len(normalized_number) > 100:
            return {"durum": "doğrulama_hatası", "mesaj": "external_order_number 1 ile 100 karakter arasında olmalıdır."}
        external_order_number = normalized_number
    try:
        result = get_supabase().rpc(
            "create_or_get_return_issue_request",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "source_message_id": source_message_id,
                "target_issue_type": issue_type,
                "initial_reason_text": initial_reason_text,
                "target_order_id": order_id,
                "external_order_number_text": external_order_number,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "İade/sorun talebi oluşturulamadı."}
    return _return_issue_rpc_response(result.data)


def update_return_issue_request_from_message(
    seller_id: int,
    customer_id: int,
    request_id: int,
    source_message_id: int,
    *,
    external_order_number: str | None = None,
    reason_text: str | None = None,
    order_id: int | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
        or not _is_positive_int(request_id)
        or not _is_positive_int(source_message_id)
    ):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id, customer_id, request_id ve source_message_id pozitif tam sayı olmalıdır."}
    if order_id is not None and not _is_positive_int(order_id):
        return {"durum": "doğrulama_hatası", "mesaj": "order_id pozitif tam sayı olmalıdır."}
    if expected_version is not None and not _is_positive_int(expected_version):
        return {"durum": "doğrulama_hatası", "mesaj": "expected_version pozitif tam sayı olmalıdır."}
    if external_order_number is not None:
        external_order_number = external_order_number.strip()
        if not external_order_number or len(external_order_number) > 100:
            return {"durum": "doğrulama_hatası", "mesaj": "external_order_number 1 ile 100 karakter arasında olmalıdır."}
    if reason_text is not None:
        reason_text = reason_text.strip()
        if not reason_text or len(reason_text) > 2000:
            return {"durum": "doğrulama_hatası", "mesaj": "reason_text 1 ile 2000 karakter arasında olmalıdır."}
    if external_order_number is None and reason_text is None and order_id is None:
        return {"durum": "doğrulama_hatası", "mesaj": "Güncellenecek talep bilgisi yok."}
    try:
        result = get_supabase().rpc(
            "update_return_issue_request_from_message",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_request_id": request_id,
                "source_message_id": source_message_id,
                "new_external_order_number": external_order_number,
                "new_reason_text": reason_text,
                "target_order_id": order_id,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "İade/sorun talebi güncellenemedi."}
    return _return_issue_rpc_response(result.data)


def add_return_issue_request_evidence(
    seller_id: int,
    customer_id: int,
    request_id: int,
    source_message_id: int,
    *,
    expected_version: int | None = None,
) -> dict[str, Any]:
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(customer_id)
        or not _is_positive_int(request_id)
        or not _is_positive_int(source_message_id)
    ):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id, customer_id, request_id ve source_message_id pozitif tam sayı olmalıdır."}
    if expected_version is not None and not _is_positive_int(expected_version):
        return {"durum": "doğrulama_hatası", "mesaj": "expected_version pozitif tam sayı olmalıdır."}
    try:
        result = get_supabase().rpc(
            "add_return_issue_request_evidence",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_request_id": request_id,
                "source_message_id": source_message_id,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "İade/sorun evidence kaydedilemedi."}
    return _return_issue_rpc_response(result.data)


def mark_return_issue_review_required(
    seller_id: int,
    customer_id: int,
    request_id: int,
    *,
    force_review: bool = False,
    review_reason_code: str | None = None,
    review_note: str | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    if not _is_positive_int(seller_id) or not _is_positive_int(customer_id) or not _is_positive_int(request_id):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id, customer_id ve request_id pozitif tam sayı olmalıdır."}
    if not isinstance(force_review, bool):
        return {"durum": "doğrulama_hatası", "mesaj": "force_review boolean olmalıdır."}
    if expected_version is not None and not _is_positive_int(expected_version):
        return {"durum": "doğrulama_hatası", "mesaj": "expected_version pozitif tam sayı olmalıdır."}
    if review_reason_code is not None:
        review_reason_code = review_reason_code.strip()
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", review_reason_code):
            return {"durum": "doğrulama_hatası", "mesaj": "review_reason_code geçersiz."}
    if force_review and review_reason_code is None:
        return {"durum": "doğrulama_hatası", "mesaj": "force_review için review_reason_code gereklidir."}
    if review_note is not None:
        review_note = review_note.strip()
        if not review_note or len(review_note) > 500:
            return {"durum": "doğrulama_hatası", "mesaj": "review_note 1 ile 500 karakter arasında olmalıdır."}
    try:
        result = get_supabase().rpc(
            "mark_return_issue_review_required",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "target_request_id": request_id,
                "force_review": force_review,
                "review_code": review_reason_code,
                "review_note_text": review_note,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "İade/sorun talebi seller review durumuna alınamadı."}
    return _return_issue_rpc_response(result.data)


def mark_return_issue_handled(
    seller_id: int,
    request_id: int,
    actor_profile_id: int,
    expected_version: int,
    *,
    seller_note: str | None = None,
) -> dict[str, Any]:
    if (
        not _is_positive_int(seller_id)
        or not _is_positive_int(request_id)
        or not _is_positive_int(actor_profile_id)
        or not _is_positive_int(expected_version)
    ):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id, request_id, actor_profile_id ve expected_version pozitif tam sayı olmalıdır."}
    if seller_note is not None:
        seller_note = seller_note.strip()
        if not seller_note or len(seller_note) > 2000:
            return {"durum": "doğrulama_hatası", "mesaj": "seller_note 1 ile 2000 karakter arasında olmalıdır."}
    try:
        result = get_supabase().rpc(
            "mark_return_issue_handled",
            {
                "target_seller_id": seller_id,
                "target_request_id": request_id,
                "actor_profile_id": actor_profile_id,
                "expected_version": expected_version,
                "seller_note_text": seller_note,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "İade/sorun talebi handled olarak işaretlenemedi."}
    return _return_issue_rpc_response(result.data)


def update_return_issue_type_setting(
    seller_id: int,
    issue_type: str,
    image_requirement: str,
    expected_version: int,
) -> dict[str, Any]:
    if not _is_positive_int(seller_id) or not _is_positive_int(expected_version):
        return {"durum": "doğrulama_hatası", "mesaj": "seller_id ve expected_version pozitif tam sayı olmalıdır."}
    if issue_type not in RETURN_ISSUE_TYPES:
        return {"durum": "doğrulama_hatası", "mesaj": f"Geçersiz iade/sorun tipi: {issue_type}"}
    if image_requirement not in RETURN_IMAGE_REQUIREMENTS:
        return {"durum": "doğrulama_hatası", "mesaj": f"Geçersiz image requirement: {image_requirement}"}
    try:
        result = get_supabase().rpc(
            "update_return_issue_type_setting",
            {
                "target_seller_id": seller_id,
                "target_issue_type": issue_type,
                "new_image_requirement": image_requirement,
                "expected_version": expected_version,
            },
        ).execute()
    except Exception:
        return {"durum": "hata", "mesaj": "İade/sorun ayarı güncellenemedi."}
    return _return_issue_rpc_response(result.data)

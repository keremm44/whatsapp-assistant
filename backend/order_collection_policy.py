from __future__ import annotations

from typing import Any

from database import (
    ORDER_STATUS_COLLECTING,
    ORDER_STATUS_COMPLETE,
    ORDER_STATUS_SELLER_REVIEW_REQUIRED,
    get_order_detail,
    get_seller_product_info,
)
from order_service import build_collection_question


def _domain_error(code: str, message: str) -> dict[str, Any]:
    return {"durum": "hata", "error_code": code, "mesaj": message}


def _read_requirement_flag(
    order_config: dict[str, Any],
    key: str,
    *,
    default_when_missing: bool,
) -> tuple[bool, bool, str | None]:
    """Read one seller requirement flag with strict legacy-compatible semantics."""
    raw_value = order_config.get(key)
    if raw_value is None:
        return True, default_when_missing, None
    if isinstance(raw_value, bool):
        return True, raw_value, None
    if isinstance(raw_value, str):
        normalized = raw_value.strip().lower()
        if normalized == "true":
            return True, True, None
        if normalized == "false":
            return True, False, None
    return False, False, f"{key} ayarı geçersiz."


def read_order_collection_requirements(
    seller_id: int,
) -> tuple[bool, bool, bool, bool, str | None]:
    """Return canonical post-order collection requirements.

    Returns `(ok, order_number_required, image_required,
    custom_text_required, error)`.

    Missing flags preserve the historical production behavior:
    order number and the core image remain required, custom text does not.
    Invalid values fail closed instead of silently changing collection rules.
    """
    result = get_seller_product_info(seller_id)
    if result.get("durum") != "başarılı":
        return False, True, True, False, "Sipariş toplama ayarları okunamadı."

    product_info = result.get("product_info")
    if not isinstance(product_info, dict):
        return False, True, True, False, "Sipariş toplama ayarları geçersiz."

    order_config = product_info.get("order") or {}
    if not isinstance(order_config, dict):
        return False, True, True, False, "Sipariş toplama ayarları geçersiz."

    order_number_ok, order_number_required, error = _read_requirement_flag(
        order_config,
        "order_number_required",
        default_when_missing=True,
    )
    if not order_number_ok:
        return False, True, True, False, error

    image_ok, image_required, error = _read_requirement_flag(
        order_config,
        "image_required",
        default_when_missing=True,
    )
    if not image_ok:
        return False, order_number_required, True, False, error

    text_ok, custom_text_required, error = _read_requirement_flag(
        order_config,
        "custom_text_required",
        default_when_missing=False,
    )
    if not text_ok:
        return False, order_number_required, image_required, False, error

    return True, order_number_required, image_required, custom_text_required, None


def _collection_field_payload(field: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": field.get("id"),
        "field_key": field.get("field_key"),
        "label": field.get("label"),
        "field_type": field.get("field_type"),
        "options": field.get("options") if isinstance(field.get("options"), list) else [],
        "validation_config": (
            field.get("validation_config")
            if isinstance(field.get("validation_config"), dict)
            else {}
        ),
    }


def get_next_collection_step(seller_id: int, order_id: int) -> dict[str, Any]:
    """Choose the next deterministic post-order collection step.

    Seller configuration is authoritative. The customer or LLM cannot invent a
    requirement. Product-specific required snapshot fields follow the three
    seller-wide core requirements and may themselves be image fields (for
    example front/back print assets).
    """
    detail = get_order_detail(seller_id, order_id)
    if detail.get("durum") == "bulunamadı":
        return {"durum": "bulunamadı", "mesaj": "Sipariş bulunamadı."}
    if detail.get("durum") != "başarılı":
        return _domain_error(
            "order_unavailable",
            detail.get("mesaj") or "Sipariş detayı okunamadı.",
        )

    order = detail.get("order")
    fields = detail.get("fields")
    if not isinstance(order, dict) or not isinstance(fields, list):
        return _domain_error("order_unavailable", "Sipariş detayı geçersiz yanıt döndürdü.")

    status = order.get("status")
    if status == ORDER_STATUS_COMPLETE:
        return {
            "durum": "başarılı",
            "complete": True,
            "blocked": False,
            "step": "complete",
            "order": order,
        }
    if status == ORDER_STATUS_SELLER_REVIEW_REQUIRED:
        return {
            "durum": "başarılı",
            "complete": False,
            "blocked": True,
            "step": "seller_review_required",
            "order": order,
        }
    if status != ORDER_STATUS_COLLECTING:
        return _domain_error(
            "invalid_order_collection_state",
            "Sipariş toplama için geçersiz durumda.",
        )

    (
        config_valid,
        order_number_required,
        image_required,
        custom_text_required,
        config_error,
    ) = read_order_collection_requirements(seller_id)
    if not config_valid:
        return _domain_error(
            "order_config_unavailable",
            config_error or "Sipariş toplama ayarları okunamadı.",
        )

    external_order_number = order.get("external_order_number")
    if order_number_required and (
        not isinstance(external_order_number, str)
        or not external_order_number.strip()
    ):
        return {
            "durum": "başarılı",
            "complete": False,
            "blocked": False,
            "step": "order_number",
            "question": "Sipariş numaranızı paylaşır mısınız?",
            "order": order,
        }

    image_message_id = order.get("image_message_id")
    if image_required and (
        not isinstance(image_message_id, int)
        or isinstance(image_message_id, bool)
        or image_message_id <= 0
    ):
        return {
            "durum": "başarılı",
            "complete": False,
            "blocked": False,
            "step": "image",
            "question": "Üründe kullanılacak görseli gönderebilir misiniz?",
            "order": order,
        }

    custom_text = order.get("custom_text")
    if custom_text_required and (
        not isinstance(custom_text, str) or not custom_text.strip()
    ):
        return {
            "durum": "başarılı",
            "complete": False,
            "blocked": False,
            "step": "custom_text",
            "question": "Üründe kullanılacak özel yazıyı paylaşır mısınız?",
            "order": order,
        }

    required_fields = [
        field
        for field in fields
        if isinstance(field, dict) and field.get("is_required") is True
    ]
    required_fields.sort(
        key=lambda field: (
            field.get("sort_order")
            if isinstance(field.get("sort_order"), int)
            and not isinstance(field.get("sort_order"), bool)
            else 0,
            field.get("id")
            if isinstance(field.get("id"), int)
            and not isinstance(field.get("id"), bool)
            else 0,
        )
    )

    for field in required_fields:
        if field.get("completed") is True:
            continue
        field_payload = _collection_field_payload(field)
        question_result = build_collection_question(field_payload)
        if question_result.get("durum") != "başarılı":
            return _domain_error(
                "order_field_configuration_invalid",
                question_result.get("mesaj")
                or "Zorunlu sipariş alanı güvenli biçimde sorulamıyor.",
            )
        return {
            "durum": "başarılı",
            "complete": False,
            "blocked": False,
            "step": "dynamic_field",
            "field": field_payload,
            "question": question_result["question"],
            "order": order,
        }

    return {
        "durum": "başarılı",
        "complete": True,
        "blocked": False,
        "step": "complete",
        "order": order,
    }

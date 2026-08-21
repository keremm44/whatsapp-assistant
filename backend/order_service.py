from __future__ import annotations

import re
from typing import Any

from database import (
    ORDER_DISPLAY_STATUS,
    ORDER_STATUS_COLLECTING,
    ORDER_STATUS_COMPLETE,
    ORDER_STATUS_SELLER_REVIEW_REQUIRED,
    flag_order_review,
    get_order_by_id,
    get_order_detail,
    get_order_field_definition_by_id,
    get_or_create_active_order,
    get_product_by_id,
    get_seller_product_info,
    initialize_order_collection,
    list_orders,
    record_order_field_value,
    set_order_product_and_snapshot_fields,
    update_order_core,
    update_order_core_from_message,
)
from seller_product_service import list_products as list_seller_products


# =====================================================
# SABİTLER
# =====================================================

SHORT_TEXT_MAX_LENGTH = 120
LONG_TEXT_MAX_LENGTH = 2000
ORDER_NUMBER_MAX_LENGTH = 100
CUSTOMER_NOTE_MAX_LENGTH = 2000
CUSTOM_TEXT_MAX_LENGTH = 1000
PHONE_SNAPSHOT_MAX_LENGTH = 32

FIELD_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,63}$")

BOOLEAN_TRUE_VALUES = {"evet", "var", "olur", "tamam", "kabul", "yes", "true", "1"}
BOOLEAN_FALSE_VALUES = {"hayır", "hayir", "yok", "olmaz", "kabul etmiyorum", "no", "false", "0"}


# =====================================================
# HATA YARDIMCILARI
# =====================================================

def _domain_error(code: str, message: str) -> dict[str, Any]:
    return {
        "durum": "hata",
        "error_code": code,
        "mesaj": message,
    }


def _domain_validation_error(message: str) -> dict[str, Any]:
    return {
        "durum": "doğrulama_hatası",
        "mesaj": message,
    }


# =====================================================
# FIELD TYPE DOĞRULAMA
# =====================================================

def validate_field_value(
    field_type: str,
    value: Any,
    *,
    options: list[dict[str, Any]] | None = None,
    validation_config: dict[str, Any] | None = None,
) -> tuple[bool, Any, str | None]:
    """
    Field type'a göre değeri doğrular ve normalize eder.

    Dönüş: (geçerli_mi, normalize_değer, hata_mesajı)
    """
    config = validation_config or {}

    if field_type == "short_text":
        if not isinstance(value, str):
            return False, None, "Kısa metin değeri metin olmalıdır."

        normalized = value.strip()

        if not normalized:
            return False, None, "Kısa metin boş olamaz."

        max_length = int(config.get("max_length") or SHORT_TEXT_MAX_LENGTH)

        if len(normalized) > max_length:
            return (
                False,
                None,
                f"Kısa metin en fazla {max_length} karakter olabilir.",
            )

        if "<" in normalized or ">" in normalized:
            return False, None, "Kısa metin HTML içeremez."

        return True, normalized, None

    if field_type == "long_text":
        if not isinstance(value, str):
            return False, None, "Uzun metin değeri metin olmalıdır."

        normalized = value.strip()

        if not normalized:
            return False, None, "Uzun metin boş olamaz."

        max_length = int(config.get("max_length") or LONG_TEXT_MAX_LENGTH)

        if len(normalized) > max_length:
            return (
                False,
                None,
                f"Uzun metin en fazla {max_length} karakter olabilir.",
            )

        return True, normalized, None

    if field_type == "number":
        if isinstance(value, bool):
            return False, None, "Sayı değeri boolean olamaz."

        if isinstance(value, str):
            try:
                value = float(value.strip())
            except (TypeError, ValueError):
                return False, None, "Sayı değeri geçersiz."

        if not isinstance(value, (int, float)):
            return False, None, "Sayı değeri sayı olmalıdır."

        min_value = config.get("min")
        max_value = config.get("max")

        if min_value is not None and value < min_value:
            return False, None, f"Sayı en az {min_value} olmalıdır."

        if max_value is not None and value > max_value:
            return False, None, f"Sayı en fazla {max_value} olmalıdır."

        return True, value, None

    if field_type == "single_choice":
        if not isinstance(value, str):
            return False, None, "Tek seçim değeri metin olmalıdır."

        normalized = value.strip()

        valid_values = {
            str(option.get("value"))
            for option in (options or [])
            if isinstance(option, dict) and option.get("value")
        }

        if normalized not in valid_values:
            return False, None, "Seçim değeri geçerli seçeneklerden biri olmalıdır."

        return True, normalized, None

    if field_type == "multi_choice":
        if not isinstance(value, list):
            return False, None, "Çoklu seçim değeri liste olmalıdır."

        valid_values = {
            str(option.get("value"))
            for option in (options or [])
            if isinstance(option, dict) and option.get("value")
        }

        normalized_list: list[str] = []

        for item in value:
            if not isinstance(item, str):
                return False, None, "Çoklu seçim değerleri metin olmalıdır."

            item_normalized = item.strip()

            if item_normalized not in valid_values:
                return (
                    False,
                    None,
                    "Çoklu seçim değerleri geçerli seçeneklerden olmalıdır.",
                )

            if item_normalized not in normalized_list:
                normalized_list.append(item_normalized)

        if not normalized_list:
            return False, None, "En az bir seçim yapılmalıdır."

        max_selections = config.get("max_selections")

        if max_selections is not None and len(normalized_list) > max_selections:
            return (
                False,
                None,
                f"En fazla {max_selections} seçim yapılabilir.",
            )

        return True, normalized_list, None

    if field_type == "boolean":
        if isinstance(value, bool):
            return True, value, None

        if isinstance(value, str):
            normalized = value.strip().lower()

            if normalized in BOOLEAN_TRUE_VALUES:
                return True, True, None

            if normalized in BOOLEAN_FALSE_VALUES:
                return True, False, None

            return False, None, "Evet/hayır cevabı anlaşılamadı."

        return False, None, "Evet/hayır değeri geçersiz."

    if field_type == "image":
        # Görsel değeri yalnız güvenli mesaj referansı taşır.
        if not isinstance(value, dict):
            return False, None, "Görsel değeri mesaj referansı olmalıdır."

        message_id = value.get("message_id")

        if (
            not isinstance(message_id, int)
            or isinstance(message_id, bool)
            or message_id <= 0
        ):
            return False, None, "Görsel mesaj referansı geçersiz."

        return True, {"message_id": message_id}, None

    return False, None, f"Desteklenmeyen alan tipi: {field_type}"


def _normalize_choice_token(value: str) -> str:
    """WhatsApp seçim cevaplarında güvenli, Türkçe-duyarlı karşılaştırma anahtarı."""
    normalized = " ".join(value.strip().split())
    normalized = normalized.translate(str.maketrans({"I": "ı", "İ": "i"}))
    return normalized.lower()


def _resolve_choice_value(
    raw_value: str,
    options: list[dict[str, Any]],
) -> tuple[bool, str | None, str | None]:
    """Option value veya label'ını tek bir canonical value'ya çözer."""
    if not isinstance(raw_value, str) or not raw_value.strip():
        return False, None, "Seçim cevabı boş olamaz."

    target = _normalize_choice_token(raw_value)
    matches: list[str] = []

    for option in options:
        if not isinstance(option, dict):
            continue

        option_value = option.get("value")
        option_label = option.get("label")

        if not isinstance(option_value, str) or not option_value.strip():
            continue

        canonical = option_value.strip()
        comparable_values = [canonical]

        if isinstance(option_label, str) and option_label.strip():
            comparable_values.append(option_label.strip())

        if any(_normalize_choice_token(item) == target for item in comparable_values):
            if canonical not in matches:
                matches.append(canonical)

    if len(matches) == 1:
        return True, matches[0], None

    if len(matches) > 1:
        return False, None, "Seçim cevabı birden fazla seçenekle eşleşiyor."

    return False, None, "Seçim cevabı geçerli seçeneklerden biri olmalıdır."


def parse_collection_field_answer(
    field: dict[str, Any],
    raw_value: Any,
) -> dict[str, Any]:
    """
    WhatsApp'tan gelen dinamik alan cevabını snapshot sözleşmesine göre normalize eder.

    Canlı field definition kullanılmaz; caller'ın order detail içindeki snapshot alanını
    vermesi beklenir.
    """
    field_type = field.get("field_type")
    options = field.get("options")
    validation_config = field.get("validation_config")

    if not isinstance(field_type, str) or not field_type:
        return _domain_validation_error("Sipariş alan tipi geçersiz.")

    safe_options = options if isinstance(options, list) else []
    safe_config = validation_config if isinstance(validation_config, dict) else {}

    candidate = raw_value

    if field_type == "single_choice":
        if not isinstance(raw_value, str):
            return _domain_validation_error("Tek seçim cevabı metin olmalıdır.")

        resolved, candidate, error = _resolve_choice_value(raw_value, safe_options)
        if not resolved:
            return _domain_validation_error(error or "Seçim cevabı geçersiz.")

    elif field_type == "multi_choice":
        raw_items: list[Any]

        if isinstance(raw_value, str):
            raw_items = [
                item.strip()
                for item in re.split(r"[,;\n]+", raw_value)
                if item.strip()
            ]
        elif isinstance(raw_value, list):
            raw_items = raw_value
        else:
            return _domain_validation_error("Çoklu seçim cevabı metin veya liste olmalıdır.")

        resolved_values: list[str] = []

        for item in raw_items:
            if not isinstance(item, str):
                return _domain_validation_error("Çoklu seçim değerleri metin olmalıdır.")

            resolved, canonical, error = _resolve_choice_value(item, safe_options)
            if not resolved or canonical is None:
                return _domain_validation_error(error or "Çoklu seçim cevabı geçersiz.")

            if canonical not in resolved_values:
                resolved_values.append(canonical)

        candidate = resolved_values

    valid, normalized, error = validate_field_value(
        field_type,
        candidate,
        options=safe_options,
        validation_config=safe_config,
    )

    if not valid:
        return _domain_validation_error(error or "Alan cevabı geçersiz.")

    return {
        "durum": "başarılı",
        "value": normalized,
    }


def build_collection_question(field: dict[str, Any]) -> dict[str, Any]:
    """Snapshot alanından deterministic ve ticari karar içermeyen soru üretir."""
    label = field.get("label")
    field_type = field.get("field_type")

    if not isinstance(label, str) or not label.strip():
        return _domain_validation_error("Sipariş alan etiketi geçersiz.")

    label = " ".join(label.strip().split())

    if field_type in {"short_text", "long_text", "number"}:
        return {
            "durum": "başarılı",
            "question": f"{label} bilgisini paylaşır mısınız?",
        }

    if field_type == "boolean":
        return {
            "durum": "başarılı",
            "question": (
                f"{label} için evet veya hayır olarak yanıtlayabilir misiniz?"
            ),
        }

    if field_type in {"single_choice", "multi_choice"}:
        options = field.get("options")
        labels = [
            str(option.get("label")).strip()
            for option in (options if isinstance(options, list) else [])
            if isinstance(option, dict)
            and isinstance(option.get("label"), str)
            and option.get("label").strip()
        ]

        if not labels:
            return _domain_validation_error("Seçim alanının gösterilebilir seçeneği yok.")

        suffix = "Bir veya daha fazla seçenek seçebilirsiniz." if field_type == "multi_choice" else ""
        question = f"{label} tercihiniz nedir?\nSeçenekler: {', '.join(labels)}"
        if suffix:
            question = f"{question}\n{suffix}"

        return {
            "durum": "başarılı",
            "question": question,
        }

    if field_type == "image":
        return {
            "durum": "başarılı",
            "question": f"{label} görselini gönderebilir misiniz?",
        }

    return _domain_validation_error(f"Desteklenmeyen alan tipi: {field_type}")


# =====================================================
# CORE DEĞER DOĞRULAMA
# =====================================================

def validate_order_number(value: str) -> tuple[bool, str | None, str | None]:
    if not isinstance(value, str):
        return False, None, "Sipariş numarası metin olmalıdır."

    normalized = value.strip()

    if not normalized:
        return False, None, "Sipariş numarası boş olamaz."

    if len(normalized) > ORDER_NUMBER_MAX_LENGTH:
        return (
            False,
            None,
            f"Sipariş numarası en fazla {ORDER_NUMBER_MAX_LENGTH} karakter olabilir.",
        )

    return True, normalized, None


def validate_phone_snapshot(value: str) -> tuple[bool, str | None, str | None]:
    if not isinstance(value, str):
        return False, None, "Telefon değeri metin olmalıdır."

    normalized = value.strip()

    if not normalized:
        return False, None, "Telefon değeri boş olamaz."

    if len(normalized) > PHONE_SNAPSHOT_MAX_LENGTH:
        return (
            False,
            None,
            f"Telefon değeri en fazla {PHONE_SNAPSHOT_MAX_LENGTH} karakter olabilir.",
        )

    return True, normalized, None


def validate_customer_note(value: str) -> tuple[bool, str | None, str | None]:
    if not isinstance(value, str):
        return False, None, "Müşteri notu metin olmalıdır."

    normalized = value.strip()

    if len(normalized) > CUSTOMER_NOTE_MAX_LENGTH:
        return (
            False,
            None,
            f"Müşteri notu en fazla {CUSTOMER_NOTE_MAX_LENGTH} karakter olabilir.",
        )

    return True, normalized, None


def validate_custom_text(value: str) -> tuple[bool, str | None, str | None]:
    if not isinstance(value, str):
        return False, None, "Özel metin değeri metin olmalıdır."

    normalized = value.strip()

    if len(normalized) > CUSTOM_TEXT_MAX_LENGTH:
        return (
            False,
            None,
            f"Özel metin en fazla {CUSTOM_TEXT_MAX_LENGTH} karakter olabilir.",
        )

    return True, normalized, None


# =====================================================
# SİPARİŞ SERVİSİ
# =====================================================

def get_or_create_order(
    seller_id: int,
    customer_id: int,
    source_message_id: int,
) -> dict[str, Any]:
    """
    Aktif siparişi atomik olarak getirir veya oluşturur.
    """
    result = get_or_create_active_order(
        seller_id=seller_id,
        customer_id=customer_id,
        source_message_id=source_message_id,
    )

    if result.get("durum") == "başarılı":
        return {
            "durum": "başarılı",
            "order": result["order"],
            "created": result.get("created", False),
            "idempotent": result.get("idempotent", False),
        }

    if result.get("durum") == "reddedildi":
        return _domain_error(
            "order_tenant_scope_violation",
            "Sipariş işlemi bu tenant için geçersiz.",
        )

    if result.get("durum") == "doğrulama_hatası":
        return _domain_validation_error(result.get("mesaj", ""))

    return _domain_error(
        "order_unavailable",
        result.get("mesaj") or "Sipariş işlemi tamamlanamadı.",
    )


def initialize_collection(
    seller_id: int,
    customer_id: int,
    source_message_id: int,
) -> dict[str, Any]:
    """
    Chat sipariş toplama akışını 015 RPC'siyle atomik olarak başlatır.

    Telefon snapshot'ı ve mağaza-geneli alan snapshot'ları database katmanında
    aynı transaction içinde hazırlanır.
    """
    result = initialize_order_collection(
        seller_id=seller_id,
        customer_id=customer_id,
        source_message_id=source_message_id,
    )

    if result.get("durum") == "başarılı":
        response = {
            "durum": "başarılı",
            "order": result["order"],
            "created": result.get("created", False),
            "changed": result.get("changed", False),
            "idempotent": result.get("idempotent", False),
            "snapshot_count": result.get("snapshot_count", 0),
        }

        if result.get("race_resolved") is not None:
            response["race_resolved"] = result.get("race_resolved") is True

        return response

    if result.get("durum") == "reddedildi":
        return _domain_error(
            "order_tenant_scope_violation",
            "Sipariş toplama başlangıcı bu tenant için geçersiz.",
        )

    if result.get("durum") == "doğrulama_hatası":
        return _domain_validation_error(result.get("mesaj", ""))

    return _domain_error(
        "order_unavailable",
        result.get("mesaj") or "Sipariş toplama başlangıcı tamamlanamadı.",
    )


def update_core_from_message(
    seller_id: int,
    customer_id: int,
    order_id: int,
    source_message_id: int,
    *,
    external_order_number: str | None = None,
    customer_phone_snapshot: str | None = None,
    customer_note: str | None = None,
    image_message_id: int | None = None,
    custom_text: str | None = None,
    clear_custom_text: bool = False,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """Chat core mutasyonlarını incoming source message ile ilişkilendirir."""
    if external_order_number is not None:
        valid, normalized, error = validate_order_number(external_order_number)
        if not valid:
            return _domain_validation_error(error or "Sipariş numarası geçersiz.")
        external_order_number = normalized

    if customer_phone_snapshot is not None:
        valid, normalized, error = validate_phone_snapshot(customer_phone_snapshot)
        if not valid:
            return _domain_validation_error(error or "Telefon değeri geçersiz.")
        customer_phone_snapshot = normalized

    if customer_note is not None:
        valid, normalized, error = validate_customer_note(customer_note)
        if not valid:
            return _domain_validation_error(error or "Müşteri notu geçersiz.")
        customer_note = normalized

    if custom_text is not None:
        valid, normalized, error = validate_custom_text(custom_text)
        if not valid:
            return _domain_validation_error(error or "Özel metin geçersiz.")
        custom_text = normalized

    result = update_order_core_from_message(
        seller_id=seller_id,
        customer_id=customer_id,
        order_id=order_id,
        source_message_id=source_message_id,
        external_order_number=external_order_number,
        customer_phone_snapshot=customer_phone_snapshot,
        customer_note=customer_note,
        image_message_id=image_message_id,
        custom_text=custom_text,
        clear_custom_text=clear_custom_text,
        expected_version=expected_version,
    )

    if result.get("durum") == "başarılı":
        return {
            "durum": "başarılı",
            "order": result["order"],
            "changed": result.get("changed", False),
            "completed": result.get("completed", False),
            "idempotent": result.get("idempotent", False),
        }

    if result.get("durum") == "reddedildi":
        return _domain_error(
            "order_tenant_scope_violation",
            "Sipariş veya kaynak mesaj bu tenant için geçersiz.",
        )

    if result.get("durum") == "doğrulama_hatası":
        return _domain_validation_error(result.get("mesaj", ""))

    if result.get("durum") == "çakışma":
        return {
            "durum": "çakışma",
            "order": result.get("order"),
            "mesaj": result.get("mesaj", ""),
        }

    return _domain_error(
        "order_unavailable",
        result.get("mesaj") or "Sipariş core alanları kaynak mesajla güncellenemedi.",
    )


def _read_core_requirement_flag(
    order_config: dict[str, Any],
    key: str,
    *,
    default_when_missing: bool,
) -> tuple[bool, bool, str | None]:
    """Tek bir zorunluluk bayrağını konvansiyona uygun güvenli okur.

    Kabul edilen değerler:
      - None / eksik      -> default_when_missing (legacy uyumluluğu)
      - bool              -> değerin kendisi
      - "true" / "false"  -> legacy string bool uyumluluğu (case-insensitive)

    Bunun dışındaki her değer geçersizdir; çağıran taraf koleksiyonu
    güvenli biçimde durdurur. Sessiz tahmin yapılmaz.
    """
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


def _read_order_core_requirements(
    seller_id: int,
) -> tuple[bool, bool, bool, str | None]:
    """Seller order config'inden image/custom_text zorunluluklarını okur.

    Dönüş: (config_ok, image_required, custom_text_required, error).

    Geriye dönük uyumluluk: mevcut üretim davranışı ana görseli her
    zaman zorunlu saydığı için image_required eksik/None ise TRUE
    kabul edilir; custom_text_required eksik/None ise FALSE kabul
    edilir (mevcut davranışın aynısı). Geçersiz config ticari akışı
    sessizce değiştirmez; deterministik biçimde güvenli hataya düşer.
    """
    result = get_seller_product_info(seller_id)

    if result.get("durum") != "başarılı":
        return False, True, False, "Sipariş toplama ayarları okunamadı."

    product_info = result.get("product_info")
    if not isinstance(product_info, dict):
        return False, True, False, "Sipariş toplama ayarları geçersiz."

    order_config = product_info.get("order") or {}
    if not isinstance(order_config, dict):
        return False, True, False, "Sipariş toplama ayarları geçersiz."

    image_ok, image_required, image_error = _read_core_requirement_flag(
        order_config,
        "image_required",
        default_when_missing=True,
    )
    if not image_ok:
        return False, True, False, image_error

    text_ok, custom_text_required, text_error = _read_core_requirement_flag(
        order_config,
        "custom_text_required",
        default_when_missing=False,
    )
    if not text_ok:
        return False, image_required, False, text_error

    return True, image_required, custom_text_required, None


def _collection_field_payload(field: dict[str, Any]) -> dict[str, Any]:
    """Chat'e yalnız snapshot tabanlı gerekli alan sözleşmesini taşır."""
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


def get_next_collection_step(
    seller_id: int,
    order_id: int,
) -> dict[str, Any]:
    """
    Sipariş snapshot'larını esas alarak sıradaki zorunlu collection adımını belirler.

    Öncelik: sipariş no -> zorunluysa ana görsel -> zorunluysa custom_text ->
    zorunlu dynamic snapshot alanları -> complete. Optional dynamic alanlar
    sorulmaz. Görsel ve custom_text zorunluluğu seller order config'inden
    okunur; config authoritative'dir, müşterinin gönderdiğinden çıkarım
    yapılmaz.
    """
    detail = get_order_detail(seller_id, order_id)

    if detail.get("durum") == "bulunamadı":
        return {
            "durum": "bulunamadı",
            "mesaj": "Sipariş bulunamadı.",
        }

    if detail.get("durum") != "başarılı":
        return _domain_error(
            "order_unavailable",
            detail.get("mesaj") or "Sipariş detayı okunamadı.",
        )

    order = detail.get("order")
    fields = detail.get("fields")

    if not isinstance(order, dict) or not isinstance(fields, list):
        return _domain_error(
            "order_unavailable",
            "Sipariş detayı geçersiz yanıt döndürdü.",
        )

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

    external_order_number = order.get("external_order_number")
    if not isinstance(external_order_number, str) or not external_order_number.strip():
        return {
            "durum": "başarılı",
            "complete": False,
            "blocked": False,
            "step": "order_number",
            "question": "Sipariş numaranızı paylaşır mısınız?",
            "order": order,
        }

    (
        config_valid,
        image_required,
        custom_text_required,
        config_error,
    ) = _read_order_core_requirements(seller_id)
    if not config_valid:
        return _domain_error(
            "order_config_unavailable",
            config_error or "Sipariş toplama ayarları okunamadı.",
        )

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


def set_order_product(
    seller_id: int,
    customer_id: int,
    order_id: int,
    product_id: int,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """
    Ürünü doğrular ve aktif alan tanımlarını siparişe snapshot olarak sabitler.
    """
    product_result = get_product_by_id(seller_id, product_id)

    if product_result.get("durum") != "başarılı":
        if product_result.get("durum") == "bulunamadı":
            return _domain_error(
                "product_not_found",
                "Ürün bu satıcı kapsamında bulunamadı.",
            )
        return _domain_error(
            "product_unavailable",
            "Ürün doğrulanamadı.",
        )

    result = set_order_product_and_snapshot_fields(
        seller_id=seller_id,
        customer_id=customer_id,
        order_id=order_id,
        product_id=product_id,
        expected_version=expected_version,
    )

    if result.get("durum") == "başarılı":
        return {
            "durum": "başarılı",
            "order": result["order"],
            "snapshot_count": result.get("snapshot_count", 0),
        }

    if result.get("durum") == "ürün_değişikliği_inceleme_gerekli":
        return {
            "durum": "ürün_değişikliği_inceleme_gerekli",
            "order": result.get("order"),
            "mesaj": result.get("mesaj", ""),
        }

    if result.get("durum") == "çakışma":
        return {
            "durum": "çakışma",
            "order": result.get("order"),
            "mesaj": result.get("mesaj", ""),
        }

    if result.get("durum") == "reddedildi":
        return _domain_error(
            "order_tenant_scope_violation",
            "Ürün veya sipariş bu tenant için geçersiz.",
        )

    return _domain_error(
        "order_unavailable",
        result.get("mesaj") or "Ürün ve alan snapshot işlemi tamamlanamadı.",
    )


def _is_positive_product_id(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def normalize_product_selection_text(value: str) -> str:
    """Türkçe-duyarlı, tam eşleşme için güvenli karşılaştırma anahtarı."""
    normalized = " ".join(value.strip().split())
    normalized = normalized.translate(str.maketrans({"I": "ı", "İ": "i"}))
    return normalized.casefold()


def list_active_order_products(seller_id: int) -> dict[str, Any]:
    """Yeni sipariş seçiminde kullanılacak aktif ürünleri canonical listedir."""
    result = list_seller_products(seller_id, include_inactive=False)
    if result.get("ok") is not True:
        return _domain_error(
            "order_product_list_unavailable",
            result.get("error", {}).get("message")
            if isinstance(result.get("error"), dict)
            else "Aktif ürün listesi okunamadı.",
        )

    products: list[dict[str, Any]] = []
    for row in result.get("products") or []:
        if not isinstance(row, dict):
            continue
        product_id = row.get("id")
        name = row.get("name")
        if not _is_positive_product_id(product_id):
            continue
        if not isinstance(name, str) or not name.strip():
            continue
        if row.get("is_active") is not True:
            continue
        products.append({"id": product_id, "name": name.strip()})

    return {"durum": "başarılı", "products": products}


def resolve_new_order_product_decision(seller_id: int) -> dict[str, Any]:
    """Yeni siparişte 0 / 1 / 2+ aktif ürün kararını fail-closed üretir."""
    listed = list_active_order_products(seller_id)
    if listed.get("durum") != "başarılı":
        return listed

    products = listed["products"]
    if len(products) == 0:
        return {"durum": "başarılı", "decision": "none", "products": products}
    if len(products) == 1:
        return {
            "durum": "başarılı",
            "decision": "single",
            "product": products[0],
            "products": products,
        }
    return {
        "durum": "başarılı",
        "decision": "multiple",
        "products": products,
    }


def match_order_product_selection(
    raw_value: str,
    products: list[dict[str, Any]],
) -> dict[str, Any]:
    """Yalnız sıra numarası veya tam normalize isimle tek ürün seçer."""
    if not isinstance(raw_value, str) or not raw_value.strip():
        return {"durum": "eşleşmedi"}
    if not products:
        return {"durum": "eşleşmedi"}

    text = " ".join(raw_value.strip().split())
    if text.isdigit():
        index = int(text)
        if 1 <= index <= len(products):
            return {"durum": "başarılı", "product": products[index - 1]}
        return {"durum": "eşleşmedi"}

    target = normalize_product_selection_text(text)
    matches = [
        product
        for product in products
        if normalize_product_selection_text(str(product.get("name") or "")) == target
    ]
    if len(matches) == 1:
        return {"durum": "başarılı", "product": matches[0]}
    return {"durum": "eşleşmedi"}


def build_product_selection_question(products: list[dict[str, Any]]) -> str:
    """Aktif ürünlerden deterministic Türkçe seçim sorusu üretir."""
    lines = ["Bu sipariş hangi ürün için?"]
    for index, product in enumerate(products, start=1):
        lines.append(f"{index}. {product['name']}")
    lines.append("")
    lines.append("Ürün adını veya sıra numarasını yazabilirsiniz.")
    return "\n".join(lines)


def record_field_value(
    seller_id: int,
    customer_id: int,
    order_id: int,
    field_snapshot_id: int,
    field_type: str,
    value: Any,
    source_message_id: int,
    *,
    options: list[dict[str, Any]] | None = None,
    validation_config: dict[str, Any] | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """
    Alan değerini doğrular ve kalıcı sipariş sistemine yazar.
    """
    valid, normalized, error = validate_field_value(
        field_type,
        value,
        options=options,
        validation_config=validation_config,
    )

    if not valid:
        return _domain_validation_error(error or "Alan değeri geçersiz.")

    result = record_order_field_value(
        seller_id=seller_id,
        customer_id=customer_id,
        order_id=order_id,
        field_snapshot_id=field_snapshot_id,
        value=normalized,
        source_message_id=source_message_id,
        expected_version=expected_version,
    )

    if result.get("durum") == "başarılı":
        return {
            "durum": "başarılı",
            "order": result["order"],
            "changed": result.get("changed", False),
            "completed": result.get("completed", False),
            "idempotent": result.get("idempotent", False),
        }

    if result.get("durum") == "reddedildi":
        return _domain_error(
            "order_tenant_scope_violation",
            "Sipariş veya alan bu tenant için geçersiz.",
        )

    if result.get("durum") == "çakışma":
        return {
            "durum": "çakışma",
            "order": result.get("order"),
            "mesaj": result.get("mesaj", ""),
        }

    return _domain_error(
        "order_unavailable",
        result.get("mesaj") or "Sipariş alan değeri kaydedilemedi.",
    )


def update_core(
    seller_id: int,
    customer_id: int,
    order_id: int,
    *,
    external_order_number: str | None = None,
    customer_phone_snapshot: str | None = None,
    customer_note: str | None = None,
    image_message_id: int | None = None,
    custom_text: str | None = None,
    clear_custom_text: bool = False,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """
    Core sipariş alanlarını doğrular ve günceller.
    """
    if external_order_number is not None:
        valid, normalized, error = validate_order_number(external_order_number)
        if not valid:
            return _domain_validation_error(error or "Sipariş numarası geçersiz.")
        external_order_number = normalized

    if customer_phone_snapshot is not None:
        valid, normalized, error = validate_phone_snapshot(customer_phone_snapshot)
        if not valid:
            return _domain_validation_error(error or "Telefon değeri geçersiz.")
        customer_phone_snapshot = normalized

    if customer_note is not None:
        valid, normalized, error = validate_customer_note(customer_note)
        if not valid:
            return _domain_validation_error(error or "Müşteri notu geçersiz.")
        customer_note = normalized

    if custom_text is not None:
        valid, normalized, error = validate_custom_text(custom_text)
        if not valid:
            return _domain_validation_error(error or "Özel metin geçersiz.")
        custom_text = normalized

    result = update_order_core(
        seller_id=seller_id,
        customer_id=customer_id,
        order_id=order_id,
        external_order_number=external_order_number,
        customer_phone_snapshot=customer_phone_snapshot,
        customer_note=customer_note,
        image_message_id=image_message_id,
        custom_text=custom_text,
        clear_custom_text=clear_custom_text,
        expected_version=expected_version,
    )

    if result.get("durum") == "başarılı":
        return {
            "durum": "başarılı",
            "order": result["order"],
            "changed": result.get("changed", False),
            "completed": result.get("completed", False),
        }

    if result.get("durum") == "reddedildi":
        return _domain_error(
            "order_tenant_scope_violation",
            "Sipariş veya mesaj bu tenant için geçersiz.",
        )

    if result.get("durum") == "çakışma":
        return {
            "durum": "çakışma",
            "order": result.get("order"),
            "mesaj": result.get("mesaj", ""),
        }

    return _domain_error(
        "order_unavailable",
        result.get("mesaj") or "Sipariş core alanları güncellenemedi.",
    )


def flag_for_review(
    seller_id: int,
    customer_id: int,
    order_id: int,
    review_code: str,
    review_note: str | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """
    Siparişi satıcı incelemesine bırakır.
    """
    result = flag_order_review(
        seller_id=seller_id,
        customer_id=customer_id,
        order_id=order_id,
        review_code=review_code,
        review_note=review_note,
        expected_version=expected_version,
    )

    if result.get("durum") == "başarılı":
        return {
            "durum": "başarılı",
            "order": result["order"],
        }

    if result.get("durum") == "çakışma":
        return {
            "durum": "çakışma",
            "order": result.get("order"),
            "mesaj": result.get("mesaj", ""),
        }

    return _domain_error(
        "order_unavailable",
        result.get("mesaj") or "Sipariş inceleme durumuna alınamadı.",
    )


def get_order(
    seller_id: int,
    order_id: int,
) -> dict[str, Any]:
    """
    Siparişi tenant scope'unda okur.
    """
    result = get_order_by_id(seller_id, order_id)

    if result.get("durum") == "başarılı":
        return {
            "durum": "başarılı",
            "order": result["order"],
        }

    if result.get("durum") == "bulunamadı":
        return {
            "durum": "bulunamadı",
            "mesaj": "Sipariş bulunamadı.",
        }

    return _domain_error(
        "order_unavailable",
        result.get("mesaj") or "Sipariş okunamadı.",
    )


def get_order_with_fields(
    seller_id: int,
    order_id: int,
) -> dict[str, Any]:
    """
    Sipariş detayını snapshot alanları ve değerleriyle birlikte okur.
    """
    result = get_order_detail(seller_id, order_id)

    if result.get("durum") == "başarılı":
        return {
            "durum": "başarılı",
            "order": result["order"],
            "fields": result["fields"],
        }

    if result.get("durum") == "bulunamadı":
        return {
            "durum": "bulunamadı",
            "mesaj": "Sipariş bulunamadı.",
        }

    return _domain_error(
        "order_unavailable",
        result.get("mesaj") or "Sipariş detayı okunamadı.",
    )


def present_order_summary(order: dict[str, Any]) -> dict[str, Any]:
    """Sipariş listesi için güvenli özet üretir (legacy + v2 listeler)."""
    status_value = order.get("status")
    display_status = ORDER_DISPLAY_STATUS.get(
        status_value,
        status_value or "Bilinmiyor",
    )

    return {
        "id": order.get("id"),
        "external_order_number": order.get("external_order_number"),
        "product_id": order.get("product_id"),
        "product_name_snapshot": order.get("product_name_snapshot"),
        "customer_id": order.get("customer_id"),
        "customer_phone_snapshot": order.get("customer_phone_snapshot"),
        "status": status_value,
        "display_status": display_status,
        "image_message_id": order.get("image_message_id"),
        "has_image": order.get("image_message_id") is not None,
        "custom_text": order.get("custom_text"),
        "review_reason_code": order.get("review_reason_code"),
        "review_reason_note": order.get("review_reason_note"),
        "version": order.get("version"),
        "created_at": order.get("created_at"),
        "updated_at": order.get("updated_at"),
        "completed_at": order.get("completed_at"),
        "seller_action_required": (
            status_value == ORDER_STATUS_SELLER_REVIEW_REQUIRED
        ),
    }


def list_seller_orders(
    seller_id: int,
    *,
    view: str = "all",
    status: str | None = None,
    product_id: int | None = None,
    image_missing: bool | None = None,
    customer_id: int | None = None,
    external_order_number: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    """
    Satıcının siparişlerini tenant scope'unda listeler.
    """
    result = list_orders(
        seller_id,
        view=view,
        status=status,
        product_id=product_id,
        image_missing=image_missing,
        customer_id=customer_id,
        external_order_number=external_order_number,
        limit=limit,
        offset=offset,
    )

    if result.get("durum") == "başarılı":
        return {
            "durum": "başarılı",
            "toplam": result["toplam"],
            "orders": result["orders"],
        }

    if result.get("durum") == "doğrulama_hatası":
        return _domain_validation_error(result.get("mesaj", ""))

    return _domain_error(
        "order_unavailable",
        result.get("mesaj") or "Siparişler okunamadı.",
    )


# =====================================================
# ALAN TANIMI SERVİSİ
# =====================================================

def get_field_definition(
    seller_id: int,
    field_id: int,
) -> dict[str, Any]:
    """
    Alan tanımını tenant scope'unda okur.
    """
    result = get_order_field_definition_by_id(seller_id, field_id)

    if result.get("durum") == "başarılı":
        return {
            "durum": "başarılı",
            "definition": result["definition"],
        }

    if result.get("durum") == "bulunamadı":
        return {
            "durum": "bulunamadı",
            "mesaj": "Alan tanımı bulunamadı.",
        }

    return _domain_error(
        "field_definition_unavailable",
        result.get("mesaj") or "Alan tanımı okunamadı.",
    )
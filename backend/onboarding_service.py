from __future__ import annotations

import re
import unicodedata
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator


# =====================================================
# ONBOARDING ADIM TANIMLARI
# =====================================================

ONBOARDING_STEP_KEYS: dict[int, str] = {
    1: "business_info",
    2: "store_info",
    3: "product_info",
    4: "shipping_info",
    5: "return_policy",
    6: "rules_and_templates",
    7: "test_chat",
    8: "whatsapp_connection",
    9: "live_test",
    10: "activation",
}

ONBOARDING_STEP_TITLES: dict[int, str] = {
    1: "İşletme Bilgileri",
    2: "Mağaza Bilgileri",
    3: "Ürün Bilgileri",
    4: "Kargo Bilgileri",
    5: "İade Politikası",
    6: "Kurallar ve Hazır Cevaplar",
    7: "Test Sohbeti",
    8: "WhatsApp Bağlantısı",
    9: "Canlı Test",
    10: "Aktivasyon Onayı",
}

_SECRET_FIELD_NAMES = {
    "access_token",
    "token",
    "app_secret",
    "client_secret",
    "service_key",
    "api_key",
    "password",
}

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_PHONE_RE = re.compile(r"^\+?[0-9]{7,20}$")
_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9_.:-]{3,200}$")
_CATEGORY_RE = re.compile(r"^[a-z0-9_\-]{1,50}$")


# =====================================================
# ORTAK DOĞRULAMA YARDIMCILARI
# =====================================================


def _normalize_phone(value: str) -> str:
    normalized = re.sub(r"[\s()\-]", "", value.strip())

    if not _PHONE_RE.fullmatch(normalized):
        raise ValueError(
            "Telefon numarası 7-20 rakam içermeli ve yalnızca başında + olabilir."
        )

    return normalized


def _validate_http_url(value: str) -> str:
    normalized = value.strip()
    parsed = urlparse(normalized)

    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Geçerli bir http veya https bağlantısı girilmelidir.")

    return normalized


def _validate_email(value: str) -> str:
    normalized = value.strip().lower()

    if len(normalized) > 254 or not _EMAIL_RE.fullmatch(normalized):
        raise ValueError("Geçerli bir e-posta adresi girilmelidir.")

    return normalized


def _normalize_match_text(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value.casefold().strip())
    return "".join(
        character
        for character in folded
        if not unicodedata.combining(character)
    )


def _validate_identifier(value: str) -> str:
    normalized = value.strip()

    if not _IDENTIFIER_RE.fullmatch(normalized):
        raise ValueError(
            "Kimlik alanı yalnızca harf, rakam, nokta, tire, alt çizgi ve iki nokta içerebilir."
        )

    return normalized


def _validate_no_secret_fields(data: Any, path: tuple[str, ...] = ()) -> None:
    if isinstance(data, dict):
        for key, value in data.items():
            normalized_key = str(key).strip().lower()

            if normalized_key in _SECRET_FIELD_NAMES:
                field_path = ".".join((*path, str(key)))
                raise ValueError(
                    f"Gizli erişim bilgileri onboarding verisine kaydedilemez: {field_path}"
                )

            _validate_no_secret_fields(value, (*path, str(key)))

    elif isinstance(data, list):
        for index, value in enumerate(data):
            _validate_no_secret_fields(value, (*path, str(index)))


class StrictStepModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
        str_strip_whitespace=True,
    )


# =====================================================
# ADIM MODELLERİ
# =====================================================


class BusinessInfoStep(StrictStepModel):
    name: str = Field(
        min_length=2,
        max_length=120,
        description="İşletme sahibi veya yetkili kişinin adı soyadı.",
    )
    email: str = Field(
        min_length=5,
        max_length=254,
        description="İşletmenin iletişim e-posta adresi.",
    )
    phone: str = Field(
        min_length=7,
        max_length=30,
        description="İşletmenin iletişim telefon numarası.",
    )

    _normalize_email = field_validator("email")(_validate_email)
    _normalize_phone = field_validator("phone")(_normalize_phone)


class StoreInfoStep(StrictStepModel):
    store_name: str = Field(
        min_length=2,
        max_length=160,
        description="Müşterilerin gördüğü mağaza adı.",
    )
    store_link: str = Field(
        min_length=8,
        max_length=500,
        description="Ürün ve fiyatların bulunduğu mağaza bağlantısı.",
    )

    _normalize_store_link = field_validator("store_link")(_validate_http_url)


class ProductInfoStep(StrictStepModel):
    material: str = Field(min_length=2, max_length=100)
    size_ml: int = Field(ge=50, le=2000)
    print_method: str = Field(min_length=2, max_length=100)
    custom_text_max_length: int | None = Field(default=None, ge=1, le=500)

    min_quantity: int = Field(ge=1, le=100000)
    max_quantity: int | None = Field(default=None, ge=1, le=100000)
    image_required: bool
    custom_text_required: bool

    microwave_safe: bool | None
    dishwasher_safe: bool | None
    hand_wash_recommended: bool | None
    food_safe: bool | None

    @model_validator(mode="after")
    def validate_quantity_range(self) -> "ProductInfoStep":
        if self.max_quantity is not None and self.max_quantity < self.min_quantity:
            raise ValueError(
                "Maksimum sipariş adedi minimum sipariş adedinden küçük olamaz."
            )

        if self.custom_text_required and self.custom_text_max_length is None:
            raise ValueError(
                "Özel yazı zorunluysa maksimum karakter sayısı belirtilmelidir."
            )

        return self


class ShippingInfoStep(StrictStepModel):
    processing_days_min: int = Field(ge=0, le=60)
    processing_days_max: int = Field(ge=0, le=60)
    same_day_available: bool
    company: str = Field(min_length=2, max_length=120)
    international: bool

    @model_validator(mode="after")
    def validate_processing_range(self) -> "ShippingInfoStep":
        if self.processing_days_max < self.processing_days_min:
            raise ValueError(
                "Maksimum hazırlık süresi minimum hazırlık süresinden küçük olamaz."
            )

        if self.same_day_available and self.processing_days_min > 0:
            raise ValueError(
                "Aynı gün gönderim varsa minimum hazırlık süresi 0 olmalıdır."
            )

        return self


class ReturnPolicyStep(StrictStepModel):
    accepts_returns: bool
    return_period_days: int | None = Field(default=None, ge=0, le=365)
    damage_replacement: bool
    wrong_print_replacement: bool

    @model_validator(mode="after")
    def validate_return_period(self) -> "ReturnPolicyStep":
        if self.accepts_returns:
            if self.return_period_days is None or self.return_period_days < 1:
                raise ValueError(
                    "İade kabul ediliyorsa iade süresi en az 1 gün olmalıdır."
                )
        elif self.return_period_days not in {None, 0}:
            raise ValueError(
                "İade kabul edilmiyorsa iade süresi boş veya 0 olmalıdır."
            )

        return self


class SellerRuleItem(StrictStepModel):
    trigger_text: str = Field(min_length=2, max_length=150)
    response_text: str = Field(min_length=2, max_length=1500)
    category: str = Field(default="custom", min_length=1, max_length=50)
    is_active: bool = True

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str) -> str:
        normalized = value.strip().lower().replace(" ", "_")

        if not _CATEGORY_RE.fullmatch(normalized):
            raise ValueError(
                "Kategori yalnızca küçük harf, rakam, tire ve alt çizgi içerebilir."
            )

        return normalized


class RulesAndTemplatesStep(StrictStepModel):
    templates_confirmed: Literal[True]
    rules: list[SellerRuleItem] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_unique_triggers(self) -> "RulesAndTemplatesStep":
        seen: set[str] = set()

        for rule in self.rules:
            normalized = _normalize_match_text(rule.trigger_text)

            if normalized in seen:
                raise ValueError(
                    "Aynı tetikleyici metin birden fazla kuralda kullanılamaz."
                )

            seen.add(normalized)

        return self


class TestChatStep(StrictStepModel):
    test_passed: Literal[True]
    seller_confirmed: Literal[True]
    sample_message: str | None = Field(default=None, max_length=1000)


class WhatsAppConnectionStep(StrictStepModel):
    connection_status: Literal["connected"]
    display_phone_number: str = Field(min_length=7, max_length=30)
    phone_number_id: str = Field(min_length=3, max_length=200)
    business_account_id: str = Field(min_length=3, max_length=200)

    _normalize_display_phone = field_validator("display_phone_number")(
        _normalize_phone
    )
    _normalize_phone_number_id = field_validator("phone_number_id")(
        _validate_identifier
    )
    _normalize_business_account_id = field_validator("business_account_id")(
        _validate_identifier
    )


class LiveTestStep(StrictStepModel):
    inbound_message_received: Literal[True]
    outbound_message_delivered: Literal[True]
    test_passed: Literal[True]


class ActivationStep(StrictStepModel):
    information_confirmed: Literal[True]
    terms_accepted: Literal[True]
    ready_for_activation: Literal[True]
    terms_version: str = Field(min_length=1, max_length=50)


STEP_MODELS: dict[int, type[StrictStepModel]] = {
    1: BusinessInfoStep,
    2: StoreInfoStep,
    3: ProductInfoStep,
    4: ShippingInfoStep,
    5: ReturnPolicyStep,
    6: RulesAndTemplatesStep,
    7: TestChatStep,
    8: WhatsAppConnectionStep,
    9: LiveTestStep,
    10: ActivationStep,
}


# =====================================================
# DOĞRULAMA VE EŞLEŞTİRME
# =====================================================


def _friendly_validation_errors(exc: ValidationError) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []

    for item in exc.errors(include_url=False, include_input=False):
        error_type = str(item.get("type") or "validation_error")
        location = [str(part) for part in item.get("loc", ())]

        if error_type == "missing":
            message = "Bu alan zorunludur."
        elif error_type == "extra_forbidden":
            message = "Bu alan bu onboarding adımında kullanılamaz."
        elif error_type in {"bool_type", "int_type", "string_type", "list_type"}:
            message = "Alan tipi geçersiz."
        elif error_type == "literal_error":
            message = "Bu adımın tamamlanması için gerekli onay verilmelidir."
        else:
            message = str(item.get("msg") or "Alan doğrulanamadı.")
            message = message.removeprefix("Value error, ")

        errors.append(
            {
                "field": ".".join(location) if location else "step_data",
                "code": error_type,
                "message": message,
            }
        )

    return errors


def _build_patches(
    step_order: int,
    normalized: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]] | None]:
    seller_patch: dict[str, Any] = {}
    product_info_patch: dict[str, Any] = {}
    rules_payload: list[dict[str, Any]] | None = None

    if step_order == 1:
        seller_patch = {
            "name": normalized["name"],
            "email": normalized["email"],
            "phone": normalized["phone"],
        }

    elif step_order == 2:
        seller_patch = {
            "store_name": normalized["store_name"],
            "store_link": normalized["store_link"],
        }

    elif step_order == 3:
        product_info_patch = {
            "product": {
                "material": normalized["material"],
                "size_ml": normalized["size_ml"],
                "print_method": normalized["print_method"],
                "custom_text_max_length": normalized[
                    "custom_text_max_length"
                ],
            },
            "order": {
                "min_quantity": normalized["min_quantity"],
                "max_quantity": normalized["max_quantity"],
                "image_required": normalized["image_required"],
                "custom_text_required": normalized[
                    "custom_text_required"
                ],
            },
            "usage": {
                "microwave_safe": normalized["microwave_safe"],
                "dishwasher_safe": normalized["dishwasher_safe"],
                "hand_wash_recommended": normalized[
                    "hand_wash_recommended"
                ],
                "food_safe": normalized["food_safe"],
            },
        }

    elif step_order == 4:
        product_info_patch = {
            "shipping": {
                "processing_days_min": normalized[
                    "processing_days_min"
                ],
                "processing_days_max": normalized[
                    "processing_days_max"
                ],
                "same_day_available": normalized[
                    "same_day_available"
                ],
                "company": normalized["company"],
                "international": normalized["international"],
            }
        }

    elif step_order == 5:
        product_info_patch = {
            "return": {
                "accepts_returns": normalized["accepts_returns"],
                "return_period_days": normalized[
                    "return_period_days"
                ],
                "damage_replacement": normalized[
                    "damage_replacement"
                ],
                "wrong_print_replacement": normalized[
                    "wrong_print_replacement"
                ],
            }
        }

    elif step_order == 6:
        rules_payload = normalized["rules"]

    return seller_patch, product_info_patch, rules_payload


def prepare_onboarding_step(
    step_order: int,
    step_data: dict[str, Any] | None,
) -> dict[str, Any]:
    """
    Onboarding payloadını doğrular, normalize eder ve hedef tablo yamalarını üretir.

    Bu fonksiyon veritabanına yazmaz. Böylece doğrulama bağımsız olarak test edilir.
    """
    model_class = STEP_MODELS.get(step_order)

    if model_class is None:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Geçersiz onboarding adımı.",
            "errors": [
                {
                    "field": "step_order",
                    "code": "invalid_step",
                    "message": "Onboarding adımı 1 ile 10 arasında olmalıdır.",
                }
            ],
        }

    if not isinstance(step_data, dict):
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Onboarding verisi doğrulanamadı.",
            "errors": [
                {
                    "field": "step_data",
                    "code": "dict_type",
                    "message": "Onboarding verisi bir nesne olmalıdır.",
                }
            ],
        }

    try:
        _validate_no_secret_fields(step_data)
        model = model_class.model_validate(step_data)
    except ValidationError as exc:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Onboarding verisi doğrulanamadı.",
            "errors": _friendly_validation_errors(exc),
        }
    except ValueError as exc:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Onboarding verisi doğrulanamadı.",
            "errors": [
                {
                    "field": "step_data",
                    "code": "unsafe_field",
                    "message": str(exc),
                }
            ],
        }

    normalized = model.model_dump(mode="json")
    seller_patch, product_info_patch, rules_payload = _build_patches(
        step_order,
        normalized,
    )

    return {
        "durum": "başarılı",
        "step_order": step_order,
        "step_key": ONBOARDING_STEP_KEYS[step_order],
        "normalized_step_data": normalized,
        "seller_patch": seller_patch,
        "product_info_patch": product_info_patch,
        "rules_payload": rules_payload,
    }


def get_onboarding_schema() -> dict[str, Any]:
    """Frontend'in kullanacağı adım sözleşmelerini döndürür."""
    steps: list[dict[str, Any]] = []

    for step_order in range(1, 11):
        model_class = STEP_MODELS[step_order]
        steps.append(
            {
                "step_order": step_order,
                "step_key": ONBOARDING_STEP_KEYS[step_order],
                "title": ONBOARDING_STEP_TITLES[step_order],
                "schema": model_class.model_json_schema(),
            }
        )

    return {
        "version": "onboarding_v1",
        "total_steps": 10,
        "steps": steps,
    }

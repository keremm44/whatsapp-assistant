from __future__ import annotations

import re
from copy import deepcopy
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from database import (
    create_seller_rule_record,
    deactivate_seller_rule_record,
    get_seller_rule_record,
    get_seller_settings_record,
    list_seller_rule_records,
    update_seller_rule_record,
    update_seller_settings_record,
)
from rule_security import normalize_rule_response_text, normalize_rule_trigger_text

_PHONE_RE = re.compile(r"^\+?[0-9]{7,15}$")
_CATEGORY_RE = re.compile(r"^[a-z0-9_-]+$")


def _failure(code: str, message: str, *, kind: str) -> dict[str, Any]:
    return {
        "ok": False,
        "error": {"code": code, "message": message},
        "kind": kind,
    }


def _normalize_phone(value: str) -> str:
    digits = re.sub(r"[^0-9]", "", value)
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("0") and len(digits) == 11:
        digits = "90" + digits[1:]
    normalized = "+" + digits if digits else ""
    if not _PHONE_RE.fullmatch(normalized):
        raise ValueError("Geçerli bir telefon numarası girilmelidir.")
    return normalized


def _validate_http_url(value: str) -> str:
    normalized = value.strip()
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Mağaza bağlantısı http veya https ile başlamalıdır.")
    return normalized


def _normalize_category(value: str) -> str:
    normalized = value.strip().lower().replace(" ", "_")
    if not _CATEGORY_RE.fullmatch(normalized):
        raise ValueError(
            "Kategori yalnızca küçük harf, rakam, tire ve alt çizgi içerebilir."
        )
    return normalized


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class BusinessSettingsPatch(StrictModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, min_length=7, max_length=30)
    store_name: str | None = Field(default=None, min_length=2, max_length=160)
    store_link: str | None = Field(default=None, min_length=8, max_length=500)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        return _normalize_phone(value) if value is not None else None

    @field_validator("store_link")
    @classmethod
    def normalize_store_link(cls, value: str | None) -> str | None:
        return _validate_http_url(value) if value is not None else None

    @model_validator(mode="after")
    def required_text_cannot_be_cleared(self) -> "BusinessSettingsPatch":
        for field_name in ("name", "store_name"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} boş bırakılamaz.")
        return self


class ProductSettingsPatch(StrictModel):
    material: str | None = Field(default=None, min_length=2, max_length=100)
    size_ml: int | None = Field(default=None, ge=50, le=2000)
    print_method: str | None = Field(default=None, min_length=2, max_length=100)
    custom_text_max_length: int | None = Field(default=None, ge=1, le=500)

    @model_validator(mode="after")
    def required_fields_cannot_be_cleared(self) -> "ProductSettingsPatch":
        for field_name in ("material", "size_ml", "print_method"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} null olamaz.")
        return self


class OrderSettingsPatch(StrictModel):
    min_quantity: int | None = Field(default=None, ge=1, le=100000)
    max_quantity: int | None = Field(default=None, ge=1, le=100000)
    image_required: bool | None = None
    custom_text_required: bool | None = None

    @model_validator(mode="after")
    def required_fields_cannot_be_cleared(self) -> "OrderSettingsPatch":
        for field_name in ("min_quantity", "image_required", "custom_text_required"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} null olamaz.")
        return self


class UsageSettingsPatch(StrictModel):
    microwave_safe: bool | None = None
    dishwasher_safe: bool | None = None
    hand_wash_recommended: bool | None = None
    food_safe: bool | None = None


class ShippingSettingsPatch(StrictModel):
    processing_days_min: int | None = Field(default=None, ge=0, le=60)
    processing_days_max: int | None = Field(default=None, ge=0, le=60)
    same_day_available: bool | None = None
    company: str | None = Field(default=None, min_length=2, max_length=120)
    international: bool | None = None

    @model_validator(mode="after")
    def required_fields_cannot_be_cleared(self) -> "ShippingSettingsPatch":
        for field_name in (
            "processing_days_min",
            "processing_days_max",
            "same_day_available",
            "company",
            "international",
        ):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} null olamaz.")
        return self


class ReturnPolicySettingsPatch(StrictModel):
    accepts_returns: bool | None = None
    return_period_days: int | None = Field(default=None, ge=0, le=365)
    damage_replacement: bool | None = None
    wrong_print_replacement: bool | None = None

    @model_validator(mode="after")
    def required_fields_cannot_be_cleared(self) -> "ReturnPolicySettingsPatch":
        for field_name in ("accepts_returns", "damage_replacement", "wrong_print_replacement"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} null olamaz.")
        return self


class SellerSettingsUpdateRequest(StrictModel):
    expected_version: int = Field(gt=0)
    business: BusinessSettingsPatch | None = None
    product: ProductSettingsPatch | None = None
    order: OrderSettingsPatch | None = None
    usage: UsageSettingsPatch | None = None
    shipping: ShippingSettingsPatch | None = None
    return_policy: ReturnPolicySettingsPatch | None = None

    @model_validator(mode="after")
    def require_patch(self) -> "SellerSettingsUpdateRequest":
        sections = (
            self.business,
            self.product,
            self.order,
            self.usage,
            self.shipping,
            self.return_policy,
        )
        if not any(section is not None and section.model_fields_set for section in sections):
            raise ValueError("En az bir ayar alanı gönderilmelidir.")
        return self


class SellerRuleCreateRequest(StrictModel):
    trigger_text: str = Field(min_length=2, max_length=150)
    response_text: str = Field(min_length=2, max_length=1500)
    category: str = Field(default="custom", min_length=1, max_length=50)
    is_active: bool = True

    _normalize_trigger_text = field_validator("trigger_text", mode="before")(
        normalize_rule_trigger_text
    )
    _normalize_response_text = field_validator("response_text", mode="before")(
        normalize_rule_response_text
    )
    _normalize_category = field_validator("category")(_normalize_category)


class SellerRuleUpdateRequest(StrictModel):
    expected_version: int = Field(gt=0)
    trigger_text: str | None = Field(default=None, min_length=2, max_length=150)
    response_text: str | None = Field(default=None, min_length=2, max_length=1500)
    category: str | None = Field(default=None, min_length=1, max_length=50)
    is_active: bool | None = None

    @field_validator("trigger_text", mode="before")
    @classmethod
    def normalize_trigger_text(cls, value: Any) -> Any:
        return normalize_rule_trigger_text(value) if value is not None else None

    @field_validator("response_text", mode="before")
    @classmethod
    def normalize_response_text(cls, value: Any) -> Any:
        return normalize_rule_response_text(value) if value is not None else None

    @field_validator("category")
    @classmethod
    def normalize_category(cls, value: str | None) -> str | None:
        return _normalize_category(value) if value is not None else None

    @model_validator(mode="after")
    def require_change(self) -> "SellerRuleUpdateRequest":
        mutable = {"trigger_text", "response_text", "category", "is_active"}
        provided = mutable & self.model_fields_set
        if not provided:
            raise ValueError("En az bir kural alanı gönderilmelidir.")
        for field_name in provided:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} null olamaz.")
        return self


def _public_rule(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "trigger_text": row.get("trigger_text"),
        "response_text": row.get("response_text"),
        "category": row.get("category"),
        "is_active": row.get("is_active") is True,
        "hit_count": int(row.get("hit_count") or 0),
        "version": int(row.get("version") or 1),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _map_db_failure(result: dict[str, Any], *, entity: str) -> dict[str, Any]:
    durum = result.get("durum")
    if durum == "bulunamadı":
        return _failure(f"seller_{entity}_not_found", "Kayıt bulunamadı.", kind="not_found")
    if durum == "conflict":
        return _failure(
            f"seller_{entity}_conflict",
            result.get("mesaj") or "Kayıt başka bir işlem tarafından değiştirildi.",
            kind="conflict",
        )
    if durum == "duplicate":
        return _failure(
            "seller_rule_duplicate",
            "Aynı tetikleyiciyle aktif bir kural zaten bulunuyor.",
            kind="conflict",
        )
    return _failure(
        f"seller_{entity}_unavailable",
        result.get("mesaj") or "İşlem şu anda tamamlanamıyor.",
        kind="unavailable",
    )


def get_settings(seller_id: int) -> dict[str, Any]:
    result = get_seller_settings_record(seller_id)
    if result.get("durum") != "başarılı":
        return _map_db_failure(result, entity="settings")
    seller = result["seller"]
    product_info = seller.get("product_info") or {}
    return {
        "ok": True,
        "settings": {
            "version": int(seller.get("settings_version") or 1),
            "updated_at": seller.get("updated_at"),
            "business": {
                "name": seller.get("name"),
                "phone": seller.get("phone"),
                "store_name": seller.get("store_name"),
                "store_link": seller.get("store_link"),
            },
            "product": product_info.get("product") or {},
            "order": product_info.get("order") or {},
            "usage": product_info.get("usage") or {},
            "shipping": product_info.get("shipping") or {},
            "return_policy": product_info.get("return") or {},
        },
    }


def _merge_section(product_info: dict[str, Any], key: str, patch: BaseModel | None) -> None:
    if patch is None or not patch.model_fields_set:
        return
    section = product_info.get(key)
    if not isinstance(section, dict):
        section = {}
    section = dict(section)
    section.update(patch.model_dump(exclude_unset=True))
    product_info[key] = section


def _validate_effective_product_info(product_info: dict[str, Any]) -> str | None:
    order = product_info.get("order") if isinstance(product_info.get("order"), dict) else {}
    product = product_info.get("product") if isinstance(product_info.get("product"), dict) else {}
    shipping = product_info.get("shipping") if isinstance(product_info.get("shipping"), dict) else {}
    returns = product_info.get("return") if isinstance(product_info.get("return"), dict) else {}

    minimum = order.get("min_quantity")
    maximum = order.get("max_quantity")
    if isinstance(minimum, int) and isinstance(maximum, int) and maximum < minimum:
        return "Maksimum sipariş adedi minimum sipariş adedinden küçük olamaz."

    if order.get("custom_text_required") is True and product.get("custom_text_max_length") is None:
        return "Özel yazı zorunluysa maksimum karakter sayısı belirtilmelidir."

    shipping_min = shipping.get("processing_days_min")
    shipping_max = shipping.get("processing_days_max")
    if isinstance(shipping_min, int) and isinstance(shipping_max, int) and shipping_max < shipping_min:
        return "Maksimum hazırlık süresi minimum hazırlık süresinden küçük olamaz."
    if shipping.get("same_day_available") is True and isinstance(shipping_min, int) and shipping_min > 0:
        return "Aynı gün gönderim varsa minimum hazırlık süresi 0 olmalıdır."

    accepts_returns = returns.get("accepts_returns")
    return_days = returns.get("return_period_days")
    if accepts_returns is True and (not isinstance(return_days, int) or return_days < 1):
        return "İade kabul ediliyorsa iade süresi en az 1 gün olmalıdır."
    if accepts_returns is False and return_days not in {None, 0}:
        return "İade kabul edilmiyorsa iade süresi boş veya 0 olmalıdır."

    return None


def update_settings(seller_id: int, request: SellerSettingsUpdateRequest) -> dict[str, Any]:
    current = get_seller_settings_record(seller_id)
    if current.get("durum") != "başarılı":
        return _map_db_failure(current, entity="settings")

    seller = current["seller"]
    current_version = int(seller.get("settings_version") or 1)
    if current_version != request.expected_version:
        return _failure(
            "seller_settings_conflict",
            "Ayarlar başka bir işlem tarafından değiştirildi. Sayfayı yenileyip tekrar deneyin.",
            kind="conflict",
        )

    seller_patch: dict[str, Any] = {}
    if request.business is not None:
        seller_patch.update(request.business.model_dump(exclude_unset=True))

    product_info = deepcopy(seller.get("product_info") or {})
    _merge_section(product_info, "product", request.product)
    _merge_section(product_info, "order", request.order)
    _merge_section(product_info, "usage", request.usage)
    _merge_section(product_info, "shipping", request.shipping)
    _merge_section(product_info, "return", request.return_policy)

    validation_error = _validate_effective_product_info(product_info)
    if validation_error:
        return _failure("seller_settings_validation_error", validation_error, kind="validation")

    result = update_seller_settings_record(
        seller_id,
        request.expected_version,
        seller_patch=seller_patch,
        product_info=product_info,
    )
    if result.get("durum") != "başarılı":
        return _map_db_failure(result, entity="settings")

    return get_settings(seller_id)


def list_rules(seller_id: int, *, active: bool | None = None) -> dict[str, Any]:
    result = list_seller_rule_records(seller_id, active=active)
    if result.get("durum") != "başarılı":
        return _map_db_failure(result, entity="rules")
    rows = result.get("rules") or []
    return {"ok": True, "rules": [_public_rule(row) for row in rows]}


def create_rule(seller_id: int, request: SellerRuleCreateRequest) -> dict[str, Any]:
    result = create_seller_rule_record(
        seller_id,
        trigger_text=request.trigger_text,
        response_text=request.response_text,
        category=request.category,
        is_active=request.is_active,
    )
    if result.get("durum") != "başarılı":
        return _map_db_failure(result, entity="rule")
    return {"ok": True, "rule": _public_rule(result["rule"])}


def update_rule(seller_id: int, rule_id: int, request: SellerRuleUpdateRequest) -> dict[str, Any]:
    patch = request.model_dump(exclude_unset=True)
    patch.pop("expected_version", None)
    result = update_seller_rule_record(
        seller_id,
        rule_id,
        request.expected_version,
        patch=patch,
    )
    if result.get("durum") != "başarılı":
        return _map_db_failure(result, entity="rule")
    return {"ok": True, "rule": _public_rule(result["rule"])}


def deactivate_rule(seller_id: int, rule_id: int, expected_version: int) -> dict[str, Any]:
    result = deactivate_seller_rule_record(seller_id, rule_id, expected_version)
    if result.get("durum") != "başarılı":
        return _map_db_failure(result, entity="rule")
    return {
        "ok": True,
        "changed": result.get("changed") is True,
        "rule": _public_rule(result["rule"]),
    }

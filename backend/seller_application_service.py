from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

from database import create_seller_application


_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_DIGITS_RE = re.compile(r"\D+")


class PublicSellerApplication(BaseModel):
    """Public marketing formundan kabul edilen seller başvuru sözleşmesi."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        populate_by_name=True,
    )

    full_name: str = Field(
        min_length=2,
        max_length=120,
        validation_alias=AliasChoices("full_name", "name"),
    )
    store_name: str = Field(
        min_length=2,
        max_length=120,
        validation_alias=AliasChoices("store_name", "storeName"),
    )
    phone: str = Field(min_length=7, max_length=32)
    email: str | None = Field(default=None, max_length=254)
    product_category: str | None = Field(
        default=None,
        max_length=160,
        validation_alias=AliasChoices("product_category", "category"),
    )
    notes: str | None = Field(
        default=None,
        max_length=800,
        validation_alias=AliasChoices("notes", "note"),
    )
    store_link: str | None = Field(
        default=None,
        max_length=2048,
        validation_alias=AliasChoices("store_link", "storeLink"),
    )

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        raw = value.strip()
        digits = _DIGITS_RE.sub("", raw)

        # Türkiye'deki marketing formu için yaygın 05xx / 5xx / 905xx girişlerini
        # aynı E.164 biçimine indirger. Zaten + ile verilen diğer uluslararası
        # numaralar da 7-15 hane sınırında korunur.
        if len(digits) == 11 and digits.startswith("0"):
            digits = "90" + digits[1:]
        elif len(digits) == 10:
            digits = "90" + digits

        if not 7 <= len(digits) <= 15:
            raise ValueError("Geçerli bir telefon numarası girilmelidir.")

        if raw.startswith("+") or digits.startswith("90"):
            return f"+{digits}"

        return f"+{digits}"

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if not normalized:
            return None
        if not _EMAIL_RE.fullmatch(normalized):
            raise ValueError("Geçerli bir e-posta adresi girilmelidir.")
        return normalized

    @field_validator("product_category", "notes")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("store_link")
    @classmethod
    def normalize_store_link(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            return None
        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Geçerli bir http veya https mağaza bağlantısı girilmelidir.")
        return normalized


def _failure(code: str, message: str, *, kind: str) -> dict[str, Any]:
    return {
        "ok": False,
        "kind": kind,
        "error": {"code": code, "message": message},
    }


def submit_public_seller_application(
    application: PublicSellerApplication,
) -> dict[str, Any]:
    """Başvuruyu kaydeder; duplicate bilgisini public yanıta sızdırmaz."""
    result = create_seller_application(
        full_name=application.full_name,
        email=application.email,
        phone=application.phone,
        store_name=application.store_name,
        store_link=application.store_link,
        notes=application.notes,
        product_category=application.product_category,
    )

    if result.get("durum") in {"başarılı", "duplicate"}:
        return {
            "ok": True,
            "received": True,
            "message": "Başvurunuz alındı. Uygunluk görüşmesi için WhatsApp üzerinden sizinle iletişime geçeceğiz.",
        }

    if result.get("durum") == "doğrulama_hatası":
        return _failure(
            "seller_application_validation_error",
            result.get("mesaj") or "Başvuru bilgileri geçersiz.",
            kind="validation",
        )

    return _failure(
        "seller_application_unavailable",
        "Başvurunuz şu anda alınamıyor. Lütfen daha sonra tekrar deneyin.",
        kind="unavailable",
    )

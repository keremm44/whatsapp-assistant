from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from database import (
    create_seller_product_record,
    list_seller_product_records,
    update_seller_product_record,
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class SellerProductCreateRequest(StrictModel):
    name: str = Field(min_length=2, max_length=200)


class SellerProductUpdateRequest(StrictModel):
    expected_version: int = Field(gt=0)
    name: str | None = Field(default=None, min_length=2, max_length=200)
    is_active: bool | None = None

    @model_validator(mode="after")
    def require_change(self) -> "SellerProductUpdateRequest":
        mutable = {"name", "is_active"}
        provided = mutable & self.model_fields_set
        if not provided:
            raise ValueError("En az bir ürün alanı gönderilmelidir.")
        for field_name in provided:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} null olamaz.")
        return self


def _failure(code: str, message: str, *, kind: str) -> dict[str, Any]:
    return {
        "ok": False,
        "error": {"code": code, "message": message},
        "kind": kind,
    }


def _public_product(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "is_active": row.get("is_active") is True,
        "version": int(row.get("version") or 1),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _map_db_failure(result: dict[str, Any]) -> dict[str, Any]:
    durum = result.get("durum")
    if durum == "bulunamadı":
        return _failure("seller_product_not_found", "Ürün bulunamadı.", kind="not_found")
    if durum == "doğrulama_hatası":
        return _failure(
            "seller_product_validation_error",
            result.get("mesaj") or "Ürün bilgileri geçersiz.",
            kind="validation",
        )
    if durum == "conflict":
        reason = result.get("reason")
        if reason == "duplicate_name":
            return _failure(
                "seller_product_duplicate_name",
                "Bu isimde bir ürün zaten bulunuyor.",
                kind="conflict",
            )
        return _failure(
            "seller_product_conflict",
            "Ürün başka bir işlem tarafından değiştirildi. Sayfayı yenileyip tekrar deneyin.",
            kind="conflict",
        )
    return _failure(
        "seller_product_unavailable",
        result.get("mesaj") or "Ürün işlemi şu anda tamamlanamıyor.",
        kind="unavailable",
    )


def list_products(seller_id: int, *, include_inactive: bool = False) -> dict[str, Any]:
    result = list_seller_product_records(seller_id, include_inactive=include_inactive)
    if result.get("durum") != "başarılı":
        return _map_db_failure(result)

    products = [_public_product(row) for row in result.get("products") or []]
    return {"ok": True, "products": products, "total": len(products)}


def create_product(
    seller_id: int,
    request: SellerProductCreateRequest,
) -> dict[str, Any]:
    result = create_seller_product_record(seller_id, name=request.name)
    if result.get("durum") != "başarılı":
        return _map_db_failure(result)
    return {
        "ok": True,
        "changed": result.get("changed") is True,
        "product": _public_product(result["product"]),
    }


def update_product(
    seller_id: int,
    product_id: int,
    request: SellerProductUpdateRequest,
) -> dict[str, Any]:
    result = update_seller_product_record(
        seller_id,
        product_id,
        request.expected_version,
        name=request.name if "name" in request.model_fields_set else None,
        is_active=(
            request.is_active if "is_active" in request.model_fields_set else None
        ),
    )
    if result.get("durum") != "başarılı":
        return _map_db_failure(result)
    return {
        "ok": True,
        "changed": result.get("changed") is True,
        "product": _public_product(result["product"]),
    }

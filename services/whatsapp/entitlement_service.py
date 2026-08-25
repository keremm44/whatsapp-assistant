from __future__ import annotations

import re
from typing import Any

from database import list_seller_entitlements


PRODUCT_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


def normalize_product_key(product_key: str) -> str:
    normalized = str(product_key or "").strip().lower()
    if not PRODUCT_KEY_PATTERN.fullmatch(normalized):
        raise ValueError("Geçersiz product_key.")
    return normalized


def list_active_seller_products(seller_id: int) -> dict[str, Any]:
    result = list_seller_entitlements(seller_id)
    if result.get("durum") != "başarılı":
        return result

    entitlements = result.get("entitlements")
    if not isinstance(entitlements, list):
        return {
            "durum": "hata",
            "mesaj": "Ürün yetkisi yanıtı geçersiz.",
            "products": [],
        }

    products = sorted(
        {
            str(row.get("product_key") or "").strip().lower()
            for row in entitlements
            if isinstance(row, dict)
            and row.get("status") == "active"
            and PRODUCT_KEY_PATTERN.fullmatch(
                str(row.get("product_key") or "").strip().lower()
            )
        }
    )
    return {
        "durum": "başarılı",
        "products": products,
    }


def seller_has_active_entitlement(
    seller_id: int,
    product_key: str,
) -> dict[str, Any]:
    try:
        normalized_product_key = normalize_product_key(product_key)
    except ValueError:
        return {
            "durum": "doğrulama_hatası",
            "mesaj": "Geçersiz product_key.",
            "active": False,
        }

    result = list_active_seller_products(seller_id)
    if result.get("durum") != "başarılı":
        return {
            **result,
            "active": False,
        }

    return {
        "durum": "başarılı",
        "active": normalized_product_key in result["products"],
    }

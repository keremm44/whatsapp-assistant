from __future__ import annotations

from typing import Callable

from fastapi import Depends, HTTPException, status

from auth_service import AuthContext, require_seller
from entitlement_service import normalize_product_key, seller_has_active_entitlement


def require_product_entitlement(product_key: str) -> Callable[[AuthContext], AuthContext]:
    """Require an active seller entitlement for one product engine."""
    normalized_product_key = normalize_product_key(product_key)

    def dependency(
        context: AuthContext = Depends(require_seller),
    ) -> AuthContext:
        if context.seller_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Satıcı işletme bağlantısı bulunamadı.",
            )

        result = seller_has_active_entitlement(
            context.seller_id,
            normalized_product_key,
        )
        if result.get("durum") != "başarılı":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Ürün yetkisi doğrulanamadı.",
            )
        if not result.get("active"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu ürün paketi hesabınızda aktif değil.",
            )

        return context

    return dependency


require_whatsapp_entitlement = require_product_entitlement("whatsapp")
require_trendyol_entitlement = require_product_entitlement("trendyol")

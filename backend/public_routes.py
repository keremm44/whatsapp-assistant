from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status

from seller_application_service import (
    PublicSellerApplication,
    submit_public_seller_application,
)


router = APIRouter(tags=["Public API"])


@router.post("/applications", status_code=status.HTTP_202_ACCEPTED)
def create_public_seller_application(
    body: PublicSellerApplication,
) -> dict[str, Any]:
    """Hesap açmadan satıcı uygunluk başvurusu alır."""
    result = submit_public_seller_application(body)

    if result.get("ok"):
        return {
            "received": True,
            "message": result["message"],
        }

    kind = result.get("kind")
    error = result.get("error") or {
        "code": "seller_application_unavailable",
        "message": "Başvurunuz şu anda alınamıyor.",
    }

    if kind == "validation":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=error,
        )

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=error,
    )

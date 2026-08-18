from __future__ import annotations

from typing import Any

from database import get_seller_action_counts


def _failure(code: str, message: str, *, kind: str) -> dict[str, Any]:
    return {
        "ok": False,
        "error": {"code": code, "message": message},
        "kind": kind,
    }


def _map_database_failure(result: dict[str, Any]) -> dict[str, Any]:
    durum = result.get("durum")
    if durum == "doğrulama_hatası":
        return _failure(
            "seller_sidebar_validation_error",
            result.get("mesaj") or "İstek parametreleri geçersiz.",
            kind="validation",
        )
    return _failure(
        "seller_sidebar_unavailable",
        "Sidebar özetine şu anda erişilemiyor.",
        kind="unavailable",
    )


def get_seller_sidebar_summary(seller_id: int) -> dict[str, Any]:
    """Seller sidebar için güvenilir action-count özetini döndürür.

    - Tek hafif seller-scoped read model.
    - Liste endpointlerini çağırıp saymaz; database katmanındaki
      üç hafif count sorgusunu kullanır.
    - Tenant isolation: seller_id yalnızca AuthContext'ten gelir.
    """
    result = get_seller_action_counts(seller_id)
    if result.get("durum") != "başarılı":
        return _map_database_failure(result)

    # Güvenli, negatif olmayan integer contract garantisi
    returns_action_required = result.get("returns_action_required")
    unanswered_open = result.get("unanswered_open")
    paused_or_taken_over = result.get("paused_or_taken_over")

    for value in (returns_action_required, unanswered_open, paused_or_taken_over):
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            return _failure(
                "seller_sidebar_unavailable",
                "Sidebar özetine şu anda erişilemiyor.",
                kind="unavailable",
            )

    return {
        "ok": True,
        "returns_action_required": returns_action_required,
        "unanswered_open": unanswered_open,
        "paused_or_taken_over": paused_or_taken_over,
    }

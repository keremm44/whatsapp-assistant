from __future__ import annotations

from typing import Any, Literal

from admin_seller_repository import (
    get_admin_seller_record,
    list_admin_seller_records,
)


AdminSellerSystemStatus = Literal[
    "onboarding",
    "admin_review_pending",
    "automatic_validation",
    "beta_active",
    "active",
    "suspended",
    "cancelled",
]

_ALLOWED_SYSTEM_STATUSES = {
    "onboarding",
    "admin_review_pending",
    "automatic_validation",
    "beta_active",
    "active",
    "suspended",
    "cancelled",
}


def _failure(code: str, message: str, *, kind: str) -> dict[str, Any]:
    return {
        "ok": False,
        "kind": kind,
        "error": {"code": code, "message": message},
    }


def _is_positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _is_optional_string(value: Any) -> bool:
    return value is None or isinstance(value, str)


def _is_nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value)


def _project_seller(row: Any, *, detail: bool) -> dict[str, Any] | None:
    if not isinstance(row, dict):
        return None
    if (
        not _is_positive_int(row.get("id"))
        or not _is_nonempty_string(row.get("name"))
        or not _is_nonempty_string(row.get("store_name"))
        or row.get("system_status") not in _ALLOWED_SYSTEM_STATUSES
        or not isinstance(row.get("onboarding_completed"), bool)
        or not isinstance(row.get("ai_enabled"), bool)
        or not _is_nonempty_string(row.get("created_at"))
        or not _is_nonempty_string(row.get("updated_at"))
    ):
        return None

    projected: dict[str, Any] = {
        "id": row["id"],
        "name": row["name"],
        "store_name": row["store_name"],
        "system_status": row["system_status"],
        "onboarding_completed": row["onboarding_completed"],
        "ai_enabled": row["ai_enabled"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }

    if detail:
        if not _is_optional_string(row.get("store_link")) or not _is_nonempty_string(
            row.get("onboarding_status")
        ):
            return None
        projected["store_link"] = row.get("store_link")
        projected["onboarding_status"] = row["onboarding_status"]

    return projected


def _map_repository_failure(result: dict[str, Any]) -> dict[str, Any]:
    if result.get("durum") == "bulunamadı":
        return _failure(
            "admin_seller_not_found",
            "Seller bulunamadı.",
            kind="not_found",
        )
    return _failure(
        "admin_seller_directory_unavailable",
        "Seller directory şu anda okunamıyor.",
        kind="unavailable",
    )


def list_admin_sellers(
    *,
    q: str | None = None,
    system_status: AdminSellerSystemStatus | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    normalized_q = " ".join((q or "").strip().split()) or None
    if normalized_q is not None and len(normalized_q) > 160:
        return _failure(
            "admin_seller_directory_validation_error",
            "Arama metni en fazla 160 karakter olabilir.",
            kind="validation",
        )
    if system_status is not None and system_status not in _ALLOWED_SYSTEM_STATUSES:
        return _failure(
            "admin_seller_directory_validation_error",
            "Geçersiz seller system_status değeri.",
            kind="validation",
        )
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 100:
        return _failure(
            "admin_seller_directory_validation_error",
            "limit 1 ile 100 arasında olmalıdır.",
            kind="validation",
        )
    if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0:
        return _failure(
            "admin_seller_directory_validation_error",
            "offset negatif olamaz.",
            kind="validation",
        )

    result = list_admin_seller_records(
        q=normalized_q,
        system_status=system_status,
        limit=limit,
        offset=offset,
    )
    if result.get("durum") != "başarılı":
        return _map_repository_failure(result)

    total = result.get("total")
    rows = result.get("sellers")
    if (
        not isinstance(total, int)
        or isinstance(total, bool)
        or total < 0
        or not isinstance(rows, list)
    ):
        return _map_repository_failure({"durum": "hata"})

    sellers = [_project_seller(row, detail=False) for row in rows]
    if any(seller is None for seller in sellers):
        return _map_repository_failure({"durum": "hata"})

    return {
        "ok": True,
        "total": total,
        "limit": limit,
        "offset": offset,
        "sellers": sellers,
    }


def get_admin_seller(seller_id: int) -> dict[str, Any]:
    if not _is_positive_int(seller_id):
        return _failure(
            "admin_seller_not_found",
            "Seller bulunamadı.",
            kind="not_found",
        )

    result = get_admin_seller_record(seller_id)
    if result.get("durum") != "başarılı":
        return _map_repository_failure(result)

    seller = _project_seller(result.get("seller"), detail=True)
    if seller is None:
        return _map_repository_failure({"durum": "hata"})

    return {"ok": True, "seller": seller}

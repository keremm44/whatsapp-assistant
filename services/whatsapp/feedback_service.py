from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from database import (
    create_seller_feedback_record,
    get_admin_feedback_record,
    get_seller_feedback_record,
    list_admin_feedback_records,
    list_seller_feedback_records,
    update_admin_feedback_record,
)


FeedbackCategory = Literal["suggestion", "problem", "complaint", "other"]
FeedbackStatus = Literal["OPEN", "IN_REVIEW", "RESOLVED"]

_FEEDBACK_CATEGORIES = {"suggestion", "problem", "complaint", "other"}
_FEEDBACK_STATUSES = {"OPEN", "IN_REVIEW", "RESOLVED"}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class SellerFeedbackCreateRequest(StrictModel):
    category: FeedbackCategory
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=4000)


class AdminFeedbackUpdateRequest(StrictModel):
    expected_version: int = Field(gt=0)
    status: FeedbackStatus | None = None
    admin_note: str | None = Field(default=None, min_length=1, max_length=4000)
    admin_reply: str | None = Field(default=None, min_length=1, max_length=4000)

    @model_validator(mode="after")
    def require_mutation(self) -> "AdminFeedbackUpdateRequest":
        mutable = {"status", "admin_note", "admin_reply"}
        provided = mutable & self.model_fields_set
        if not provided:
            raise ValueError("En az bir feedback alanı gönderilmelidir.")
        if "status" in provided and self.status is None:
            raise ValueError("status null olamaz.")
        return self


def _failure(code: str, message: str, *, kind: str) -> dict[str, Any]:
    return {
        "ok": False,
        "error": {"code": code, "message": message},
        "kind": kind,
    }


def _map_database_failure(result: dict[str, Any]) -> dict[str, Any]:
    durum = result.get("durum")
    if durum == "bulunamadı":
        return _failure(
            "feedback_not_found",
            "Feedback bulunamadı.",
            kind="not_found",
        )
    if durum == "doğrulama_hatası":
        return _failure(
            "feedback_validation_error",
            result.get("mesaj") or "Feedback bilgileri geçersiz.",
            kind="validation",
        )
    if durum == "conflict":
        conflict = _failure(
            "feedback_conflict",
            "Feedback başka bir işlem tarafından değiştirildi. Sayfayı yenileyip tekrar deneyin.",
            kind="conflict",
        )
        current_version = result.get("current_version")
        if (
            isinstance(current_version, int)
            and not isinstance(current_version, bool)
            and current_version > 0
        ):
            conflict["error"]["current_version"] = current_version
        return conflict
    return _failure(
        "feedback_unavailable",
        "Feedback işlemi şu anda tamamlanamıyor.",
        kind="unavailable",
    )


def _is_positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _is_string(value: Any, *, nullable: bool = False) -> bool:
    return (nullable and value is None) or isinstance(value, str)


def _is_nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value)


def _valid_feedback_row(row: Any, *, include_admin_note: bool) -> bool:
    if not isinstance(row, dict):
        return False
    status = row.get("status")
    resolved_at = row.get("resolved_at")
    if (
        not _is_positive_int(row.get("id"))
        or row.get("category") not in _FEEDBACK_CATEGORIES
        or not _is_nonempty_string(row.get("subject"))
        or not _is_nonempty_string(row.get("message"))
        or status not in _FEEDBACK_STATUSES
        or not _is_positive_int(row.get("version"))
        or not _is_nonempty_string(row.get("created_at"))
        or not _is_nonempty_string(row.get("updated_at"))
        or (resolved_at is not None and not _is_nonempty_string(resolved_at))
        or (status == "RESOLVED") != (resolved_at is not None)
    ):
        return False
    admin_note = row.get("admin_note")
    admin_reply = row.get("admin_reply")
    admin_replied_at = row.get("admin_replied_at")
    if (
        admin_reply is not None and not _is_nonempty_string(admin_reply)
    ) or (
        admin_replied_at is not None and not _is_nonempty_string(admin_replied_at)
    ) or ((admin_reply is None) != (admin_replied_at is None)):
        return False
    return (
        (not include_admin_note or admin_note is None or _is_nonempty_string(admin_note))
    )


def _seller_feedback(row: Any) -> dict[str, Any] | None:
    """Seller sözleşmesinden tenant ve admin-internal alanlarını çıkarır."""
    if not _valid_feedback_row(row, include_admin_note=False):
        return None
    return {
        "id": row["id"],
        "category": row["category"],
        "subject": row["subject"],
        "message": row["message"],
        "admin_reply": row["admin_reply"],
        "admin_replied_at": row["admin_replied_at"],
        "status": row["status"],
        "version": row["version"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "resolved_at": row["resolved_at"],
    }


def _safe_seller_summary(row: Any) -> dict[str, Any] | None:
    if not isinstance(row, dict):
        return None
    seller_id = row.get("id")
    name = row.get("name")
    store_name = row.get("store_name")
    if (
        not _is_positive_int(seller_id)
        or not _is_string(name, nullable=True)
        or not _is_string(store_name, nullable=True)
    ):
        return None
    return {"id": seller_id, "name": name, "store_name": store_name}


def _admin_feedback(row: Any) -> dict[str, Any] | None:
    """Admin için yalnız workflow ve güvenli seller/store kimliği döndürür."""
    if not _valid_feedback_row(row, include_admin_note=True):
        return None
    seller = _safe_seller_summary(row.get("seller"))
    if seller is None:
        return None
    return {
        "id": row["id"],
        "seller": seller,
        "category": row["category"],
        "subject": row["subject"],
        "message": row["message"],
        "admin_reply": row["admin_reply"],
        "admin_replied_at": row["admin_replied_at"],
        "status": row["status"],
        "admin_note": row["admin_note"],
        "version": row["version"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "resolved_at": row["resolved_at"],
    }


def submit_feedback(
    seller_id: int,
    request: SellerFeedbackCreateRequest,
) -> dict[str, Any]:
    result = create_seller_feedback_record(
        seller_id,
        category=request.category,
        subject=request.subject,
        message=request.message,
    )
    if result.get("durum") != "başarılı":
        return _map_database_failure(result)
    feedback = _seller_feedback(result.get("feedback"))
    if feedback is None:
        return _map_database_failure({"durum": "hata"})
    return {"ok": True, "feedback": feedback}


def list_seller_feedback(
    seller_id: int,
    *,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    result = list_seller_feedback_records(seller_id, limit=limit, offset=offset)
    if result.get("durum") != "başarılı":
        return _map_database_failure(result)
    total = result.get("total")
    rows = result.get("feedback")
    if (
        not isinstance(total, int)
        or isinstance(total, bool)
        or total < 0
        or not isinstance(rows, list)
    ):
        return _map_database_failure({"durum": "hata"})
    feedback = [_seller_feedback(row) for row in rows]
    if any(item is None for item in feedback):
        return _map_database_failure({"durum": "hata"})
    return {
        "ok": True,
        "total": total,
        "limit": limit,
        "offset": offset,
        "feedback": feedback,
    }


def get_seller_feedback(seller_id: int, feedback_id: int) -> dict[str, Any]:
    result = get_seller_feedback_record(seller_id, feedback_id)
    if result.get("durum") != "başarılı":
        return _map_database_failure(result)
    feedback = _seller_feedback(result.get("feedback"))
    if feedback is None:
        return _map_database_failure({"durum": "hata"})
    return {"ok": True, "feedback": feedback}


def list_admin_feedback(
    *,
    status: FeedbackStatus | None = None,
    category: FeedbackCategory | None = None,
    seller_id: int | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    result = list_admin_feedback_records(
        status=status,
        category=category,
        seller_id=seller_id,
        limit=limit,
        offset=offset,
    )
    if result.get("durum") != "başarılı":
        return _map_database_failure(result)
    total = result.get("total")
    rows = result.get("feedback")
    if (
        not isinstance(total, int)
        or isinstance(total, bool)
        or total < 0
        or not isinstance(rows, list)
    ):
        return _map_database_failure({"durum": "hata"})
    feedback = [_admin_feedback(row) for row in rows]
    if any(item is None for item in feedback):
        return _map_database_failure({"durum": "hata"})
    return {
        "ok": True,
        "total": total,
        "limit": limit,
        "offset": offset,
        "feedback": feedback,
    }


def get_admin_feedback(feedback_id: int) -> dict[str, Any]:
    result = get_admin_feedback_record(feedback_id)
    if result.get("durum") != "başarılı":
        return _map_database_failure(result)
    feedback = _admin_feedback(result.get("feedback"))
    if feedback is None:
        return _map_database_failure({"durum": "hata"})
    return {"ok": True, "feedback": feedback}


def update_admin_feedback(
    feedback_id: int,
    request: AdminFeedbackUpdateRequest,
) -> dict[str, Any]:
    update_status = "status" in request.model_fields_set
    update_admin_note = "admin_note" in request.model_fields_set
    update_admin_reply = "admin_reply" in request.model_fields_set
    result = update_admin_feedback_record(
        feedback_id,
        request.expected_version,
        status=request.status,
        admin_note=request.admin_note,
        update_status=update_status,
        update_admin_note=update_admin_note,
        update_admin_reply=update_admin_reply,
        admin_reply=request.admin_reply,
    )
    if result.get("durum") != "başarılı":
        return _map_database_failure(result)
    feedback = _admin_feedback(result.get("feedback"))
    if feedback is None or not isinstance(result.get("changed"), bool):
        return _map_database_failure({"durum": "hata"})
    return {
        "ok": True,
        "changed": result["changed"],
        "feedback": feedback,
    }

from __future__ import annotations

from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, model_validator

from database import (
    create_announcement_record,
    get_admin_announcement_record,
    get_seller_announcement_record,
    list_admin_announcement_records,
    list_seller_announcement_records,
    get_seller_announcement_unread_count_record,
    mark_seller_announcement_read_record,
)


AudienceType = Literal["ALL_SELLERS", "SELECTED_SELLERS"]
ImportanceType = Literal["NORMAL", "IMPORTANT"]
StrictSellerId = Annotated[int, Field(strict=True, gt=0)]


class AnnouncementAudience(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: AudienceType
    seller_ids: list[StrictSellerId] | None = None

    @model_validator(mode="after")
    def validate_audience(self) -> "AnnouncementAudience":
        seller_ids = self.seller_ids
        if self.type == "ALL_SELLERS":
            if seller_ids:
                raise ValueError("ALL_SELLERS kitlesinde seller_ids gönderilemez.")
            self.seller_ids = None
            return self

        if not seller_ids:
            raise ValueError(
                "SELECTED_SELLERS kitlesinde en az bir seller_id zorunludur."
            )
        if len(seller_ids) != len(set(seller_ids)):
            raise ValueError("seller_ids yinelenen kimlik içeremez.")
        return self


class AdminAnnouncementCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=4000)
    importance: ImportanceType = "NORMAL"
    image_url: str | None = Field(default=None, max_length=2048)
    audience: AnnouncementAudience

    @model_validator(mode="after")
    def validate_image_url(self) -> "AdminAnnouncementCreateRequest":
        if self.image_url is None:
            return self
        parsed = urlsplit(self.image_url)
        if (
            parsed.scheme.lower() != "https"
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
        ):
            raise ValueError("image_url geçerli bir HTTPS URL olmalıdır.")
        return self


def _failure(code: str, message: str, *, kind: str) -> dict[str, Any]:
    return {
        "ok": False,
        "kind": kind,
        "error": {"code": code, "message": message},
    }


def _is_positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _is_nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value)


def _is_optional_url(value: Any) -> bool:
    if value is None:
        return True
    if not isinstance(value, str) or not value:
        return False
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
    except ValueError:
        return False
    return (
        parsed.scheme.lower() == "https"
        and bool(hostname)
        and parsed.username is None
        and parsed.password is None
    )


def _is_optional_string(value: Any) -> bool:
    return value is None or isinstance(value, str)


def _project_seller_summary(value: Any) -> dict[str, Any] | None:
    if (
        not isinstance(value, dict)
        or not _is_positive_int(value.get("id"))
        or not _is_optional_string(value.get("name"))
        or not _is_optional_string(value.get("store_name"))
    ):
        return None
    return {
        "id": value["id"],
        "name": value.get("name"),
        "store_name": value.get("store_name"),
    }


def _project_admin_announcement(
    value: Any,
    *,
    include_targets: bool,
) -> dict[str, Any] | None:
    if not isinstance(value, dict) or not _is_positive_int(value.get("id")):
        return None
    if value.get("audience_type") not in {"ALL_SELLERS", "SELECTED_SELLERS"}:
        return None
    if (
        value.get("importance") not in {"NORMAL", "IMPORTANT"}
        or not _is_optional_url(value.get("image_url"))
    ):
        return None
    if not _is_nonempty_string(value.get("title")) or not _is_nonempty_string(
        value.get("message")
    ):
        return None
    if (
        not _is_positive_int(value.get("created_by_profile_id"))
        or not _is_nonempty_string(value.get("published_at"))
        or not _is_nonempty_string(value.get("created_at"))
    ):
        return None
    target_count = value.get("target_count")
    read_count = value.get("read_count")
    if (
        not isinstance(target_count, int)
        or isinstance(target_count, bool)
        or target_count < 0
        or not isinstance(read_count, int)
        or isinstance(read_count, bool)
        or read_count < 0
        or read_count > target_count
    ):
        return None

    projected = {
        "id": value["id"],
        "title": value["title"],
        "message": value["message"],
        "audience_type": value["audience_type"],
        "importance": value["importance"],
        "image_url": value.get("image_url"),
        "created_by_profile_id": value["created_by_profile_id"],
        "target_count": target_count,
        "read_count": read_count,
        "published_at": value.get("published_at"),
        "created_at": value.get("created_at"),
    }
    if include_targets:
        raw_targets = value.get("targets")
        if not isinstance(raw_targets, list):
            return None
        targets: list[dict[str, Any]] = []
        for raw_target in raw_targets:
            if not isinstance(raw_target, dict):
                return None
            seller = _project_seller_summary(raw_target.get("seller"))
            read_at = raw_target.get("read_at")
            if seller is None or (
                read_at is not None and not _is_nonempty_string(read_at)
            ):
                return None
            targets.append({"seller": seller, "read_at": read_at})
        if target_count != len(targets) or read_count != sum(
            target["read_at"] is not None for target in targets
        ):
            return None
        projected["targets"] = targets
    return projected


def _project_seller_announcement(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict) or not _is_positive_int(value.get("id")):
        return None
    if value.get("audience_type") not in {"ALL_SELLERS", "SELECTED_SELLERS"}:
        return None
    if (
        value.get("importance") not in {"NORMAL", "IMPORTANT"}
        or not _is_optional_url(value.get("image_url"))
    ):
        return None
    if not _is_nonempty_string(value.get("title")) or not _is_nonempty_string(
        value.get("message")
    ):
        return None
    is_read = value.get("is_read")
    read_at = value.get("read_at")
    if (
        not isinstance(is_read, bool)
        or (read_at is not None and not _is_nonempty_string(read_at))
        or is_read != (read_at is not None)
        or not _is_nonempty_string(value.get("published_at"))
        or not _is_nonempty_string(value.get("created_at"))
    ):
        return None
    return {
        "id": value["id"],
        "title": value["title"],
        "message": value["message"],
        "audience_type": value["audience_type"],
        "importance": value["importance"],
        "image_url": value.get("image_url"),
        "is_read": is_read,
        "read_at": read_at,
        "published_at": value["published_at"],
        "created_at": value["created_at"],
    }


def _map_failure(result: dict[str, Any]) -> dict[str, Any]:
    durum = result.get("durum")
    if durum == "bulunamadı":
        return _failure(
            "announcement_not_found",
            "Duyuru bulunamadı.",
            kind="not_found",
        )
    if durum == "doğrulama_hatası":
        return _failure(
            "announcement_validation_error",
            result.get("mesaj") or "Duyuru bilgileri geçersiz.",
            kind="validation",
        )
    return _failure(
        "announcement_unavailable",
        "Duyuru işlemi şu anda tamamlanamıyor.",
        kind="unavailable",
    )


def create_announcement(
    creator_profile_id: int,
    request: AdminAnnouncementCreateRequest,
) -> dict[str, Any]:
    if not _is_positive_int(creator_profile_id):
        return _failure(
            "announcement_validation_error",
            "creator_profile_id pozitif tam sayı olmalıdır.",
            kind="validation",
        )

    result = create_announcement_record(
        creator_profile_id,
        title=request.title,
        message=request.message,
        importance=request.importance,
        image_url=request.image_url,
        audience_type=request.audience.type,
        seller_ids=request.audience.seller_ids,
    )
    if result.get("durum") != "başarılı":
        return _map_failure(result)

    announcement = _project_admin_announcement(
        result.get("announcement"),
        include_targets=False,
    )
    if announcement is None:
        return _map_failure({"durum": "hata"})
    return {"ok": True, "announcement": announcement}


def list_admin_announcements(*, limit: int = 20, offset: int = 0) -> dict[str, Any]:
    result = list_admin_announcement_records(limit=limit, offset=offset)
    if result.get("durum") != "başarılı":
        return _map_failure(result)

    total = result.get("total")
    raw_items = result.get("announcements")
    if (
        not isinstance(total, int)
        or isinstance(total, bool)
        or total < 0
        or not isinstance(raw_items, list)
    ):
        return _map_failure({"durum": "hata"})
    items = [
        _project_admin_announcement(item, include_targets=False) for item in raw_items
    ]
    if any(item is None for item in items):
        return _map_failure({"durum": "hata"})
    return {
        "ok": True,
        "total": total,
        "limit": limit,
        "offset": offset,
        "announcements": items,
    }


def get_admin_announcement(announcement_id: int) -> dict[str, Any]:
    if not _is_positive_int(announcement_id):
        return _map_failure({"durum": "bulunamadı"})
    result = get_admin_announcement_record(announcement_id)
    if result.get("durum") != "başarılı":
        return _map_failure(result)
    announcement = _project_admin_announcement(
        result.get("announcement"),
        include_targets=True,
    )
    if announcement is None:
        return _map_failure({"durum": "hata"})
    return {"ok": True, "announcement": announcement}


def list_seller_announcements(
    seller_id: int,
    *,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    result = list_seller_announcement_records(
        seller_id,
        limit=limit,
        offset=offset,
    )
    if result.get("durum") != "başarılı":
        return _map_failure(result)

    total = result.get("total")
    raw_items = result.get("announcements")
    if (
        not isinstance(total, int)
        or isinstance(total, bool)
        or total < 0
        or not isinstance(raw_items, list)
    ):
        return _map_failure({"durum": "hata"})
    unread_count = result.get("unread_count")
    if (
        not isinstance(unread_count, int)
        or isinstance(unread_count, bool)
        or unread_count < 0
    ):
        return _map_failure({"durum": "hata"})
    items = [_project_seller_announcement(item) for item in raw_items]
    if any(item is None for item in items):
        return _map_failure({"durum": "hata"})
    return {
        "ok": True,
        "total": total,
        "limit": limit,
        "offset": offset,
        "announcements": items,
        "unread_count": unread_count,
    }


def get_seller_announcement(
    seller_id: int,
    announcement_id: int,
) -> dict[str, Any]:
    if not _is_positive_int(announcement_id):
        return _map_failure({"durum": "bulunamadı"})
    result = get_seller_announcement_record(seller_id, announcement_id)
    if result.get("durum") != "başarılı":
        return _map_failure(result)
    announcement = _project_seller_announcement(result.get("announcement"))
    if announcement is None:
        return _map_failure({"durum": "hata"})
    return {"ok": True, "announcement": announcement}


def mark_seller_announcement_read(
    seller_id: int,
    announcement_id: int,
) -> dict[str, Any]:
    if not _is_positive_int(announcement_id):
        return _map_failure({"durum": "bulunamadı"})
    result = mark_seller_announcement_read_record(seller_id, announcement_id)
    if result.get("durum") != "başarılı":
        return _map_failure(result)

    if (
        result.get("announcement_id") != announcement_id
        or result.get("is_read") is not True
        or not isinstance(result.get("changed"), bool)
        or not _is_nonempty_string(result.get("read_at"))
    ):
        return _map_failure({"durum": "hata"})
    unread_count = result.get("unread_count")
    if (
        not isinstance(unread_count, int)
        or isinstance(unread_count, bool)
        or unread_count < 0
    ):
        return _map_failure({"durum": "hata"})
    return {
        "ok": True,
        "announcement_id": announcement_id,
        "is_read": True,
        "read_at": result["read_at"],
        "changed": result["changed"],
        "unread_count": unread_count,
    }


def get_seller_announcement_unread_count(seller_id: int) -> dict[str, Any]:
    if not _is_positive_int(seller_id):
        return _map_failure({"durum": "bulunamadı"})
    result = get_seller_announcement_unread_count_record(seller_id)
    if result.get("durum") != "başarılı":
        return _map_failure(result)
    unread_count = result.get("unread_count")
    if (
        not isinstance(unread_count, int)
        or isinstance(unread_count, bool)
        or unread_count < 0
    ):
        return _map_failure({"durum": "hata"})
    return {"ok": True, "unread_count": unread_count}

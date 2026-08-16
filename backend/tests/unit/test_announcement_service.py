from __future__ import annotations

import pytest
from pydantic import ValidationError

import announcement_service
from announcement_service import (
    AdminAnnouncementCreateRequest,
    create_announcement,
    get_seller_announcement,
    list_admin_announcements,
    list_seller_announcements,
    mark_seller_announcement_read,
)


ADMIN_ANNOUNCEMENT = {
    "id": 8,
    "title": "Planlı bakım",
    "message": "Pazar günü bakım yapılacaktır.",
    "audience_type": "ALL_SELLERS",
    "created_by_profile_id": 3,
    "target_count": 12,
    "read_count": 4,
    "published_at": "2026-08-16T10:00:00+00:00",
    "created_at": "2026-08-16T10:00:00+00:00",
}

SELLER_ANNOUNCEMENT = {
    "id": 8,
    "title": "Planlı bakım",
    "message": "Pazar günü bakım yapılacaktır.",
    "audience_type": "ALL_SELLERS",
    "is_read": False,
    "read_at": None,
    "published_at": "2026-08-16T10:00:00+00:00",
    "created_at": "2026-08-16T10:00:00+00:00",
}


def test_audience_validation_all_does_not_require_seller_ids() -> None:
    request = AdminAnnouncementCreateRequest.model_validate(
        {
            "title": " Duyuru ",
            "message": " İçerik ",
            "audience": {"type": "ALL_SELLERS"},
        }
    )

    assert request.title == "Duyuru"
    assert request.audience.seller_ids is None


@pytest.mark.parametrize(
    "audience",
    [
        {"type": "SELECTED_SELLERS"},
        {"type": "SELECTED_SELLERS", "seller_ids": []},
        {"type": "SELECTED_SELLERS", "seller_ids": [42, 42]},
        {"type": "ALL_SELLERS", "seller_ids": [42]},
    ],
)
def test_audience_validation_rejects_ambiguous_or_duplicate_targets(audience) -> None:
    with pytest.raises(ValidationError):
        AdminAnnouncementCreateRequest.model_validate(
            {"title": "Duyuru", "message": "İçerik", "audience": audience}
        )


def test_create_selected_announcement_passes_validated_targets(monkeypatch) -> None:
    captured = {}

    def fake_create(profile_id, **kwargs):
        captured.update(profile_id=profile_id, **kwargs)
        return {
            "durum": "başarılı",
            "announcement": ADMIN_ANNOUNCEMENT
            | {"audience_type": "SELECTED_SELLERS", "target_count": 2, "read_count": 0},
        }

    monkeypatch.setattr(announcement_service, "create_announcement_record", fake_create)
    request = AdminAnnouncementCreateRequest.model_validate(
        {
            "title": "Planlı bakım",
            "message": "Pazar günü bakım yapılacaktır.",
            "audience": {"type": "SELECTED_SELLERS", "seller_ids": [42, 51]},
        }
    )

    result = create_announcement(3, request)

    assert result["ok"] is True
    assert captured["profile_id"] == 3
    assert captured["audience_type"] == "SELECTED_SELLERS"
    assert captured["seller_ids"] == [42, 51]


def test_create_maps_unknown_selected_seller_to_validation(monkeypatch) -> None:
    monkeypatch.setattr(
        announcement_service,
        "create_announcement_record",
        lambda *args, **kwargs: {
            "durum": "doğrulama_hatası",
            "mesaj": "Seçili seller kimliklerinden biri bulunamadı.",
        },
    )
    request = AdminAnnouncementCreateRequest.model_validate(
        {
            "title": "Duyuru",
            "message": "İçerik",
            "audience": {"type": "SELECTED_SELLERS", "seller_ids": [999]},
        }
    )

    result = create_announcement(3, request)

    assert result["ok"] is False
    assert result["kind"] == "validation"


def test_admin_list_returns_counts_with_deterministic_pagination(monkeypatch) -> None:
    monkeypatch.setattr(
        announcement_service,
        "list_admin_announcement_records",
        lambda **kwargs: {
            "durum": "başarılı",
            "total": 1,
            "announcements": [ADMIN_ANNOUNCEMENT],
        },
    )

    result = list_admin_announcements(limit=10, offset=20)

    assert result["ok"] is True
    assert result["limit"] == 10
    assert result["offset"] == 20
    assert result["announcements"][0]["target_count"] == 12
    assert result["announcements"][0]["read_count"] == 4


def test_seller_list_projects_only_seller_safe_fields(monkeypatch) -> None:
    monkeypatch.setattr(
        announcement_service,
        "list_seller_announcement_records",
        lambda seller_id, **kwargs: {
            "durum": "başarılı",
            "total": 1,
            "announcements": [
                SELLER_ANNOUNCEMENT
                | {"created_by_profile_id": 3, "target_count": 12, "secret": "no"}
            ],
        },
    )

    result = list_seller_announcements(42)

    item = result["announcements"][0]
    assert result["ok"] is True
    assert item["is_read"] is False
    assert "created_by_profile_id" not in item
    assert "target_count" not in item
    assert "secret" not in item


def test_seller_detail_keeps_other_tenant_announcement_invisible(monkeypatch) -> None:
    captured = {}

    def fake_get(seller_id, announcement_id):
        captured.update(seller_id=seller_id, announcement_id=announcement_id)
        return {"durum": "bulunamadı"}

    monkeypatch.setattr(announcement_service, "get_seller_announcement_record", fake_get)

    result = get_seller_announcement(42, 99)

    assert captured == {"seller_id": 42, "announcement_id": 99}
    assert result["kind"] == "not_found"


def test_mark_read_preserves_first_write_and_repeat_semantics(monkeypatch) -> None:
    calls = iter([True, False])

    def fake_mark(seller_id, announcement_id):
        return {
            "durum": "başarılı",
            "announcement_id": announcement_id,
            "is_read": True,
            "read_at": "2026-08-16T12:00:00+00:00",
            "changed": next(calls),
        }

    monkeypatch.setattr(
        announcement_service,
        "mark_seller_announcement_read_record",
        fake_mark,
    )

    first = mark_seller_announcement_read(42, 8)
    repeated = mark_seller_announcement_read(42, 8)

    assert first["changed"] is True
    assert repeated["changed"] is False
    assert first["read_at"] == repeated["read_at"]


def test_malformed_database_response_maps_to_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(
        announcement_service,
        "list_seller_announcement_records",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "total": "1",
            "announcements": [SELLER_ANNOUNCEMENT],
        },
    )

    result = list_seller_announcements(42)

    assert result["ok"] is False
    assert result["kind"] == "unavailable"


def test_malformed_successful_announcement_row_maps_to_unavailable(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        announcement_service,
        "list_seller_announcement_records",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "total": 1,
            "announcements": [SELLER_ANNOUNCEMENT | {"is_read": "false"}],
        },
    )

    result = list_seller_announcements(42)

    assert result["ok"] is False
    assert result["kind"] == "unavailable"

from __future__ import annotations

import pytest
from pydantic import ValidationError

import feedback_service as service


SELLER_FEEDBACK = {
    "id": 3,
    "category": "problem",
    "subject": "Konu",
    "message": "Mesaj",
    "status": "OPEN",
    "version": 1,
    "created_at": "2026-08-16T10:00:00+00:00",
    "updated_at": "2026-08-16T10:00:00+00:00",
    "resolved_at": None,
    "admin_reply": None,
    "admin_replied_at": None,
}

ADMIN_FEEDBACK = SELLER_FEEDBACK | {
    "seller": {"id": 42, "name": "Ada", "store_name": "Ada Store"},
    "admin_note": None,
    "admin_reply": None,
    "admin_replied_at": None,
}


def test_seller_create_request_trims_and_validates_category() -> None:
    request = service.SellerFeedbackCreateRequest(
        category="problem",
        subject="  Sipariş akışı  ",
        message="  Alan kaydedilmiyor.  ",
    )
    assert request.subject == "Sipariş akışı"
    assert request.message == "Alan kaydedilmiyor."

    with pytest.raises(ValidationError):
        service.SellerFeedbackCreateRequest(
            category="bug",
            subject="Konu",
            message="Mesaj",
        )


@pytest.mark.parametrize("field", ["subject", "message"])
def test_seller_create_request_rejects_empty_trimmed_content(field: str) -> None:
    payload = {"category": "other", "subject": "Konu", "message": "Mesaj"}
    payload[field] = "   "
    with pytest.raises(ValidationError):
        service.SellerFeedbackCreateRequest(**payload)


def test_submit_feedback_passes_authenticated_seller_and_public_fields(monkeypatch) -> None:
    captured = {}

    def fake_create(seller_id, *, category, subject, message):
        captured.update(
            seller_id=seller_id,
            category=category,
            subject=subject,
            message=message,
        )
        return {
            "durum": "başarılı",
            "feedback": {
                "id": 9,
                "seller_id": 42,
                "category": "problem",
                "subject": "Konu",
                "message": "Mesaj",
                "status": "OPEN",
                "admin_note": "internal",
                "admin_reply": None,
                "admin_replied_at": None,
                "version": 1,
                "created_at": "c",
                "updated_at": "u",
                "resolved_at": None,
            },
        }

    monkeypatch.setattr(service, "create_seller_feedback_record", fake_create)
    request = service.SellerFeedbackCreateRequest(
        category="problem", subject="Konu", message="Mesaj"
    )

    result = service.submit_feedback(42, request)

    assert result["ok"] is True
    assert captured["seller_id"] == 42
    assert "seller_id" not in result["feedback"]
    assert "admin_note" not in result["feedback"]
    assert result["feedback"]["status"] == "OPEN"


def test_seller_list_is_scoped_and_preserves_pagination(monkeypatch) -> None:
    captured = {}

    def fake_list(seller_id, *, limit, offset):
        captured.update(seller_id=seller_id, limit=limit, offset=offset)
        return {"durum": "başarılı", "total": 1, "feedback": [SELLER_FEEDBACK]}

    monkeypatch.setattr(service, "list_seller_feedback_records", fake_list)

    result = service.list_seller_feedback(42, limit=10, offset=20)

    assert result["ok"] is True
    assert captured == {"seller_id": 42, "limit": 10, "offset": 20}
    assert result["total"] == 1
    assert result["limit"] == 10
    assert result["offset"] == 20


def test_seller_detail_maps_tenant_invisible_record_to_not_found(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "get_seller_feedback_record",
        lambda seller_id, feedback_id: {"durum": "bulunamadı"},
    )

    result = service.get_seller_feedback(42, 999)

    assert result["ok"] is False
    assert result["kind"] == "not_found"
    assert result["error"]["code"] == "feedback_not_found"


def test_admin_list_passes_all_filters_and_exposes_safe_seller(monkeypatch) -> None:
    captured = {}

    def fake_list(**kwargs):
        captured.update(kwargs)
        return {
            "durum": "başarılı",
            "total": 1,
            "feedback": [
                ADMIN_FEEDBACK
                | {
                    "id": 4,
                    "seller": ADMIN_FEEDBACK["seller"]
                    | {"email": "private@example.com"},
                    "status": "IN_REVIEW",
                    "category": "complaint",
                    "admin_note": "Bakılıyor",
                }
            ],
        }

    monkeypatch.setattr(service, "list_admin_feedback_records", fake_list)

    result = service.list_admin_feedback(
        status="IN_REVIEW",
        category="complaint",
        seller_id=42,
        limit=15,
        offset=5,
    )

    assert result["ok"] is True
    assert captured == {
        "status": "IN_REVIEW",
        "category": "complaint",
        "seller_id": 42,
        "limit": 15,
        "offset": 5,
    }
    assert result["feedback"][0]["seller"] == {
        "id": 42,
        "name": "Ada",
        "store_name": "Ada Store",
    }


def test_admin_update_passes_only_provided_fields_and_resolved_result(monkeypatch) -> None:
    captured = {}

    def fake_update(feedback_id, expected_version, **kwargs):
        captured.update(
            feedback_id=feedback_id,
            expected_version=expected_version,
            **kwargs,
        )
        return {
            "durum": "başarılı",
            "changed": True,
            "feedback": ADMIN_FEEDBACK
            | {
                "id": feedback_id,
                "status": "RESOLVED",
                "admin_note": None,
    "admin_reply": None,
    "admin_replied_at": None,
                "version": 4,
                "resolved_at": "2026-08-16T10:00:00+00:00",
            },
        }

    monkeypatch.setattr(service, "update_admin_feedback_record", fake_update)
    request = service.AdminFeedbackUpdateRequest(
        expected_version=3,
        status="RESOLVED",
    )

    result = service.update_admin_feedback(8, request)

    assert result["ok"] is True
    assert result["feedback"]["status"] == "RESOLVED"
    assert result["feedback"]["seller"] == ADMIN_FEEDBACK["seller"]
    assert result["feedback"]["resolved_at"] is not None
    assert captured["update_status"] is True
    assert captured["update_admin_note"] is False
    assert captured["update_admin_reply"] is False
    assert captured["expected_version"] == 3


def test_stale_admin_update_maps_to_conflict(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "update_admin_feedback_record",
        lambda *args, **kwargs: {
            "durum": "conflict",
            "reason": "stale_version",
            "current_version": 4,
        },
    )

    result = service.update_admin_feedback(
        8,
        service.AdminFeedbackUpdateRequest(
            expected_version=3,
            status="IN_REVIEW",
        ),
    )

    assert result["ok"] is False
    assert result["kind"] == "conflict"
    assert result["error"]["code"] == "feedback_conflict"
    assert result["error"]["current_version"] == 4


def test_malformed_database_payload_maps_to_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "list_seller_feedback_records",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "total": "1",
            "feedback": "not-a-list",
        },
    )

    result = service.list_seller_feedback(42)

    assert result["ok"] is False
    assert result["kind"] == "unavailable"


def test_malformed_successful_feedback_row_maps_to_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "list_seller_feedback_records",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "total": 1,
            "feedback": [SELLER_FEEDBACK | {"version": "1"}],
        },
    )

    result = service.list_seller_feedback(42)

    assert result["ok"] is False
    assert result["kind"] == "unavailable"


def test_admin_update_requires_mutable_field_and_rejects_null_status() -> None:
    with pytest.raises(ValidationError):
        service.AdminFeedbackUpdateRequest(expected_version=1)
    with pytest.raises(ValidationError):
        service.AdminFeedbackUpdateRequest(expected_version=1, status=None)


def test_admin_update_accepts_separate_seller_reply(monkeypatch) -> None:
    captured = {}

    def fake_update(feedback_id, expected_version, **kwargs):
        captured.update(kwargs)
        return {
            "durum": "başarılı",
            "changed": True,
            "feedback": ADMIN_FEEDBACK | {
                "admin_note": "İç not",
                "admin_reply": "Sorununuz çözüldü.",
                "admin_replied_at": "2026-08-21T10:00:00+00:00",
                "status": "RESOLVED",
                "resolved_at": "2026-08-21T10:00:00+00:00",
            },
        }

    monkeypatch.setattr(service, "update_admin_feedback_record", fake_update)
    result = service.update_admin_feedback(8, service.AdminFeedbackUpdateRequest(
        expected_version=3, status="RESOLVED", admin_note="İç not",
        admin_reply="  Sorununuz çözüldü.  ",
    ))

    assert result["ok"] is True
    assert result["feedback"]["admin_note"] == "İç not"
    assert result["feedback"]["admin_reply"] == "Sorununuz çözüldü."
    assert captured["update_admin_note"] is True
    assert captured["update_admin_reply"] is True
    assert captured["admin_reply"] == "Sorununuz çözüldü."

from __future__ import annotations

import admin_seller_service as service


def seller_row(**overrides):
    row = {
        "id": 42,
        "name": "Alya",
        "store_name": "Alya Atölye",
        "store_link": "https://example.com",
        "system_status": "active",
        "onboarding_status": "completed",
        "onboarding_completed": True,
        "ai_enabled": True,
        "created_at": "2026-08-16T10:00:00+00:00",
        "updated_at": "2026-08-16T11:00:00+00:00",
        "email": "private@example.com",
        "phone": "+905551234567",
        "product_info": {"private": True},
    }
    row.update(overrides)
    return row


def test_list_projects_only_safe_summary_fields(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "list_admin_seller_records",
        lambda **kwargs: {"durum": "başarılı", "total": 1, "sellers": [seller_row()]},
    )

    result = service.list_admin_sellers(limit=20, offset=0)

    assert result["ok"] is True
    seller = result["sellers"][0]
    assert seller == {
        "id": 42,
        "name": "Alya",
        "store_name": "Alya Atölye",
        "system_status": "active",
        "onboarding_completed": True,
        "ai_enabled": True,
        "created_at": "2026-08-16T10:00:00+00:00",
        "updated_at": "2026-08-16T11:00:00+00:00",
    }
    assert "email" not in seller
    assert "phone" not in seller
    assert "product_info" not in seller


def test_detail_adds_only_safe_business_context(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "get_admin_seller_record",
        lambda seller_id: {"durum": "başarılı", "seller": seller_row()},
    )

    result = service.get_admin_seller(42)

    assert result["ok"] is True
    assert result["seller"]["store_link"] == "https://example.com"
    assert result["seller"]["onboarding_status"] == "completed"
    assert "email" not in result["seller"]


def test_list_normalizes_search_before_repository(monkeypatch) -> None:
    captured = {}

    def fake_list(**kwargs):
        captured.update(kwargs)
        return {"durum": "başarılı", "total": 0, "sellers": []}

    monkeypatch.setattr(service, "list_admin_seller_records", fake_list)

    result = service.list_admin_sellers(q="  Alya   Atölye  ")

    assert result["ok"] is True
    assert captured["q"] == "Alya Atölye"


def test_invalid_status_rejected_before_repository(monkeypatch) -> None:
    called = False

    def fail(**kwargs):
        nonlocal called
        called = True
        raise AssertionError("repository should not be called")

    monkeypatch.setattr(service, "list_admin_seller_records", fail)

    result = service.list_admin_sellers(system_status="invented")  # type: ignore[arg-type]

    assert result["kind"] == "validation"
    assert called is False


def test_invalid_pagination_rejected() -> None:
    assert service.list_admin_sellers(limit=0)["kind"] == "validation"
    assert service.list_admin_sellers(offset=-1)["kind"] == "validation"


def test_unknown_seller_maps_to_not_found(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "get_admin_seller_record",
        lambda seller_id: {"durum": "bulunamadı"},
    )

    result = service.get_admin_seller(999)

    assert result["kind"] == "not_found"
    assert result["error"]["code"] == "admin_seller_not_found"


def test_malformed_repository_row_fails_closed(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "list_admin_seller_records",
        lambda **kwargs: {
            "durum": "başarılı",
            "total": 1,
            "sellers": [seller_row(system_status="unknown")],
        },
    )

    result = service.list_admin_sellers()

    assert result["kind"] == "unavailable"
    assert "unknown" not in str(result)

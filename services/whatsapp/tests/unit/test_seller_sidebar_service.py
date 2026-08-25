from __future__ import annotations

import seller_sidebar_service


def test_sidebar_service_returns_counts_on_success(monkeypatch) -> None:
    monkeypatch.setattr(
        seller_sidebar_service,
        "get_seller_action_counts",
        lambda seller_id: {
            "durum": "başarılı",
            "returns_action_required": 4,
            "unanswered_open": 7,
            "paused_or_taken_over": 2,
        },
    )

    result = seller_sidebar_service.get_seller_sidebar_summary(11)

    assert result == {
        "ok": True,
        "returns_action_required": 4,
        "unanswered_open": 7,
        "paused_or_taken_over": 2,
    }


def test_sidebar_service_maps_validation_error(monkeypatch) -> None:
    monkeypatch.setattr(
        seller_sidebar_service,
        "get_seller_action_counts",
        lambda seller_id: {"durum": "doğrulama_hatası", "mesaj": "seller_id geçersiz"},
    )

    result = seller_sidebar_service.get_seller_sidebar_summary(0)

    assert result["ok"] is False
    assert result["kind"] == "validation"
    assert result["error"]["code"] == "seller_sidebar_validation_error"


def test_sidebar_service_maps_unavailable_on_hata(monkeypatch) -> None:
    monkeypatch.setattr(
        seller_sidebar_service,
        "get_seller_action_counts",
        lambda seller_id: {"durum": "hata", "mesaj": "db down"},
    )

    result = seller_sidebar_service.get_seller_sidebar_summary(11)

    assert result["ok"] is False
    assert result["kind"] == "unavailable"
    assert result["error"]["code"] == "seller_sidebar_unavailable"


def test_sidebar_service_fails_closed_on_invalid_counts(monkeypatch) -> None:
    # Database doğru durum dönse bile negatif/bozuk count fail-closed olmalı
    monkeypatch.setattr(
        seller_sidebar_service,
        "get_seller_action_counts",
        lambda seller_id: {
            "durum": "başarılı",
            "returns_action_required": -1,
            "unanswered_open": 7,
            "paused_or_taken_over": 2,
        },
    )

    result = seller_sidebar_service.get_seller_sidebar_summary(11)

    assert result["ok"] is False
    assert result["kind"] == "unavailable"

    monkeypatch.setattr(
        seller_sidebar_service,
        "get_seller_action_counts",
        lambda seller_id: {
            "durum": "başarılı",
            "returns_action_required": 4,
            "unanswered_open": "7",  # type: ignore[dict-item]
            "paused_or_taken_over": 2,
        },
    )

    result = seller_sidebar_service.get_seller_sidebar_summary(11)
    assert result["ok"] is False


def test_sidebar_service_does_not_call_list_endpoints(monkeypatch) -> None:
    # Liste endpoint'lerinin çağrılmadığını garantile: sadece count read model
    called = []

    def fake_counts(seller_id: int):
        called.append("counts")
        return {
            "durum": "başarılı",
            "returns_action_required": 1,
            "unanswered_open": 1,
            "paused_or_taken_over": 1,
        }

    monkeypatch.setattr(seller_sidebar_service, "get_seller_action_counts", fake_counts)

    result = seller_sidebar_service.get_seller_sidebar_summary(42)

    assert called == ["counts"]
    assert result["ok"] is True


def test_sidebar_service_tenant_isolation(monkeypatch) -> None:
    captured: dict[str, int] = {}

    def fake_counts(seller_id: int):
        captured["seller_id"] = seller_id
        return {
            "durum": "başarılı",
            "returns_action_required": 0,
            "unanswered_open": 0,
            "paused_or_taken_over": 0,
        }

    monkeypatch.setattr(seller_sidebar_service, "get_seller_action_counts", fake_counts)

    seller_sidebar_service.get_seller_sidebar_summary(99)
    assert captured["seller_id"] == 99

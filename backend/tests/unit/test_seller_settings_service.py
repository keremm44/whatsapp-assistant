from __future__ import annotations

import pytest
from pydantic import ValidationError

import seller_settings_service as service


def seller_row(**overrides):
    data = {
        "id": 42,
        "name": "Alya",
        "phone": "+905551234567",
        "store_name": "Alya Atölye",
        "store_link": "https://example.com",
        "settings_version": 3,
        "updated_at": "2026-08-08T10:00:00+00:00",
        "product_info": {
            "product": {"material": "Seramik", "size_ml": 330, "print_method": "Süblimasyon", "custom_text_max_length": 50},
            "order": {"min_quantity": 1, "max_quantity": 20, "image_required": True, "custom_text_required": True},
            "usage": {"microwave_safe": True, "dishwasher_safe": False, "hand_wash_recommended": True, "food_safe": True},
            "shipping": {"processing_days_min": 1, "processing_days_max": 2, "same_day_available": False, "company": "Yurtiçi", "international": False},
            "return": {"accepts_returns": True, "return_period_days": 14, "damage_replacement": True, "wrong_print_replacement": True},
        },
    }
    data.update(overrides)
    return data


def rule_row(**overrides):
    data = {
        "id": 7,
        "seller_id": 42,
        "trigger_text": "Toplu sipariş",
        "response_text": "Bu talebi satıcıya iletiyorum.",
        "category": "sales",
        "is_active": True,
        "hit_count": 4,
        "version": 2,
        "created_at": "2026-08-08T10:00:00+00:00",
        "updated_at": "2026-08-08T10:00:00+00:00",
    }
    data.update(overrides)
    return data


def test_settings_get_exposes_only_safe_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "get_seller_settings_record", lambda seller_id: {"durum": "başarılı", "seller": seller_row()})
    result = service.get_settings(42)
    assert result["ok"] is True
    assert result["settings"]["version"] == 3
    assert "email" not in result["settings"]["business"]
    assert "ai_enabled" not in result["settings"]
    assert result["settings"]["return_policy"]["return_period_days"] == 14
    assert "product_info" not in result["settings"]


def test_settings_patch_normalizes_phone_and_updates_version(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []
    monkeypatch.setattr(service, "get_seller_settings_record", lambda seller_id: {"durum": "başarılı", "seller": seller_row()})
    def fake_update(seller_id, expected_version, *, seller_patch, product_info):
        calls.append((seller_id, expected_version, seller_patch, product_info))
        return {"durum": "başarılı", "seller": seller_row(settings_version=4, phone=seller_patch.get("phone"))}
    monkeypatch.setattr(service, "update_seller_settings_record", fake_update)
    monkeypatch.setattr(service, "get_settings", lambda seller_id: {"ok": True, "settings": {"version": 4}})

    request = service.SellerSettingsUpdateRequest(expected_version=3, business={"phone": "0555 123 45 67"})
    result = service.update_settings(42, request)

    assert result["ok"] is True
    assert calls[0][1] == 3
    assert calls[0][2] == {"phone": "+905551234567"}


def test_settings_stale_version_fails_before_update(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "get_seller_settings_record", lambda seller_id: {"durum": "başarılı", "seller": seller_row(settings_version=4)})
    called = False
    def fail(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError
    monkeypatch.setattr(service, "update_seller_settings_record", fail)
    result = service.update_settings(42, service.SellerSettingsUpdateRequest(expected_version=3, business={"name": "Yeni İsim"}))
    assert result["kind"] == "conflict"
    assert called is False




def test_required_product_field_cannot_be_cleared() -> None:
    with pytest.raises(ValidationError):
        service.SellerSettingsUpdateRequest(expected_version=1, product={"material": None})


def test_required_shipping_field_cannot_be_cleared() -> None:
    with pytest.raises(ValidationError):
        service.SellerSettingsUpdateRequest(expected_version=1, shipping={"company": None})


def test_settings_accepts_image_required_false() -> None:
    request = service.SellerSettingsUpdateRequest(
        expected_version=1,
        order={"image_required": False},
    )
    assert request.order is not None
    assert request.order.image_required is False


def test_settings_accepts_image_required_true() -> None:
    request = service.SellerSettingsUpdateRequest(
        expected_version=1,
        order={"image_required": True},
    )
    assert request.order is not None
    assert request.order.image_required is True


def test_settings_rejects_explicit_image_required_null() -> None:
    with pytest.raises(ValidationError):
        service.SellerSettingsUpdateRequest(
            expected_version=1,
            order={"image_required": None},
        )


def test_settings_persists_image_required_false(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        service,
        "get_seller_settings_record",
        lambda seller_id: {"durum": "başarılı", "seller": seller_row()},
    )

    def fake_update(seller_id, expected_version, *, seller_patch, product_info):
        captured["product_info"] = product_info
        return {"durum": "başarılı", "seller": seller_row(settings_version=4)}

    monkeypatch.setattr(service, "update_seller_settings_record", fake_update)
    monkeypatch.setattr(
        service,
        "get_settings",
        lambda seller_id: {"ok": True, "settings": {"version": 4}},
    )

    request = service.SellerSettingsUpdateRequest(
        expected_version=3,
        order={"image_required": False},
    )
    result = service.update_settings(42, request)

    assert result["ok"] is True
    order_config = captured["product_info"]["order"]  # type: ignore[index]
    assert order_config["image_required"] is False
    assert order_config["custom_text_required"] is True


def test_settings_rejects_invalid_effective_quantity_range(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "get_seller_settings_record", lambda seller_id: {"durum": "başarılı", "seller": seller_row()})
    request = service.SellerSettingsUpdateRequest(expected_version=3, order={"min_quantity": 30})
    result = service.update_settings(42, request)
    assert result["kind"] == "validation"


def test_settings_rejects_same_day_with_positive_min(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "get_seller_settings_record", lambda seller_id: {"durum": "başarılı", "seller": seller_row()})
    request = service.SellerSettingsUpdateRequest(expected_version=3, shipping={"same_day_available": True})
    result = service.update_settings(42, request)
    assert result["kind"] == "validation"


def test_settings_rejects_return_enabled_without_valid_period(monkeypatch: pytest.MonkeyPatch) -> None:
    row = seller_row()
    row["product_info"]["return"] = {"accepts_returns": False, "return_period_days": 0}
    monkeypatch.setattr(service, "get_seller_settings_record", lambda seller_id: {"durum": "başarılı", "seller": row})
    request = service.SellerSettingsUpdateRequest(expected_version=3, return_policy={"accepts_returns": True})
    result = service.update_settings(42, request)
    assert result["kind"] == "validation"


def test_rule_create_returns_public_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "create_seller_rule_record", lambda *args, **kwargs: {"durum": "başarılı", "rule": rule_row()})
    request = service.SellerRuleCreateRequest(trigger_text="Toplu sipariş", response_text="Satıcıya iletiyorum", category=" Sales ")
    result = service.create_rule(42, request)
    assert result["ok"] is True
    assert result["rule"]["category"] == "sales"
    assert "seller_id" not in result["rule"]


def test_rule_duplicate_maps_to_conflict(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "create_seller_rule_record", lambda *args, **kwargs: {"durum": "duplicate"})
    result = service.create_rule(42, service.SellerRuleCreateRequest(trigger_text="Kargo", response_text="Yarın çıkar"))
    assert result["kind"] == "conflict"
    assert result["error"]["code"] == "seller_rule_duplicate"


def test_rule_update_passes_only_mutable_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = {}
    def fake_update(seller_id, rule_id, expected_version, *, patch):
        captured.update(patch)
        return {"durum": "başarılı", "rule": rule_row(response_text=patch["response_text"], version=3)}
    monkeypatch.setattr(service, "update_seller_rule_record", fake_update)
    request = service.SellerRuleUpdateRequest(expected_version=2, response_text="Yeni cevap")
    result = service.update_rule(42, 7, request)
    assert result["rule"]["version"] == 3
    assert captured == {"response_text": "Yeni cevap"}


def test_rule_delete_is_soft_deactivate(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = {}

    def fake_deactivate(seller_id, rule_id, expected_version):
        captured.update(
            seller_id=seller_id,
            rule_id=rule_id,
            expected_version=expected_version,
        )
        return {
            "durum": "başarılı",
            "changed": True,
            "rule": rule_row(is_active=False, version=3),
        }

    monkeypatch.setattr(service, "deactivate_seller_rule_record", fake_deactivate)
    result = service.deactivate_rule(42, 7, 2)
    assert result["changed"] is True
    assert captured == {"seller_id": 42, "rule_id": 7, "expected_version": 2}


def test_rule_delete_inactive_is_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        service,
        "deactivate_seller_rule_record",
        lambda seller_id, rule_id, expected_version: {
            "durum": "başarılı",
            "changed": False,
            "rule": rule_row(is_active=False),
        },
    )
    result = service.deactivate_rule(42, 7, 2)
    assert result["ok"] is True
    assert result["changed"] is False

from __future__ import annotations

import pytest
from pydantic import ValidationError

import order_collection_policy as policy
from seller_settings_service import OrderSettingsPatch


def _order(**overrides):
    value = {
        "id": 10,
        "customer_id": 20,
        "status": "COLLECTING",
        "version": 3,
        "external_order_number": None,
        "image_message_id": None,
        "custom_text": None,
    }
    value.update(overrides)
    return value


def _settings(order_config):
    return {"durum": "başarılı", "product_info": {"order": order_config}}


def test_missing_order_number_requirement_preserves_legacy_required_default(monkeypatch) -> None:
    monkeypatch.setattr(
        policy,
        "get_order_detail",
        lambda seller_id, order_id: {"durum": "başarılı", "order": _order(), "fields": []},
    )
    monkeypatch.setattr(
        policy,
        "get_seller_product_info",
        lambda seller_id: _settings({"image_required": False, "custom_text_required": False}),
    )

    result = policy.get_next_collection_step(1, 10)

    assert result["durum"] == "başarılı"
    assert result["step"] == "order_number"


def test_order_number_step_is_skipped_when_seller_disables_it(monkeypatch) -> None:
    monkeypatch.setattr(
        policy,
        "get_order_detail",
        lambda seller_id, order_id: {"durum": "başarılı", "order": _order(), "fields": []},
    )
    monkeypatch.setattr(
        policy,
        "get_seller_product_info",
        lambda seller_id: _settings(
            {
                "order_number_required": False,
                "image_required": True,
                "custom_text_required": False,
            }
        ),
    )

    result = policy.get_next_collection_step(1, 10)

    assert result["step"] == "image"
    assert "sipariş numarası" not in result["question"].lower()


def test_all_core_requirements_can_be_disabled_without_inventing_new_requirements(monkeypatch) -> None:
    monkeypatch.setattr(
        policy,
        "get_order_detail",
        lambda seller_id, order_id: {"durum": "başarılı", "order": _order(), "fields": []},
    )
    monkeypatch.setattr(
        policy,
        "get_seller_product_info",
        lambda seller_id: _settings(
            {
                "order_number_required": False,
                "image_required": False,
                "custom_text_required": False,
            }
        ),
    )

    result = policy.get_next_collection_step(1, 10)

    assert result["step"] == "complete"
    assert result["complete"] is True


def test_product_specific_image_fields_still_collect_in_snapshot_order(monkeypatch) -> None:
    fields = [
        {
            "id": 202,
            "field_key": "back_image",
            "label": "Arka baskı",
            "field_type": "image",
            "is_required": True,
            "completed": False,
            "sort_order": 2,
            "options": [],
            "validation_config": {},
        },
        {
            "id": 201,
            "field_key": "front_image",
            "label": "Ön baskı",
            "field_type": "image",
            "is_required": True,
            "completed": False,
            "sort_order": 1,
            "options": [],
            "validation_config": {},
        },
    ]
    monkeypatch.setattr(
        policy,
        "get_order_detail",
        lambda seller_id, order_id: {"durum": "başarılı", "order": _order(), "fields": fields},
    )
    monkeypatch.setattr(
        policy,
        "get_seller_product_info",
        lambda seller_id: _settings(
            {
                "order_number_required": False,
                "image_required": False,
                "custom_text_required": False,
            }
        ),
    )

    result = policy.get_next_collection_step(1, 10)

    assert result["step"] == "dynamic_field"
    assert result["field"]["id"] == 201
    assert result["field"]["field_type"] == "image"
    assert result["question"] == "Ön baskı görselini gönderebilir misiniz?"


def test_invalid_requirement_config_fails_closed(monkeypatch) -> None:
    monkeypatch.setattr(
        policy,
        "get_order_detail",
        lambda seller_id, order_id: {"durum": "başarılı", "order": _order(), "fields": []},
    )
    monkeypatch.setattr(
        policy,
        "get_seller_product_info",
        lambda seller_id: _settings(
            {
                "order_number_required": "sometimes",
                "image_required": False,
                "custom_text_required": False,
            }
        ),
    )

    result = policy.get_next_collection_step(1, 10)

    assert result["durum"] == "hata"
    assert result["error_code"] == "order_config_unavailable"
    assert "order_number_required" in result["mesaj"]


def test_order_settings_patch_accepts_binary_order_number_requirement() -> None:
    assert OrderSettingsPatch(order_number_required=True).order_number_required is True
    assert OrderSettingsPatch(order_number_required=False).order_number_required is False


def test_order_settings_patch_rejects_clearing_order_number_requirement() -> None:
    with pytest.raises(ValidationError):
        OrderSettingsPatch(order_number_required=None)

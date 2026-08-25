from __future__ import annotations

from onboarding_service import get_onboarding_schema, prepare_onboarding_step


def valid_step_data(step_order: int) -> dict:
    payloads = {
        1: {
            "name": "Ahmet Yılmaz",
            "email": "AHMET@EXAMPLE.COM",
            "phone": "+90 555 123 45 67",
        },
        2: {
            "store_name": "Ahmet Kupa Atölyesi",
            "store_link": "https://example.com/store",
        },
        3: {
            "material": "Seramik",
            "size_ml": 330,
            "print_method": "Süblimasyon",
            "custom_text_max_length": 80,
            "min_quantity": 1,
            "max_quantity": 100,
            "image_required": True,
            "custom_text_required": True,
            "microwave_safe": None,
            "dishwasher_safe": True,
            "hand_wash_recommended": False,
            "food_safe": True,
        },
        4: {
            "processing_days_min": 1,
            "processing_days_max": 3,
            "same_day_available": False,
            "company": "Yurtiçi Kargo",
            "international": False,
        },
        5: {
            "accepts_returns": True,
            "return_period_days": 14,
            "damage_replacement": True,
            "wrong_print_replacement": True,
        },
        6: {
            "templates_confirmed": True,
            "rules": [
                {
                    "trigger_text": "toplu sipariş",
                    "response_text": "Toplu siparişler için satıcımıza bilgi veriyorum.",
                    "category": "bulk_order",
                    "is_active": True,
                }
            ],
        },
        7: {
            "test_passed": True,
            "seller_confirmed": True,
            "sample_message": "Merhaba",
        },
        8: {
            "connection_status": "connected",
            "display_phone_number": "+90 555 123 45 67",
            "phone_number_id": "1234567890",
            "business_account_id": "9876543210",
        },
        9: {
            "inbound_message_received": True,
            "outbound_message_delivered": True,
            "test_passed": True,
        },
        10: {
            "information_confirmed": True,
            "terms_accepted": True,
            "ready_for_activation": True,
            "terms_version": "v1",
        },
    }
    return payloads[step_order]


def test_all_steps_accept_valid_payloads() -> None:
    for step_order in range(1, 11):
        result = prepare_onboarding_step(
            step_order,
            valid_step_data(step_order),
        )

        assert result["durum"] == "başarılı", result
        assert result["step_order"] == step_order
        assert result["normalized_step_data"]


def test_business_info_normalizes_email_and_phone() -> None:
    result = prepare_onboarding_step(1, valid_step_data(1))

    assert result["durum"] == "başarılı"
    assert result["seller_patch"]["email"] == "ahmet@example.com"
    assert result["seller_patch"]["phone"] == "+905551234567"


def test_product_info_builds_nested_patch() -> None:
    result = prepare_onboarding_step(3, valid_step_data(3))

    assert result["durum"] == "başarılı"
    product_patch = result["product_info_patch"]
    assert product_patch["product"]["size_ml"] == 330
    assert product_patch["order"]["image_required"] is True
    assert product_patch["usage"]["microwave_safe"] is None



def test_product_info_rejects_optional_main_order_image() -> None:
    payload = valid_step_data(3)
    payload["image_required"] = False

    result = prepare_onboarding_step(3, payload)

    assert result["durum"] == "doğrulama_hatası"
    assert any(error["field"] == "image_required" for error in result["errors"])

def test_shipping_range_is_validated() -> None:
    payload = valid_step_data(4)
    payload["processing_days_min"] = 5
    payload["processing_days_max"] = 2

    result = prepare_onboarding_step(4, payload)

    assert result["durum"] == "doğrulama_hatası"
    assert result["errors"]


def test_return_period_is_required_when_returns_are_accepted() -> None:
    payload = valid_step_data(5)
    payload["return_period_days"] = None

    result = prepare_onboarding_step(5, payload)

    assert result["durum"] == "doğrulama_hatası"


def test_duplicate_rule_triggers_are_rejected() -> None:
    payload = valid_step_data(6)
    payload["rules"].append(
        {
            "trigger_text": "TOPLU SİPARİŞ",
            "response_text": "İkinci cevap",
            "category": "bulk_order",
            "is_active": True,
        }
    )

    result = prepare_onboarding_step(6, payload)

    assert result["durum"] == "doğrulama_hatası"


def test_secret_fields_are_rejected() -> None:
    payload = valid_step_data(8)
    payload["access_token"] = "secret"

    result = prepare_onboarding_step(8, payload)

    assert result["durum"] == "doğrulama_hatası"
    assert result["errors"][0]["code"] == "unsafe_field"


def test_unknown_fields_are_rejected() -> None:
    payload = valid_step_data(2)
    payload["unknown_field"] = "x"

    result = prepare_onboarding_step(2, payload)

    assert result["durum"] == "doğrulama_hatası"
    assert any(
        error["field"] == "unknown_field"
        for error in result["errors"]
    )


def test_required_confirmation_cannot_be_false() -> None:
    payload = valid_step_data(10)
    payload["terms_accepted"] = False

    result = prepare_onboarding_step(10, payload)

    assert result["durum"] == "doğrulama_hatası"


def test_schema_contains_ten_ordered_steps() -> None:
    schema = get_onboarding_schema()

    assert schema["version"] == "onboarding_v1"
    assert schema["total_steps"] == 10
    assert [step["step_order"] for step in schema["steps"]] == list(
        range(1, 11)
    )

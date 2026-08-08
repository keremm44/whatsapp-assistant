from __future__ import annotations

import pytest
from pydantic import ValidationError

import seller_application_service as service


def valid_payload(**overrides):
    data = {
        "name": "Ayşe Kaya",
        "storeName": "Alya Atölye",
        "phone": "0555 123 45 67",
        "category": "Kişiselleştirilmiş kupa",
        "note": "Günde yaklaşık 40 mesaj alıyoruz.",
    }
    data.update(overrides)
    return data


def test_public_model_matches_marketing_form_and_normalizes_phone() -> None:
    model = service.PublicSellerApplication.model_validate(valid_payload())

    assert model.full_name == "Ayşe Kaya"
    assert model.store_name == "Alya Atölye"
    assert model.phone == "+905551234567"
    assert model.product_category == "Kişiselleştirilmiş kupa"
    assert model.notes == "Günde yaklaşık 40 mesaj alıyoruz."
    assert model.email is None


def test_public_model_accepts_optional_email_and_store_link() -> None:
    model = service.PublicSellerApplication.model_validate(
        valid_payload(
            email="  AYSE@EXAMPLE.COM ",
            storeLink="https://example.com/store",
        )
    )

    assert model.email == "ayse@example.com"
    assert model.store_link == "https://example.com/store"


def test_public_model_rejects_invalid_phone_email_url_and_extra_fields() -> None:
    with pytest.raises(ValidationError):
        service.PublicSellerApplication.model_validate(valid_payload(phone="123"))

    with pytest.raises(ValidationError):
        service.PublicSellerApplication.model_validate(
            valid_payload(email="not-an-email")
        )

    with pytest.raises(ValidationError):
        service.PublicSellerApplication.model_validate(
            valid_payload(storeLink="javascript:alert(1)")
        )

    with pytest.raises(ValidationError):
        service.PublicSellerApplication.model_validate(
            valid_payload(status="approved")
        )


def test_submit_success_returns_minimal_public_contract(monkeypatch) -> None:
    captured = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return {
            "durum": "başarılı",
            "application": {"id": 91, "status": "pending"},
        }

    monkeypatch.setattr(service, "create_seller_application", fake_create)
    model = service.PublicSellerApplication.model_validate(valid_payload())

    result = service.submit_public_seller_application(model)

    assert result["ok"] is True
    assert result["received"] is True
    assert "application" not in result
    assert "id" not in result
    assert captured == {
        "full_name": "Ayşe Kaya",
        "email": None,
        "phone": "+905551234567",
        "store_name": "Alya Atölye",
        "store_link": None,
        "notes": "Günde yaklaşık 40 mesaj alıyoruz.",
        "product_category": "Kişiselleştirilmiş kupa",
    }


def test_submit_duplicate_is_indistinguishable_from_new_application(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "create_seller_application",
        lambda **_kwargs: {"durum": "duplicate", "mesaj": "internal duplicate"},
    )
    model = service.PublicSellerApplication.model_validate(valid_payload())

    result = service.submit_public_seller_application(model)

    assert result["ok"] is True
    assert result["received"] is True
    assert "duplicate" not in str(result).lower()


def test_submit_database_error_fails_closed_without_internal_error(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "create_seller_application",
        lambda **_kwargs: {
            "durum": "hata",
            "mesaj": "service_role secret or raw postgres detail",
        },
    )
    model = service.PublicSellerApplication.model_validate(valid_payload())

    result = service.submit_public_seller_application(model)

    assert result["ok"] is False
    assert result["kind"] == "unavailable"
    assert result["error"]["code"] == "seller_application_unavailable"
    assert "service_role" not in result["error"]["message"]
    assert "postgres" not in result["error"]["message"].lower()

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

import api.seller.orders as order_routes
from main import app


def seller_context(seller_id: int = 11) -> Any:
    return type(
        "AuthContext",
        (),
        {
            "auth_user_id": "auth-1",
            "email": "seller@example.com",
            "role": "seller",
            "profile_status": "active",
            "seller_id": seller_id,
            "profile": {"id": 7},
            "claims": {},
        },
    )()


def order_summary(
    *,
    order_id: int = 1,
    status: str = "COLLECTING",
    external_order_number: str | None = None,
    image_message_id: int | None = None,
    custom_text: str | None = None,
    review_reason_code: str | None = None,
) -> dict[str, Any]:
    return {
        "id": order_id,
        "external_order_number": external_order_number,
        "product_id": None,
        "product_name_snapshot": None,
        "customer_id": 22,
        "customer_phone_snapshot": "+905551112244",
        "status": status,
        "review_reason_code": review_reason_code,
        "review_reason_note": None,
        "version": 1,
        "created_at": "2026-08-06T12:00:00+00:00",
        "updated_at": "2026-08-06T12:00:00+00:00",
        "completed_at": None,
        "image_message_id": image_message_id,
        "custom_text": custom_text,
    }


def order_detail() -> dict[str, Any]:
    return {
        "id": 1,
        "external_order_number": "ETSY-12345",
        "product_id": None,
        "product_name_snapshot": None,
        "customer_id": 22,
        "customer_phone_snapshot": "+905551112244",
        "customer_note": None,
        "image_message_id": 105,
        "custom_text": "Ali",
        "status": "COLLECTING",
        "review_reason_code": None,
        "review_reason_note": None,
        "created_from_message_id": 101,
        "last_source_message_id": 105,
        "version": 3,
        "created_at": "2026-08-06T12:00:00+00:00",
        "updated_at": "2026-08-06T12:00:00+00:00",
        "completed_at": None,
        "closed_at": None,
    }


def field_definition() -> dict[str, Any]:
    return {
        "id": 1,
        "seller_id": 11,
        "product_id": None,
        "field_key": "print_text",
        "label": "Kupaya yazılacak isim",
        "field_type": "short_text",
        "is_required": True,
        "is_active": True,
        "sort_order": 10,
        "options": [],
        "validation_config": {"max_length": 40},
        "version": 1,
        "created_at": "2026-08-06T12:00:00+00:00",
        "updated_at": "2026-08-06T12:00:00+00:00",
    }


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[order_routes.require_seller] = lambda: seller_context()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_orders_list_requires_auth() -> None:
    app.dependency_overrides.clear()
    response = TestClient(app).get("/seller/orders")
    assert response.status_code == 401


def test_orders_list_returns_summaries(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_routes,
        "list_seller_orders",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": 1,
            "orders": [order_summary()],
        },
    )

    response = client.get("/seller/orders")

    assert response.status_code == 200
    body = response.json()
    assert body["view"] == "all"
    assert body["toplam"] == 1
    assert body["limit"] == 20
    assert body["offset"] == 0
    assert body["orders"][0]["display_status"] == "Bilgi toplanıyor"
    assert body["orders"][0]["seller_action_required"] is False


def test_orders_list_summary_preserves_source_fields(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_routes,
        "list_seller_orders",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": 2,
            "orders": [
                order_summary(order_id=1, custom_text="İyi ki doğdun Elif", image_message_id=105),
                order_summary(order_id=2),
            ],
        },
    )

    orders = client.get("/seller/orders").json()["orders"]
    assert orders[0]["custom_text"] == "İyi ki doğdun Elif"
    assert orders[0]["has_image"] is True
    assert orders[1]["custom_text"] is None
    assert orders[1]["has_image"] is False
    assert "print_content" not in orders[0]


def test_orders_list_uses_authenticated_tenant_and_filters(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_list(seller_id: int, **kwargs: Any) -> dict[str, Any]:
        captured["seller_id"] = seller_id
        captured.update(kwargs)
        return {
            "durum": "başarılı",
            "toplam": 1,
            "orders": [
                order_summary(
                    status="SELLER_REVIEW_REQUIRED",
                    review_reason_code="product_changed",
                )
            ],
        }

    monkeypatch.setattr(order_routes, "list_seller_orders", fake_list)
    response = client.get("/seller/orders?view=action_required&product_id=3&image_missing=true")

    assert response.status_code == 200
    assert captured["seller_id"] == 11
    assert captured["view"] == "action_required"
    assert captured["product_id"] == 3
    assert captured["image_missing"] is True
    assert response.json()["orders"][0]["seller_action_required"] is True


def test_orders_list_collecting_filter(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def fake_list(*args: Any, **kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"durum": "başarılı", "toplam": 0, "orders": []}

    monkeypatch.setattr(order_routes, "list_seller_orders", fake_list)
    response = client.get("/seller/orders?view=collecting")
    assert response.status_code == 200
    assert captured["view"] == "collecting"


def test_orders_list_validation(client: TestClient) -> None:
    assert client.get("/seller/orders?view=invalid").status_code == 422
    assert client.get("/seller/orders?limit=0").status_code == 422
    assert client.get("/seller/orders?limit=101").status_code == 422
    assert client.get("/seller/orders?product_id=0").status_code == 422


def test_orders_list_service_error_maps_to_503(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_routes,
        "list_seller_orders",
        lambda *args, **kwargs: {"durum": "hata", "mesaj": "DB yok"},
    )
    assert client.get("/seller/orders").status_code == 503


def test_orders_v2_uses_native_handler_and_public_envelope(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_list(seller_id: int, **kwargs: Any) -> dict[str, Any]:
        captured["seller_id"] = seller_id
        captured.update(kwargs)
        return {
            "ok": True,
            "items": [],
            "has_more": False,
            "next_cursor": None,
        }

    monkeypatch.setattr(order_routes, "list_orders_v2", fake_list)
    response = client.get("/seller/orders/v2?limit=25")

    assert response.status_code == 200
    assert response.json() == {"items": [], "has_more": False, "next_cursor": None}
    assert captured["seller_id"] == 11
    assert captured["limit"] == 25


def test_orders_v2_error_mapping(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_routes,
        "list_orders_v2",
        lambda *args, **kwargs: {
            "ok": False,
            "kind": "validation",
            "error": {"code": "invalid_cursor", "message": "Geçersiz cursor."},
        },
    )
    assert client.get("/seller/orders/v2").status_code == 422

    monkeypatch.setattr(
        order_routes,
        "list_orders_v2",
        lambda *args, **kwargs: {
            "ok": False,
            "kind": "unavailable",
            "error": {"code": "orders_unavailable", "message": "Geçici hata."},
        },
    )
    assert client.get("/seller/orders/v2").status_code == 503


def test_order_detail_returns_fields(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_routes,
        "get_order_with_fields",
        lambda seller_id, order_id: {
            "durum": "başarılı",
            "order": order_detail(),
            "fields": [
                {
                    "id": 7,
                    "field_key": "print_text",
                    "label": "Kupaya yazılacak isim",
                    "field_type": "short_text",
                    "is_required": True,
                    "value": "Ali",
                    "completed": True,
                }
            ],
        },
    )

    response = client.get("/seller/orders/1")
    assert response.status_code == 200
    body = response.json()
    assert body["order"]["id"] == 1
    assert body["order"]["display_status"] == "Bilgi toplanıyor"
    assert body["order"]["seller_action_required"] is False
    assert body["fields"][0]["field_key"] == "print_text"
    assert "media_url" not in body["order"]


def test_order_detail_tenant_and_error_mapping(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, int] = {}

    def not_found(seller_id: int, order_id: int) -> dict[str, Any]:
        captured.update(seller_id=seller_id, order_id=order_id)
        return {"durum": "bulunamadı"}

    monkeypatch.setattr(order_routes, "get_order_with_fields", not_found)
    assert client.get("/seller/orders/99").status_code == 404
    assert captured == {"seller_id": 11, "order_id": 99}

    monkeypatch.setattr(
        order_routes,
        "get_order_with_fields",
        lambda *args, **kwargs: {"durum": "hata", "mesaj": "DB yok"},
    )
    assert client.get("/seller/orders/1").status_code == 503


def test_field_definitions_list(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_routes,
        "get_order_field_definitions",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": 1,
            "definitions": [field_definition()],
        },
    )
    response = client.get("/seller/order-field-definitions")
    assert response.status_code == 200
    assert response.json()["definitions"][0]["field_key"] == "print_text"


def test_field_definition_create(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_routes,
        "create_order_field_definition",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "definition": field_definition(),
        },
    )
    response = client.post(
        "/seller/order-field-definitions",
        json={
            "field_key": "print_text",
            "label": "Kupaya yazılacak isim",
            "field_type": "short_text",
            "is_required": True,
            "sort_order": 10,
            "validation_config": {"max_length": 40},
        },
    )
    assert response.status_code == 200
    assert response.json()["definition"]["field_key"] == "print_text"


def test_field_definition_create_rejects_untrusted_or_invalid_fields(client: TestClient) -> None:
    base = {"field_key": "print_text", "label": "X", "field_type": "short_text"}
    assert client.post(
        "/seller/order-field-definitions",
        json={**base, "seller_id": 99},
    ).status_code == 422
    assert client.post(
        "/seller/order-field-definitions",
        json={**base, "version": 1},
    ).status_code == 422
    assert client.post(
        "/seller/order-field-definitions",
        json={**base, "field_key": "Print Text!"},
    ).status_code == 422


def test_field_definition_create_checks_product_tenant(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, int] = {}

    def fake_product(seller_id: int, product_id: int) -> dict[str, Any]:
        captured.update(seller_id=seller_id, product_id=product_id)
        return {"durum": "bulunamadı"}

    monkeypatch.setattr(order_routes, "get_product_by_id", fake_product)
    response = client.post(
        "/seller/order-field-definitions",
        json={
            "product_id": 99,
            "field_key": "print_text",
            "label": "X",
            "field_type": "short_text",
        },
    )
    assert response.status_code == 404
    assert captured == {"seller_id": 11, "product_id": 99}


def test_field_definition_create_duplicate_key_409(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_routes,
        "create_order_field_definition",
        lambda *args, **kwargs: {"durum": "çakışma", "mesaj": "Bu alan anahtarı zaten kullanılıyor."},
    )
    response = client.post(
        "/seller/order-field-definitions",
        json={"field_key": "print_text", "label": "X", "field_type": "short_text"},
    )
    assert response.status_code == 409


def test_field_definition_update(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def fake_update(seller_id: int, field_id: int, **kwargs: Any) -> dict[str, Any]:
        captured.update(seller_id=seller_id, field_id=field_id, **kwargs)
        return {
            "durum": "başarılı",
            "definition": {**field_definition(), "label": "Yeni", "version": 2},
        }

    monkeypatch.setattr(order_routes, "update_order_field_definition", fake_update)
    response = client.patch(
        "/seller/order-field-definitions/1",
        json={"expected_version": 1, "label": "Yeni", "is_required": True},
    )
    assert response.status_code == 200
    assert captured["seller_id"] == 11
    assert captured["field_id"] == 1
    assert captured["expected_version"] == 1
    assert response.json()["definition"]["label"] == "Yeni"


def test_field_definition_update_conflict_and_validation(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_routes,
        "update_order_field_definition",
        lambda *args, **kwargs: {"durum": "çakışma", "mesaj": "Alan tanımı değişti."},
    )
    assert client.patch(
        "/seller/order-field-definitions/1",
        json={"expected_version": 1, "label": "Yeni"},
    ).status_code == 409
    assert client.patch(
        "/seller/order-field-definitions/1",
        json={"label": "Yeni"},
    ).status_code == 422
    assert client.patch(
        "/seller/order-field-definitions/1",
        json={"expected_version": True, "label": "Yeni"},
    ).status_code == 422


def test_field_definition_update_other_tenant_404(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_routes,
        "update_order_field_definition",
        lambda *args, **kwargs: {"durum": "bulunamadı"},
    )
    assert client.patch(
        "/seller/order-field-definitions/99",
        json={"expected_version": 1, "label": "Yeni"},
    ).status_code == 404


def test_no_hard_delete_endpoint(client: TestClient) -> None:
    assert client.delete("/seller/order-field-definitions/1").status_code == 405

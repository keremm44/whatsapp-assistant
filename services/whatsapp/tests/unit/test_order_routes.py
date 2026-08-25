from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

import protected_routes
from main import app
from auth_service import AuthContext


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


def admin_context() -> Any:
    return type(
        "AuthContext",
        (),
        {
            "auth_user_id": "auth-admin",
            "email": "admin@example.com",
            "role": "admin",
            "profile_status": "active",
            "seller_id": None,
            "profile": {"id": 1},
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
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    # Auth dependency'lerini FastAPI dependency override ile mock'la.
    app.dependency_overrides[protected_routes.require_seller] = (
        lambda: seller_context()
    )
    app.dependency_overrides[protected_routes.require_admin] = (
        lambda: admin_context()
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


# =====================================================
# SİPARİŞ LİSTESİ
# =====================================================

def test_orders_list_requires_auth() -> None:
    # Override'sız client ile auth gerekli olmalı.
    from main import app as app_instance

    app_instance.dependency_overrides.clear()
    plain_client = TestClient(app_instance)
    response = plain_client.get("/seller/orders")
    assert response.status_code == 401
    app_instance.dependency_overrides.clear()


def test_orders_list_returns_summaries(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "list_seller_orders",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": 1,
            "orders": [order_summary()],
        },
    )

    response = client.get("/seller/orders")

    assert response.status_code == 200
    data = response.json()
    assert data["toplam"] == 1
    assert data["orders"][0]["id"] == 1
    assert data["orders"][0]["display_status"] == "Bilgi toplanıyor"
    assert data["orders"][0]["seller_action_required"] is False


def test_orders_list_summary_includes_custom_text_and_has_image(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Fix B: liste özeti custom_text'i kaynak-doğru veri olarak taşır;
    # backend formatlanmış Türkçe "print_content" stringi ÜRETMEZ.
    monkeypatch.setattr(
        protected_routes,
        "list_seller_orders",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": 2,
            "orders": [
                order_summary(
                    order_id=1,
                    custom_text="İyi ki doğdun Elif",
                    image_message_id=105,
                ),
                order_summary(order_id=2),
            ],
        },
    )

    response = client.get("/seller/orders")

    assert response.status_code == 200
    orders = response.json()["orders"]
    first, second = orders[0], orders[1]
    assert first["custom_text"] == "İyi ki doğdun Elif"
    assert first["has_image"] is True
    assert second["custom_text"] is None
    assert second["has_image"] is False
    # Sunum metni frontend sorumluluğu: backend biçimlendirilmiş
    # print_content alanı döndürmez.
    assert "print_content" not in first
    assert "print_content" not in second


def test_orders_list_action_required(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_list(*args: Any, **kwargs: Any) -> dict[str, Any]:
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

    monkeypatch.setattr(protected_routes, "list_seller_orders", fake_list)

    response = client.get("/seller/orders?view=action_required")

    assert response.status_code == 200
    assert captured["view"] == "action_required"
    assert response.json()["orders"][0]["seller_action_required"] is True


def test_orders_list_collecting(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_list(*args: Any, **kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"durum": "başarılı", "toplam": 0, "orders": []}

    monkeypatch.setattr(protected_routes, "list_seller_orders", fake_list)

    response = client.get("/seller/orders?view=collecting")

    assert response.status_code == 200
    assert captured["view"] == "collecting"


def test_orders_list_invalid_view(client: TestClient) -> None:
    response = client.get("/seller/orders?view=invalid")
    assert response.status_code == 422


def test_orders_list_limit_validation(client: TestClient) -> None:
    response = client.get("/seller/orders?limit=0")
    assert response.status_code == 422

    response = client.get("/seller/orders?limit=101")
    assert response.status_code == 422


def test_orders_list_other_tenant_not_visible(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # list_seller_orders tenant scope'u seller_id ile sınırlar.
    captured: dict[str, Any] = {}

    def fake_list(*args: Any, **kwargs: Any) -> dict[str, Any]:
        captured["seller_id"] = args[0]
        return {"durum": "başarılı", "toplam": 0, "orders": []}

    monkeypatch.setattr(protected_routes, "list_seller_orders", fake_list)

    client.get("/seller/orders")

    assert captured["seller_id"] == 11


def test_orders_list_db_error_503(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "list_seller_orders",
        lambda *args, **kwargs: {
            "durum": "hata",
            "error_code": "order_unavailable",
            "mesaj": "DB yok",
        },
    )

    response = client.get("/seller/orders")

    assert response.status_code == 503


# =====================================================
# SİPARİŞ DETAYI
# =====================================================

def test_order_detail_returns_fields(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
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
    data = response.json()
    assert data["order"]["id"] == 1
    assert data["order"]["display_status"] == "Bilgi toplanıyor"
    assert data["fields"][0]["field_key"] == "print_text"
    assert data["fields"][0]["value"] == "Ali"


def test_order_detail_other_tenant_404(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "get_order_with_fields",
        lambda seller_id, order_id: {"durum": "bulunamadı"},
    )

    response = client.get("/seller/orders/99")

    assert response.status_code == 404


def test_order_detail_db_error_503(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "get_order_with_fields",
        lambda seller_id, order_id: {
            "durum": "hata",
            "error_code": "order_unavailable",
            "mesaj": "DB yok",
        },
    )

    response = client.get("/seller/orders/1")

    assert response.status_code == 503


def test_order_detail_no_public_media_url(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Görsel yalnız message_id referansı olarak döner; URL sızmaz.
    monkeypatch.setattr(
        protected_routes,
        "get_order_with_fields",
        lambda seller_id, order_id: {
            "durum": "başarılı",
            "order": order_detail(),
            "fields": [],
        },
    )

    response = client.get("/seller/orders/1")

    assert response.status_code == 200
    assert "media_url" not in response.json()["order"]
    assert "https://" not in str(response.json()["order"])


# =====================================================
# DİNAMİK ALAN TANIMLARI
# =====================================================

def test_field_definitions_list(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "get_order_field_definitions",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": 1,
            "definitions": [field_definition()],
        },
    )

    response = client.get("/seller/order-field-definitions")

    assert response.status_code == 200
    assert response.json()["toplam"] == 1
    assert response.json()["definitions"][0]["field_key"] == "print_text"


def test_field_definition_create(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
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


def test_field_definition_create_seller_id_rejected(
    client: TestClient,
) -> None:
    response = client.post(
        "/seller/order-field-definitions",
        json={
            "seller_id": 99,
            "field_key": "print_text",
            "label": "X",
            "field_type": "short_text",
        },
    )

    assert response.status_code == 422


def test_field_definition_create_extra_field_rejected(
    client: TestClient,
) -> None:
    response = client.post(
        "/seller/order-field-definitions",
        json={
            "field_key": "print_text",
            "label": "X",
            "field_type": "short_text",
            "version": 1,
        },
    )

    assert response.status_code == 422


def test_field_definition_create_invalid_key(
    client: TestClient,
) -> None:
    response = client.post(
        "/seller/order-field-definitions",
        json={
            "field_key": "Print Text!",
            "label": "X",
            "field_type": "short_text",
        },
    )

    assert response.status_code == 422


def test_field_definition_create_other_tenant_product_404(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "get_product_by_id",
        lambda seller_id, product_id: {"durum": "bulunamadı"},
    )

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


def test_field_definition_create_duplicate_key_409(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "create_order_field_definition",
        lambda *args, **kwargs: {
            "durum": "çakışma",
            "mesaj": "Bu alan anahtarı zaten kullanılıyor.",
        },
    )

    response = client.post(
        "/seller/order-field-definitions",
        json={
            "field_key": "print_text",
            "label": "X",
            "field_type": "short_text",
        },
    )

    assert response.status_code == 409


def test_field_definition_update(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "update_order_field_definition",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "definition": {**field_definition(), "label": "Yeni", "version": 2},
        },
    )

    response = client.patch(
        "/seller/order-field-definitions/1",
        json={
            "expected_version": 1,
            "label": "Yeni",
            "is_required": True,
        },
    )

    assert response.status_code == 200
    assert response.json()["definition"]["label"] == "Yeni"


def test_field_definition_update_stale_version_409(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "update_order_field_definition",
        lambda *args, **kwargs: {
            "durum": "çakışma",
            "mesaj": "Alan tanımı değişti.",
        },
    )

    response = client.patch(
        "/seller/order-field-definitions/1",
        json={
            "expected_version": 1,
            "label": "Yeni",
        },
    )

    assert response.status_code == 409


def test_field_definition_update_missing_version_422(
    client: TestClient,
) -> None:
    response = client.patch(
        "/seller/order-field-definitions/1",
        json={"label": "Yeni"},
    )

    assert response.status_code == 422


def test_field_definition_update_other_tenant_404(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        protected_routes,
        "update_order_field_definition",
        lambda *args, **kwargs: {"durum": "bulunamadı"},
    )

    response = client.patch(
        "/seller/order-field-definitions/99",
        json={"expected_version": 1, "label": "Yeni"},
    )

    assert response.status_code == 404


def test_no_hard_delete_endpoint(client: TestClient) -> None:
    response = client.delete("/seller/order-field-definitions/1")
    assert response.status_code == 405
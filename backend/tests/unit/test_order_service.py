from __future__ import annotations

from typing import Any

import pytest

import order_service


def order_record(
    *,
    order_id: int = 1,
    status: str = "COLLECTING",
    version: int = 1,
    external_order_number: str | None = None,
    product_id: int | None = None,
    image_message_id: int | None = None,
    custom_text: str | None = None,
    review_reason_code: str | None = None,
) -> dict[str, Any]:
    return {
        "id": order_id,
        "seller_id": 11,
        "customer_id": 22,
        "product_id": product_id,
        "product_name_snapshot": None,
        "external_order_number": external_order_number,
        "customer_phone_snapshot": "+905551112244",
        "customer_note": None,
        "image_message_id": image_message_id,
        "custom_text": custom_text,
        "status": status,
        "review_reason_code": review_reason_code,
        "review_reason_note": None,
        "created_from_message_id": 101,
        "last_source_message_id": None,
        "version": version,
        "created_at": "2026-08-06T12:00:00+00:00",
        "updated_at": "2026-08-06T12:00:00+00:00",
        "completed_at": None,
        "closed_at": None,
    }


def product_record(product_id: int = 5) -> dict[str, Any]:
    return {
        "id": product_id,
        "seller_id": 11,
        "name": "Kişiselleştirilmiş Kupa",
        "is_active": True,
    }


def field_snapshot(
    *,
    snapshot_id: int = 7,
    field_key: str = "print_name",
    label: str = "Kupaya yazılacak isim",
    field_type: str = "short_text",
    is_required: bool = True,
    sort_order: int = 10,
    options: list[dict[str, Any]] | None = None,
    validation_config: dict[str, Any] | None = None,
    completed: bool = False,
    value: Any = None,
) -> dict[str, Any]:
    return {
        "id": snapshot_id,
        "source_definition_id": snapshot_id + 100,
        "definition_version": 1,
        "field_key": field_key,
        "label": label,
        "field_type": field_type,
        "is_required": is_required,
        "sort_order": sort_order,
        "options": options or [],
        "validation_config": validation_config or {},
        "value": value,
        "source_message_id": 105 if completed else None,
        "completed": completed,
    }


def successful_order_detail(
    *,
    order: dict[str, Any] | None = None,
    fields: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "order": order or order_record(),
        "fields": fields or [],
    }


# =====================================================
# FIELD TYPE DOĞRULAMA
# =====================================================

def test_short_text_validation() -> None:
    valid, value, error = order_service.validate_field_value(
        "short_text",
        "  Ali  ",
    )
    assert valid is True
    assert value == "Ali"
    assert error is None

    valid, _, error = order_service.validate_field_value("short_text", "  ")
    assert valid is False
    assert "boş" in error

    valid, _, error = order_service.validate_field_value(
        "short_text",
        "x" * 200,
    )
    assert valid is False
    assert "120" in error

    valid, _, error = order_service.validate_field_value(
        "short_text",
        "<script>",
    )
    assert valid is False
    assert "HTML" in error


def test_long_text_validation() -> None:
    valid, value, error = order_service.validate_field_value(
        "long_text",
        "  Uzun açıklama  ",
    )
    assert valid is True
    assert value == "Uzun açıklama"

    valid, _, error = order_service.validate_field_value(
        "long_text",
        "x" * 3000,
    )
    assert valid is False
    assert "2000" in error


def test_number_validation() -> None:
    valid, value, error = order_service.validate_field_value("number", 42)
    assert valid is True
    assert value == 42

    valid, value, error = order_service.validate_field_value("number", "42")
    assert valid is True
    assert value == 42.0

    valid, _, error = order_service.validate_field_value("number", True)
    assert valid is False
    assert "boolean" in error

    valid, _, error = order_service.validate_field_value(
        "number",
        5,
        validation_config={"min": 10},
    )
    assert valid is False
    assert "10" in error

    valid, _, error = order_service.validate_field_value(
        "number",
        50,
        validation_config={"max": 10},
    )
    assert valid is False
    assert "10" in error


def test_single_choice_validation() -> None:
    options = [
        {"value": "red", "label": "Kırmızı"},
        {"value": "blue", "label": "Mavi"},
    ]

    valid, value, error = order_service.validate_field_value(
        "single_choice",
        "red",
        options=options,
    )
    assert valid is True
    assert value == "red"

    valid, _, error = order_service.validate_field_value(
        "single_choice",
        "green",
        options=options,
    )
    assert valid is False
    assert "seçenek" in error


def test_multi_choice_validation() -> None:
    options = [
        {"value": "a", "label": "A"},
        {"value": "b", "label": "B"},
        {"value": "c", "label": "C"},
    ]

    valid, value, error = order_service.validate_field_value(
        "multi_choice",
        ["a", "b", "a"],
        options=options,
    )
    assert valid is True
    assert value == ["a", "b"]

    valid, _, error = order_service.validate_field_value(
        "multi_choice",
        ["a", "z"],
        options=options,
    )
    assert valid is False

    valid, _, error = order_service.validate_field_value(
        "multi_choice",
        ["a", "b", "c"],
        options=options,
        validation_config={"max_selections": 2},
    )
    assert valid is False
    assert "2" in error


def test_boolean_validation() -> None:
    valid, value, error = order_service.validate_field_value("boolean", True)
    assert valid is True
    assert value is True

    valid, value, error = order_service.validate_field_value("boolean", "evet")
    assert valid is True
    assert value is True

    valid, value, error = order_service.validate_field_value("boolean", "hayır")
    assert valid is True
    assert value is False

    valid, value, error = order_service.validate_field_value("boolean", "var")
    assert valid is True
    assert value is True

    valid, value, error = order_service.validate_field_value("boolean", "yok")
    assert valid is True
    assert value is False

    valid, _, error = order_service.validate_field_value("boolean", "belki")
    assert valid is False
    assert "anlaşılamadı" in error


def test_image_validation() -> None:
    valid, value, error = order_service.validate_field_value(
        "image",
        {"message_id": 105},
    )
    assert valid is True
    assert value == {"message_id": 105}

    valid, _, error = order_service.validate_field_value(
        "image",
        {"message_id": "105"},
    )
    assert valid is False

    valid, _, error = order_service.validate_field_value(
        "image",
        "https://example.com/image.jpg",
    )
    assert valid is False
    assert "mesaj referansı" in error


def test_unsupported_field_type() -> None:
    valid, _, error = order_service.validate_field_value("unknown", "x")
    assert valid is False
    assert "Desteklenmeyen" in error


# =====================================================
# CORE DEĞER DOĞRULAMA
# =====================================================

def test_validate_order_number() -> None:
    valid, value, error = order_service.validate_order_number("  ETSY-12345  ")
    assert valid is True
    assert value == "ETSY-12345"

    valid, _, error = order_service.validate_order_number("  ")
    assert valid is False

    valid, _, error = order_service.validate_order_number("x" * 200)
    assert valid is False
    assert "100" in error


def test_validate_phone_snapshot() -> None:
    valid, value, error = order_service.validate_phone_snapshot(" +905551112244 ")
    assert valid is True
    assert value == "+905551112244"

    valid, _, error = order_service.validate_phone_snapshot("  ")
    assert valid is False


def test_validate_customer_note() -> None:
    valid, value, error = order_service.validate_customer_note("  Not  ")
    assert valid is True
    assert value == "Not"

    valid, _, error = order_service.validate_customer_note("x" * 3000)
    assert valid is False
    assert "2000" in error


def test_validate_custom_text() -> None:
    valid, value, error = order_service.validate_custom_text("  Ali  ")
    assert valid is True
    assert value == "Ali"

    valid, _, error = order_service.validate_custom_text("x" * 2000)
    assert valid is False
    assert "1000" in error


# =====================================================
# SİPARİŞ SERVİSİ
# =====================================================

def test_get_or_create_order_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "get_or_create_active_order",
        lambda **kwargs: {
            "durum": "başarılı",
            "order": order_record(),
            "created": True,
        },
    )

    result = order_service.get_or_create_order(11, 22, 101)

    assert result["durum"] == "başarılı"
    assert result["order"]["id"] == 1
    assert result["created"] is True


def test_get_or_create_order_tenant_violation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "get_or_create_active_order",
        lambda **kwargs: {"durum": "reddedildi"},
    )

    result = order_service.get_or_create_order(11, 22, 101)

    assert result["durum"] == "hata"
    assert result["error_code"] == "order_tenant_scope_violation"


def test_get_or_create_order_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "get_or_create_active_order",
        lambda **kwargs: {"durum": "hata", "mesaj": "DB yok"},
    )

    result = order_service.get_or_create_order(11, 22, 101)

    assert result["durum"] == "hata"
    assert result["error_code"] == "order_unavailable"


def test_set_order_product_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "get_product_by_id",
        lambda seller_id, product_id: {
            "durum": "başarılı",
            "product": product_record(),
        },
    )
    monkeypatch.setattr(
        order_service,
        "set_order_product_and_snapshot_fields",
        lambda **kwargs: {
            "durum": "başarılı",
            "order": order_record(product_id=5),
            "snapshot_count": 3,
        },
    )

    result = order_service.set_order_product(11, 22, 1, 5)

    assert result["durum"] == "başarılı"
    assert result["snapshot_count"] == 3


def test_set_order_product_other_tenant(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "get_product_by_id",
        lambda seller_id, product_id: {"durum": "bulunamadı"},
    )

    result = order_service.set_order_product(11, 22, 1, 99)

    assert result["durum"] == "hata"
    assert result["error_code"] == "product_not_found"


def test_set_order_product_change_requires_review(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "get_product_by_id",
        lambda seller_id, product_id: {
            "durum": "başarılı",
            "product": product_record(),
        },
    )
    monkeypatch.setattr(
        order_service,
        "set_order_product_and_snapshot_fields",
        lambda **kwargs: {
            "durum": "ürün_değişikliği_inceleme_gerekli",
            "order": order_record(),
            "mesaj": "Değer toplandı.",
        },
    )

    result = order_service.set_order_product(11, 22, 1, 5)

    assert result["durum"] == "ürün_değişikliği_inceleme_gerekli"


def test_record_field_value_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "record_order_field_value",
        lambda **kwargs: {
            "durum": "başarılı",
            "order": order_record(),
            "changed": True,
            "completed": False,
        },
    )

    result = order_service.record_field_value(
        11,
        22,
        1,
        7,
        "short_text",
        "Ali",
        105,
    )

    assert result["durum"] == "başarılı"
    assert result["changed"] is True


def test_record_field_value_validation_error() -> None:
    result = order_service.record_field_value(
        11,
        22,
        1,
        7,
        "short_text",
        "  ",
        105,
    )

    assert result["durum"] == "doğrulama_hatası"


def test_record_field_value_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "record_order_field_value",
        lambda **kwargs: {
            "durum": "başarılı",
            "order": order_record(),
            "changed": False,
            "idempotent": True,
        },
    )

    result = order_service.record_field_value(
        11,
        22,
        1,
        7,
        "short_text",
        "Ali",
        105,
    )

    assert result["durum"] == "başarılı"
    assert result["idempotent"] is True


def test_record_field_value_tenant_violation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "record_order_field_value",
        lambda **kwargs: {"durum": "reddedildi"},
    )

    result = order_service.record_field_value(
        11,
        22,
        1,
        7,
        "short_text",
        "Ali",
        105,
    )

    assert result["durum"] == "hata"
    assert result["error_code"] == "order_tenant_scope_violation"


def test_update_core_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "update_order_core",
        lambda **kwargs: {
            "durum": "başarılı",
            "order": order_record(external_order_number="ETSY-12345"),
            "changed": True,
            "completed": False,
        },
    )

    result = order_service.update_core(
        11,
        22,
        1,
        external_order_number="ETSY-12345",
    )

    assert result["durum"] == "başarılı"
    assert result["changed"] is True


def test_update_core_validation_error() -> None:
    result = order_service.update_core(
        11,
        22,
        1,
        external_order_number="  ",
    )

    assert result["durum"] == "doğrulama_hatası"


def test_update_core_conflict(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "update_order_core",
        lambda **kwargs: {
            "durum": "çakışma",
            "order": order_record(version=3),
            "mesaj": "Sipariş değişti.",
        },
    )

    result = order_service.update_core(
        11,
        22,
        1,
        external_order_number="ETSY-12345",
    )

    assert result["durum"] == "çakışma"
    assert result["order"]["version"] == 3


def test_flag_for_review_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "flag_order_review",
        lambda **kwargs: {
            "durum": "başarılı",
            "order": order_record(
                status="SELLER_REVIEW_REQUIRED",
                review_reason_code="product_changed",
            ),
        },
    )

    result = order_service.flag_for_review(
        11,
        22,
        1,
        "product_changed",
    )

    assert result["durum"] == "başarılı"
    assert result["order"]["status"] == "SELLER_REVIEW_REQUIRED"


def test_get_order_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "get_order_by_id",
        lambda seller_id, order_id: {"durum": "bulunamadı"},
    )

    result = order_service.get_order(11, 99)

    assert result["durum"] == "bulunamadı"


def test_get_order_with_fields_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "get_order_detail",
        lambda seller_id, order_id: {
            "durum": "başarılı",
            "order": order_record(),
            "fields": [],
        },
    )

    result = order_service.get_order_with_fields(11, 1)

    assert result["durum"] == "başarılı"
    assert result["fields"] == []


def test_list_seller_orders_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "list_orders",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": 1,
            "orders": [order_record()],
        },
    )

    result = order_service.list_seller_orders(11, view="all")

    assert result["durum"] == "başarılı"
    assert result["toplam"] == 1


def test_list_seller_orders_validation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "list_orders",
        lambda *args, **kwargs: {
            "durum": "doğrulama_hatası",
            "mesaj": "view değeri geçersiz.",
        },
    )

    result = order_service.list_seller_orders(11, view="invalid")

    assert result["durum"] == "doğrulama_hatası"


def test_get_field_definition_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "get_order_field_definition_by_id",
        lambda seller_id, field_id: {
            "durum": "başarılı",
            "definition": {"id": 1, "seller_id": 11},
        },
    )

    result = order_service.get_field_definition(11, 1)

    assert result["durum"] == "başarılı"
    assert result["definition"]["id"] == 1


def test_get_field_definition_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "get_order_field_definition_by_id",
        lambda seller_id, field_id: {"durum": "bulunamadı"},
    )

    result = order_service.get_field_definition(11, 99)

    assert result["durum"] == "bulunamadı"

# =====================================================
# COLLECTION ANSWER PARSING
# =====================================================

def test_parse_collection_short_text() -> None:
    result = order_service.parse_collection_field_answer(
        field_snapshot(),
        "  Ali  ",
    )

    assert result == {"durum": "başarılı", "value": "Ali"}


def test_parse_collection_number() -> None:
    result = order_service.parse_collection_field_answer(
        field_snapshot(field_type="number"),
        "25",
    )

    assert result["durum"] == "başarılı"
    assert result["value"] == 25.0


def test_parse_collection_boolean() -> None:
    result = order_service.parse_collection_field_answer(
        field_snapshot(field_type="boolean"),
        "Evet",
    )

    assert result == {"durum": "başarılı", "value": True}


def test_parse_collection_single_choice_accepts_value_and_label() -> None:
    field = field_snapshot(
        field_type="single_choice",
        options=[
            {"value": "red", "label": "Kırmızı"},
            {"value": "black", "label": "Siyah"},
        ],
    )

    by_value = order_service.parse_collection_field_answer(field, "BLACK")
    by_label = order_service.parse_collection_field_answer(field, "SİYAH")

    assert by_value == {"durum": "başarılı", "value": "black"}
    assert by_label == {"durum": "başarılı", "value": "black"}


def test_parse_collection_single_choice_rejects_ambiguous_label() -> None:
    field = field_snapshot(
        field_type="single_choice",
        options=[
            {"value": "first", "label": "Aynı"},
            {"value": "second", "label": "Aynı"},
        ],
    )

    result = order_service.parse_collection_field_answer(field, "aynı")

    assert result["durum"] == "doğrulama_hatası"
    assert "birden fazla" in result["mesaj"]


def test_parse_collection_multi_choice_maps_labels_and_deduplicates() -> None:
    field = field_snapshot(
        field_type="multi_choice",
        options=[
            {"value": "black", "label": "Siyah"},
            {"value": "white", "label": "Beyaz"},
        ],
    )

    result = order_service.parse_collection_field_answer(
        field,
        "Siyah, Beyaz; siyah",
    )

    assert result == {
        "durum": "başarılı",
        "value": ["black", "white"],
    }


def test_parse_collection_multi_choice_rejects_empty() -> None:
    result = order_service.parse_collection_field_answer(
        field_snapshot(
            field_type="multi_choice",
            options=[{"value": "black", "label": "Siyah"}],
        ),
        "   ",
    )

    assert result["durum"] == "doğrulama_hatası"
    assert "En az bir seçim" in result["mesaj"]


def test_parse_collection_image_requires_message_reference() -> None:
    field = field_snapshot(field_type="image")

    valid = order_service.parse_collection_field_answer(
        field,
        {"message_id": 901},
    )
    invalid = order_service.parse_collection_field_answer(
        field,
        "https://example.com/photo.jpg",
    )

    assert valid == {"durum": "başarılı", "value": {"message_id": 901}}
    assert invalid["durum"] == "doğrulama_hatası"


# =====================================================
# DETERMINISTIC COLLECTION QUESTIONS
# =====================================================

def test_build_collection_question_short_text_uses_snapshot_label() -> None:
    result = order_service.build_collection_question(field_snapshot())

    assert result["durum"] == "başarılı"
    assert "Kupaya yazılacak isim" in result["question"]


def test_build_collection_question_single_choice_uses_option_labels() -> None:
    result = order_service.build_collection_question(
        field_snapshot(
            field_type="single_choice",
            label="Renk",
            options=[
                {"value": "red", "label": "Kırmızı"},
                {"value": "black", "label": "Siyah"},
            ],
        )
    )

    assert result["durum"] == "başarılı"
    assert "Kırmızı" in result["question"]
    assert "Siyah" in result["question"]
    assert "red" not in result["question"]


def test_build_collection_question_boolean() -> None:
    result = order_service.build_collection_question(
        field_snapshot(field_type="boolean", label="Hediye paketi"),
    )

    assert result["durum"] == "başarılı"
    assert "evet veya hayır" in result["question"]


def test_build_collection_question_image() -> None:
    result = order_service.build_collection_question(
        field_snapshot(field_type="image", label="Ek görsel"),
    )

    assert result["durum"] == "başarılı"
    assert "görselini" in result["question"]


def test_build_collection_question_rejects_unsupported_type() -> None:
    result = order_service.build_collection_question(
        field_snapshot(field_type="unsupported"),
    )

    assert result["durum"] == "doğrulama_hatası"


# =====================================================
# COLLECTION ORCHESTRATION WRAPPERS
# =====================================================

def test_initialize_collection_uses_015_wrapper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, Any]] = []

    def fake_initialize(**kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs)
        return {
            "durum": "başarılı",
            "order": order_record(),
            "created": True,
            "changed": True,
            "idempotent": False,
            "snapshot_count": 2,
        }

    monkeypatch.setattr(order_service, "initialize_order_collection", fake_initialize)

    result = order_service.initialize_collection(11, 22, 101)

    assert result["durum"] == "başarılı"
    assert result["snapshot_count"] == 2
    assert calls == [
        {"seller_id": 11, "customer_id": 22, "source_message_id": 101}
    ]


def test_initialize_collection_normalizes_tenant_rejection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "initialize_order_collection",
        lambda **kwargs: {"durum": "reddedildi"},
    )

    result = order_service.initialize_collection(11, 22, 101)

    assert result["durum"] == "hata"
    assert result["error_code"] == "order_tenant_scope_violation"


def test_initialize_collection_normalizes_db_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "initialize_order_collection",
        lambda **kwargs: {"durum": "hata", "mesaj": "DB yok"},
    )

    result = order_service.initialize_collection(11, 22, 101)

    assert result["durum"] == "hata"
    assert result["error_code"] == "order_unavailable"


def test_update_core_from_message_uses_source_aware_wrapper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, Any]] = []

    def fake_update(**kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs)
        return {
            "durum": "başarılı",
            "order": order_record(external_order_number="ETSY-42"),
            "changed": True,
            "completed": False,
            "idempotent": False,
        }

    monkeypatch.setattr(order_service, "update_order_core_from_message", fake_update)

    result = order_service.update_core_from_message(
        11,
        22,
        1,
        105,
        external_order_number="  ETSY-42  ",
        expected_version=3,
    )

    assert result["durum"] == "başarılı"
    assert calls[0]["source_message_id"] == 105
    assert calls[0]["external_order_number"] == "ETSY-42"
    assert calls[0]["expected_version"] == 3


def test_update_core_from_message_preserves_idempotent_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "update_order_core_from_message",
        lambda **kwargs: {
            "durum": "başarılı",
            "order": order_record(),
            "changed": False,
            "completed": False,
            "idempotent": True,
        },
    )

    result = order_service.update_core_from_message(11, 22, 1, 105)

    assert result["durum"] == "başarılı"
    assert result["changed"] is False
    assert result["idempotent"] is True


def test_update_core_from_message_preserves_conflict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "update_order_core_from_message",
        lambda **kwargs: {
            "durum": "çakışma",
            "order": order_record(version=9),
            "mesaj": "Sipariş değişti.",
        },
    )

    result = order_service.update_core_from_message(
        11,
        22,
        1,
        105,
        custom_text="Ali",
        expected_version=8,
    )

    assert result["durum"] == "çakışma"
    assert result["order"]["version"] == 9


# =====================================================
# NEXT COLLECTION STEP
# =====================================================

def test_next_step_order_number_does_not_need_seller_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "get_order_detail",
        lambda seller_id, order_id: successful_order_detail(),
    )
    monkeypatch.setattr(
        order_service,
        "get_seller_product_info",
        lambda seller_id: pytest.fail("config should not be read yet"),
    )

    result = order_service.get_next_collection_step(11, 1)

    assert result["durum"] == "başarılı"
    assert result["step"] == "order_number"


def test_next_step_image_is_always_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "get_order_detail",
        lambda seller_id, order_id: successful_order_detail(
            order=order_record(external_order_number="ETSY-42"),
        ),
    )
    monkeypatch.setattr(
        order_service,
        "get_seller_product_info",
        lambda seller_id: pytest.fail("config should not be read before image"),
    )

    result = order_service.get_next_collection_step(11, 1)

    assert result["step"] == "image"


def test_next_step_custom_text_only_when_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "get_order_detail",
        lambda seller_id, order_id: successful_order_detail(
            order=order_record(
                external_order_number="ETSY-42",
                image_message_id=110,
            ),
        ),
    )
    monkeypatch.setattr(
        order_service,
        "get_seller_product_info",
        lambda seller_id: {
            "durum": "başarılı",
            "product_info": {"order": {"custom_text_required": True}},
        },
    )

    result = order_service.get_next_collection_step(11, 1)

    assert result["step"] == "custom_text"


def test_next_step_skips_optional_custom_text_and_optional_dynamic_field(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fields = [
        field_snapshot(
            snapshot_id=7,
            field_key="gift_note",
            label="Hediye notu",
            is_required=False,
            completed=False,
        ),
        field_snapshot(
            snapshot_id=8,
            field_key="print_name",
            label="İsim",
            is_required=True,
            completed=False,
        ),
    ]
    monkeypatch.setattr(
        order_service,
        "get_order_detail",
        lambda seller_id, order_id: successful_order_detail(
            order=order_record(
                external_order_number="ETSY-42",
                image_message_id=110,
            ),
            fields=fields,
        ),
    )
    monkeypatch.setattr(
        order_service,
        "get_seller_product_info",
        lambda seller_id: {
            "durum": "başarılı",
            "product_info": {"order": {"custom_text_required": False}},
        },
    )

    result = order_service.get_next_collection_step(11, 1)

    assert result["step"] == "dynamic_field"
    assert result["field"]["id"] == 8
    assert result["field"]["field_key"] == "print_name"


def test_next_step_uses_snapshot_sort_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fields = [
        field_snapshot(snapshot_id=20, field_key="second", sort_order=20),
        field_snapshot(snapshot_id=10, field_key="first", sort_order=10),
    ]
    monkeypatch.setattr(
        order_service,
        "get_order_detail",
        lambda seller_id, order_id: successful_order_detail(
            order=order_record(
                external_order_number="ETSY-42",
                image_message_id=110,
            ),
            fields=fields,
        ),
    )
    monkeypatch.setattr(
        order_service,
        "get_seller_product_info",
        lambda seller_id: {
            "durum": "başarılı",
            "product_info": {"order": {"custom_text_required": False}},
        },
    )

    result = order_service.get_next_collection_step(11, 1)

    assert result["field"]["field_key"] == "first"


def test_next_step_skips_completed_required_field(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fields = [
        field_snapshot(
            snapshot_id=10,
            field_key="first",
            sort_order=10,
            completed=True,
            value="Ali",
        ),
        field_snapshot(snapshot_id=20, field_key="second", sort_order=20),
    ]
    monkeypatch.setattr(
        order_service,
        "get_order_detail",
        lambda seller_id, order_id: successful_order_detail(
            order=order_record(
                external_order_number="ETSY-42",
                image_message_id=110,
            ),
            fields=fields,
        ),
    )
    monkeypatch.setattr(
        order_service,
        "get_seller_product_info",
        lambda seller_id: {
            "durum": "başarılı",
            "product_info": {"order": {"custom_text_required": False}},
        },
    )

    result = order_service.get_next_collection_step(11, 1)

    assert result["field"]["field_key"] == "second"


def test_next_step_complete_when_all_required_data_exists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "get_order_detail",
        lambda seller_id, order_id: successful_order_detail(
            order=order_record(
                external_order_number="ETSY-42",
                image_message_id=110,
            ),
            fields=[
                field_snapshot(completed=True, value="Ali"),
                field_snapshot(
                    snapshot_id=8,
                    field_key="optional_note",
                    is_required=False,
                    completed=False,
                ),
            ],
        ),
    )
    monkeypatch.setattr(
        order_service,
        "get_seller_product_info",
        lambda seller_id: {
            "durum": "başarılı",
            "product_info": {"order": {"custom_text_required": False}},
        },
    )

    result = order_service.get_next_collection_step(11, 1)

    assert result["complete"] is True
    assert result["step"] == "complete"


def test_next_step_complete_status_short_circuits_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "get_order_detail",
        lambda seller_id, order_id: successful_order_detail(
            order=order_record(status="COMPLETE"),
        ),
    )
    monkeypatch.setattr(
        order_service,
        "get_seller_product_info",
        lambda seller_id: pytest.fail("complete order should not read config"),
    )

    result = order_service.get_next_collection_step(11, 1)

    assert result["complete"] is True
    assert result["step"] == "complete"


def test_next_step_seller_review_is_blocked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "get_order_detail",
        lambda seller_id, order_id: successful_order_detail(
            order=order_record(status="SELLER_REVIEW_REQUIRED"),
        ),
    )

    result = order_service.get_next_collection_step(11, 1)

    assert result["step"] == "seller_review_required"
    assert result["blocked"] is True


def test_next_step_fails_closed_when_config_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "get_order_detail",
        lambda seller_id, order_id: successful_order_detail(
            order=order_record(
                external_order_number="ETSY-42",
                image_message_id=110,
            ),
        ),
    )
    monkeypatch.setattr(
        order_service,
        "get_seller_product_info",
        lambda seller_id: {"durum": "hata", "mesaj": "DB yok"},
    )

    result = order_service.get_next_collection_step(11, 1)

    assert result["durum"] == "hata"
    assert result["error_code"] == "order_config_unavailable"


def test_next_step_fails_closed_for_invalid_required_field_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "get_order_detail",
        lambda seller_id, order_id: successful_order_detail(
            order=order_record(
                external_order_number="ETSY-42",
                image_message_id=110,
            ),
            fields=[field_snapshot(field_type="unsupported")],
        ),
    )
    monkeypatch.setattr(
        order_service,
        "get_seller_product_info",
        lambda seller_id: {
            "durum": "başarılı",
            "product_info": {"order": {"custom_text_required": False}},
        },
    )

    result = order_service.get_next_collection_step(11, 1)

    assert result["durum"] == "hata"
    assert result["error_code"] == "order_field_configuration_invalid"

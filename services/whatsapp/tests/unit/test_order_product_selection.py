from __future__ import annotations

from typing import Any

import pytest

import order_service


def products(*names: str) -> list[dict[str, Any]]:
    return [
        {"id": index + 1, "name": name}
        for index, name in enumerate(names)
    ]


def test_zero_active_products_keeps_legacy_decision(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "list_seller_products",
        lambda seller_id, include_inactive=False: {
            "ok": True,
            "products": [],
            "total": 0,
        },
    )
    result = order_service.resolve_new_order_product_decision(11)
    assert result["decision"] == "none"
    assert result["products"] == []


def test_one_active_product_is_single_decision(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "list_seller_products",
        lambda seller_id, include_inactive=False: {
            "ok": True,
            "products": [{"id": 5, "name": "Kupa", "is_active": True}],
            "total": 1,
        },
    )
    result = order_service.resolve_new_order_product_decision(11)
    assert result["decision"] == "single"
    assert result["product"] == {"id": 5, "name": "Kupa"}


def test_multiple_active_products_require_selection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "list_seller_products",
        lambda seller_id, include_inactive=False: {
            "ok": True,
            "products": [
                {"id": 5, "name": "Kupa", "is_active": True},
                {"id": 8, "name": "Termos", "is_active": True},
            ],
            "total": 2,
        },
    )
    result = order_service.resolve_new_order_product_decision(11)
    assert result["decision"] == "multiple"
    assert [row["id"] for row in result["products"]] == [5, 8]


def test_product_list_failure_is_fail_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "list_seller_products",
        lambda seller_id, include_inactive=False: {
            "ok": False,
            "error": {"message": "Ürünler getirilemedi."},
            "kind": "unavailable",
        },
    )
    result = order_service.resolve_new_order_product_decision(11)
    assert result["durum"] == "hata"
    assert result["error_code"] == "order_product_list_unavailable"


def test_inactive_rows_are_excluded_from_selection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        order_service,
        "list_seller_products",
        lambda seller_id, include_inactive=False: {
            "ok": True,
            "products": [
                {"id": 5, "name": "Kupa", "is_active": True},
                {"id": 9, "name": "Eski", "is_active": False},
            ],
            "total": 2,
        },
    )
    result = order_service.list_active_order_products(11)
    assert result["products"] == [{"id": 5, "name": "Kupa"}]


def test_numeric_choice_resolves_current_list_index() -> None:
    result = order_service.match_order_product_selection("2", products("Kupa", "Termos"))
    assert result["durum"] == "başarılı"
    assert result["product"]["name"] == "Termos"


def test_invalid_number_does_not_match() -> None:
    result = order_service.match_order_product_selection("0", products("Kupa", "Termos"))
    assert result["durum"] == "eşleşmedi"


def test_exact_normalized_name_matches() -> None:
    result = order_service.match_order_product_selection(
        "  kupa  ",
        products("Kupa", "Termos"),
    )
    assert result["product"]["name"] == "Kupa"


def test_turkish_casefold_name_matches() -> None:
    result = order_service.match_order_product_selection(
        "İNCİ KUPA",
        products("inci kupa", "Termos"),
    )
    assert result["durum"] == "başarılı"


def test_partial_name_is_not_guessed() -> None:
    result = order_service.match_order_product_selection("Kup", products("Kupa", "Termos"))
    assert result["durum"] == "eşleşmedi"


def test_ambiguous_identical_names_are_not_chosen() -> None:
    result = order_service.match_order_product_selection(
        "Kupa",
        [{"id": 1, "name": "Kupa"}, {"id": 2, "name": "kupa"}],
    )
    assert result["durum"] == "eşleşmedi"


def test_selection_question_is_deterministic() -> None:
    question = order_service.build_product_selection_question(products("Kupa", "Termos"))
    assert question == (
        "Bu sipariş hangi ürün için?\n"
        "1. Kupa\n"
        "2. Termos\n"
        "\n"
        "Ürün adını veya sıra numarasını yazabilirsiniz."
    )


def test_set_order_product_other_tenant_still_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        order_service,
        "get_product_by_id",
        lambda seller_id, product_id: {"durum": "bulunamadı"},
    )
    result = order_service.set_order_product(11, 22, 1, 99)
    assert result["error_code"] == "product_not_found"

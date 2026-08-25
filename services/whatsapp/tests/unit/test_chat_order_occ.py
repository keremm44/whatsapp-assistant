from __future__ import annotations

from typing import Any

import chat_service.dependencies as deps


def test_core_update_threads_version_from_authoritative_step(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        deps,
        "_order_get_next_collection_step",
        lambda seller_id, order_id: {
            "durum": "başarılı",
            "step": "order_number",
            "order": {"id": order_id, "version": 7},
        },
    )
    monkeypatch.setattr(
        deps,
        "_order_update_core_from_message",
        lambda **kwargs: calls.append(kwargs)
        or {"durum": "başarılı", "order": {"id": 33, "version": 8}},
    )

    result = deps.order_update_core_from_message(
        seller_id=2,
        customer_id=14,
        order_id=33,
        source_message_id=101,
        external_order_number="A-123",
    )

    assert result["durum"] == "başarılı"
    assert calls[0]["expected_version"] == 7


def test_core_update_fails_closed_when_step_changed(monkeypatch) -> None:
    monkeypatch.setattr(
        deps,
        "_order_get_next_collection_step",
        lambda seller_id, order_id: {
            "durum": "başarılı",
            "step": "image",
            "order": {"id": order_id, "version": 8},
        },
    )
    monkeypatch.setattr(
        deps,
        "_order_update_core_from_message",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("mutation must not run")),
    )

    result = deps.order_update_core_from_message(
        seller_id=2,
        customer_id=14,
        order_id=33,
        source_message_id=101,
        external_order_number="A-123",
    )

    assert result["durum"] == "çakışma"
    assert result["order"]["version"] == 8


def test_dynamic_field_threads_version_and_field_identity(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        deps,
        "_order_get_next_collection_step",
        lambda seller_id, order_id: {
            "durum": "başarılı",
            "step": "dynamic_field",
            "field": {"id": 55},
            "order": {"id": order_id, "version": 12},
        },
    )
    monkeypatch.setattr(
        deps,
        "_order_record_field_value",
        lambda **kwargs: calls.append(kwargs)
        or {"durum": "başarılı", "order": {"id": 33, "version": 13}},
    )

    result = deps.order_record_field_value(
        seller_id=2,
        customer_id=14,
        order_id=33,
        field_snapshot_id=55,
        field_type="short_text",
        value="Mavi",
        source_message_id=101,
    )

    assert result["durum"] == "başarılı"
    assert calls[0]["expected_version"] == 12


def test_dynamic_field_rejects_stale_field_pointer(monkeypatch) -> None:
    monkeypatch.setattr(
        deps,
        "_order_get_next_collection_step",
        lambda seller_id, order_id: {
            "durum": "başarılı",
            "step": "dynamic_field",
            "field": {"id": 56},
            "order": {"id": order_id, "version": 12},
        },
    )
    monkeypatch.setattr(
        deps,
        "_order_record_field_value",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("mutation must not run")),
    )

    result = deps.order_record_field_value(
        seller_id=2,
        customer_id=14,
        order_id=33,
        field_snapshot_id=55,
        field_type="short_text",
        value="Mavi",
        source_message_id=101,
    )

    assert result["durum"] == "çakışma"


def test_product_assignment_uses_current_unassigned_order_version(monkeypatch) -> None:
    calls: list[tuple[Any, ...]] = []
    monkeypatch.setattr(
        deps,
        "_order_get_order",
        lambda seller_id, order_id: {
            "durum": "başarılı",
            "order": {
                "id": order_id,
                "customer_id": 14,
                "status": "COLLECTING",
                "product_id": None,
                "version": 5,
            },
        },
    )
    monkeypatch.setattr(
        deps,
        "_order_set_order_product",
        lambda *args, **kwargs: calls.append((*args, kwargs))
        or {"durum": "başarılı", "order": {"id": 33, "version": 6}},
    )

    result = deps.order_set_order_product(2, 14, 33, 9)

    assert result["durum"] == "başarılı"
    assert calls[0][-1]["expected_version"] == 5


def test_product_assignment_rejects_order_changed_by_other_actor(monkeypatch) -> None:
    monkeypatch.setattr(
        deps,
        "_order_get_order",
        lambda seller_id, order_id: {
            "durum": "başarılı",
            "order": {
                "id": order_id,
                "customer_id": 14,
                "status": "COLLECTING",
                "product_id": 88,
                "version": 6,
            },
        },
    )
    monkeypatch.setattr(
        deps,
        "_order_set_order_product",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("mutation must not run")),
    )

    result = deps.order_set_order_product(2, 14, 33, 9)

    assert result["durum"] == "çakışma"
    assert result["order"]["product_id"] == 88


def test_explicit_order_version_is_preserved(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        deps,
        "_order_get_next_collection_step",
        lambda *_args: (_ for _ in ()).throw(AssertionError("extra read must not run")),
    )
    monkeypatch.setattr(
        deps,
        "_order_update_core_from_message",
        lambda **kwargs: calls.append(kwargs) or {"durum": "başarılı"},
    )

    result = deps.order_update_core_from_message(
        seller_id=2,
        customer_id=14,
        order_id=33,
        source_message_id=101,
        external_order_number="A-123",
        expected_version=4,
    )

    assert result["durum"] == "başarılı"
    assert calls[0]["expected_version"] == 4

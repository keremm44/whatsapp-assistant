from __future__ import annotations

import pytest

from database import (
    create_order_field_definition,
    get_order_detail,
    initialize_order_collection,
    record_order_field_value,
    update_order_core_from_message,
)


pytestmark = [pytest.mark.integration, pytest.mark.integration_v2]


def test_order_collection_idempotency_completion_and_tenant_scope(integration_context) -> None:
    ctx = integration_context
    primary = ctx.tenant("primary")
    secondary = ctx.tenant("secondary")

    definition = create_order_field_definition(
        primary.seller_id,
        field_key=f"integration_text_{ctx.run_id}",
        label="Integration text",
        field_type="short_text",
        is_required=True,
        sort_order=10,
        validation_config={"max_length": 200},
    )
    assert definition["durum"] == "başarılı"

    init_message = ctx.new_message(content="Sipariş verdim")
    initialized = initialize_order_collection(
        primary.seller_id,
        primary.customer_id,
        int(init_message["id"]),
    )
    assert initialized["durum"] == "başarılı"
    assert initialized["created"] is True
    assert initialized["snapshot_count"] == 1
    order = initialized["order"]
    order_id = int(order["id"])
    assert order["status"] == "COLLECTING"

    duplicate_init = initialize_order_collection(
        primary.seller_id,
        primary.customer_id,
        int(init_message["id"]),
    )
    assert duplicate_init["durum"] == "başarılı"
    assert duplicate_init["created"] is False
    assert duplicate_init["order"]["id"] == order_id

    second_init_message = ctx.new_message(content="Aynı konuşmada tekrar sipariş başlangıcı")
    still_same_active = initialize_order_collection(
        primary.seller_id,
        primary.customer_id,
        int(second_init_message["id"]),
    )
    assert still_same_active["durum"] == "başarılı"
    assert still_same_active["created"] is False
    assert still_same_active["order"]["id"] == order_id

    detail = get_order_detail(primary.seller_id, order_id)
    assert detail["durum"] == "başarılı"
    assert len(detail["fields"]) == 1
    snapshot_id = int(detail["fields"][0]["id"])

    number_message = ctx.new_message(content="ORDER-INT-001")
    number_update = update_order_core_from_message(
        primary.seller_id,
        primary.customer_id,
        order_id,
        int(number_message["id"]),
        external_order_number="ORDER-INT-001",
        expected_version=int(order["version"]),
    )
    assert number_update["durum"] == "başarılı"
    assert number_update["changed"] is True
    assert number_update["order"]["external_order_number"] == "ORDER-INT-001"
    current_version = int(number_update["order"]["version"])

    stale_message = ctx.new_message(content="stale update")
    stale = update_order_core_from_message(
        primary.seller_id,
        primary.customer_id,
        order_id,
        int(stale_message["id"]),
        customer_note="stale should not persist",
        expected_version=int(order["version"]),
    )
    assert stale["durum"] == "çakışma"

    wrong_image_message = ctx.new_message(content="Bu görsel değil", message_type="text")
    wrong_image = update_order_core_from_message(
        primary.seller_id,
        primary.customer_id,
        order_id,
        int(wrong_image_message["id"]),
        image_message_id=int(wrong_image_message["id"]),
        expected_version=current_version,
    )
    assert wrong_image["durum"] == "reddedildi"

    image_message = ctx.new_message(content="ürün görseli", message_type="image")
    image_update = update_order_core_from_message(
        primary.seller_id,
        primary.customer_id,
        order_id,
        int(image_message["id"]),
        image_message_id=int(image_message["id"]),
        expected_version=current_version,
    )
    assert image_update["durum"] == "başarılı"
    assert image_update["order"]["image_message_id"] == int(image_message["id"])
    current_version = int(image_update["order"]["version"])

    field_message = ctx.new_message(content="Kişiselleştirme değeri")
    field_value = record_order_field_value(
        primary.seller_id,
        primary.customer_id,
        order_id,
        snapshot_id,
        "Kişiselleştirme değeri",
        int(field_message["id"]),
        expected_version=current_version,
    )
    assert field_value["durum"] == "başarılı"
    assert field_value["changed"] is True
    assert field_value["completed"] is True
    assert field_value["order"]["status"] == "COMPLETE"

    completed_version = int(field_value["order"]["version"])
    duplicate_field = record_order_field_value(
        primary.seller_id,
        primary.customer_id,
        order_id,
        snapshot_id,
        "Kişiselleştirme değeri",
        int(field_message["id"]),
        expected_version=completed_version,
    )
    assert duplicate_field["durum"] == "başarılı"
    assert duplicate_field["idempotent"] is True
    assert duplicate_field["changed"] is False

    cross_message = ctx.new_message(
        "secondary",
        content="cross tenant order attempt",
    )
    cross_tenant = update_order_core_from_message(
        secondary.seller_id,
        secondary.customer_id,
        order_id,
        int(cross_message["id"]),
        customer_note="must not persist",
    )
    assert cross_tenant["durum"] == "bulunamadı"

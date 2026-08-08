from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration_v2


def test_seller_product_crud_is_versioned_and_tenant_scoped(integration_context) -> None:
    ctx = integration_context
    primary = ctx.tenant("primary")
    secondary = ctx.tenant("secondary")
    name = f"Integration Product {ctx.run_id}"

    created = ctx.client.rpc(
        "create_seller_product",
        {"target_seller_id": primary.seller_id, "name_value": name},
    ).execute().data
    assert created["status"] == "success"
    product = created["product"]
    product_id = product["id"]
    assert product["version"] == 1
    assert product["is_active"] is True

    duplicate = ctx.client.rpc(
        "create_seller_product",
        {"target_seller_id": primary.seller_id, "name_value": f"  {name.upper()}  "},
    ).execute().data
    assert duplicate == {"status": "conflict", "reason": "duplicate_name"}

    secondary_same_name = ctx.client.rpc(
        "create_seller_product",
        {"target_seller_id": secondary.seller_id, "name_value": name},
    ).execute().data
    assert secondary_same_name["status"] == "success"

    primary_list = ctx.client.rpc(
        "get_seller_products",
        {"target_seller_id": primary.seller_id, "include_inactive": False},
    ).execute().data
    assert primary_list["status"] == "success"
    assert any(item["id"] == product_id for item in primary_list["products"])

    cross_tenant_update = ctx.client.rpc(
        "update_seller_product",
        {
            "target_seller_id": secondary.seller_id,
            "target_product_id": product_id,
            "expected_version": 1,
            "name_value": "Cross tenant write",
            "is_active_value": None,
        },
    ).execute().data
    assert cross_tenant_update == {"status": "not_found"}

    updated = ctx.client.rpc(
        "update_seller_product",
        {
            "target_seller_id": primary.seller_id,
            "target_product_id": product_id,
            "expected_version": 1,
            "name_value": f"{name} Updated",
            "is_active_value": None,
        },
    ).execute().data
    assert updated["status"] == "success"
    assert updated["changed"] is True
    assert updated["product"]["version"] == 2

    stale = ctx.client.rpc(
        "update_seller_product",
        {
            "target_seller_id": primary.seller_id,
            "target_product_id": product_id,
            "expected_version": 1,
            "name_value": "Stale write",
            "is_active_value": None,
        },
    ).execute().data
    assert stale["status"] == "conflict"
    assert stale["reason"] == "stale_version"
    assert stale["current_version"] == 2

    disabled = ctx.client.rpc(
        "update_seller_product",
        {
            "target_seller_id": primary.seller_id,
            "target_product_id": product_id,
            "expected_version": 2,
            "name_value": None,
            "is_active_value": False,
        },
    ).execute().data
    assert disabled["status"] == "success"
    assert disabled["product"]["is_active"] is False
    assert disabled["product"]["version"] == 3

    active_only = ctx.client.rpc(
        "get_seller_products",
        {"target_seller_id": primary.seller_id, "include_inactive": False},
    ).execute().data
    assert all(item["id"] != product_id for item in active_only["products"])

    with_inactive = ctx.client.rpc(
        "get_seller_products",
        {"target_seller_id": primary.seller_id, "include_inactive": True},
    ).execute().data
    assert any(item["id"] == product_id for item in with_inactive["products"])

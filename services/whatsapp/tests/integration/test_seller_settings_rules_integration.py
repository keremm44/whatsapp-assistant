from __future__ import annotations

import pytest

from seller_settings_service import (
    SellerRuleCreateRequest,
    SellerRuleUpdateRequest,
    SellerSettingsUpdateRequest,
    create_rule,
    deactivate_rule,
    get_settings,
    list_rules,
    update_rule,
    update_settings,
)

pytestmark = pytest.mark.integration_v2


def test_seller_settings_and_rules_live_tenant_isolation(integration_context) -> None:
    primary = integration_context.tenant("primary")
    secondary = integration_context.tenant("secondary")

    initial = get_settings(primary.seller_id)
    assert initial["ok"] is True
    initial_version = initial["settings"]["version"]

    changed = update_settings(
        primary.seller_id,
        SellerSettingsUpdateRequest(
            expected_version=initial_version,
            business={"store_name": f"Integration Settings {integration_context.run_id}"},
        ),
    )
    assert changed["ok"] is True
    assert changed["settings"]["version"] == initial_version + 1

    stale = update_settings(
        primary.seller_id,
        SellerSettingsUpdateRequest(
            expected_version=initial_version,
            business={"name": "Stale write should fail"},
        ),
    )
    assert stale["ok"] is False
    assert stale["kind"] == "conflict"

    secondary_settings = get_settings(secondary.seller_id)
    assert secondary_settings["ok"] is True
    assert secondary_settings["settings"]["business"]["store_name"] != changed["settings"]["business"]["store_name"]

    created = create_rule(
        primary.seller_id,
        SellerRuleCreateRequest(
            trigger_text=f"integration trigger {integration_context.run_id}",
            response_text="Integration yanıtı",
            category="integration",
        ),
    )
    assert created["ok"] is True
    rule_id = created["rule"]["id"]
    assert created["rule"]["version"] == 1

    duplicate = create_rule(
        primary.seller_id,
        SellerRuleCreateRequest(
            trigger_text=f"INTEGRATION TRIGGER {integration_context.run_id}",
            response_text="Duplicate olmamalı",
            category="integration",
        ),
    )
    assert duplicate["ok"] is False
    assert duplicate["kind"] == "conflict"

    primary_rules = list_rules(primary.seller_id, active=True)
    secondary_rules = list_rules(secondary.seller_id, active=True)
    assert primary_rules["ok"] is True
    assert any(rule["id"] == rule_id for rule in primary_rules["rules"])
    assert secondary_rules["ok"] is True
    assert all(rule["id"] != rule_id for rule in secondary_rules["rules"])

    updated = update_rule(
        primary.seller_id,
        rule_id,
        SellerRuleUpdateRequest(expected_version=1, response_text="Güncel integration yanıtı"),
    )
    assert updated["ok"] is True
    assert updated["rule"]["version"] == 2

    stale_rule = update_rule(
        primary.seller_id,
        rule_id,
        SellerRuleUpdateRequest(expected_version=1, response_text="Stale rule update"),
    )
    assert stale_rule["ok"] is False
    assert stale_rule["kind"] == "conflict"

    deactivated = deactivate_rule(primary.seller_id, rule_id, 2)
    assert deactivated["ok"] is True
    assert deactivated["changed"] is True
    assert deactivated["rule"]["is_active"] is False

    no_active = list_rules(primary.seller_id, active=True)
    inactive = list_rules(primary.seller_id, active=False)
    assert all(rule["id"] != rule_id for rule in no_active["rules"])
    assert any(rule["id"] == rule_id for rule in inactive["rules"])

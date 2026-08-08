from pathlib import Path

SQL = Path("migrations/024_harden_seller_product_settings_contract.sql").read_text(encoding="utf-8")
LOWER = SQL.lower()


def test_024_is_present_and_records_live_canonical_metadata() -> None:
    assert "'024'" in SQL
    assert "harden_seller_product_settings_contract" in SQL
    assert "seller_product_settings_contract_v1" in SQL


def test_024_normalizes_legacy_023_metadata() -> None:
    assert "update public.schema_migrations" in LOWER
    assert "add_seller_rules_and_product_settings" in SQL
    assert "seller_rules_product_settings_v1" in SQL


def test_024_hardens_rule_and_settings_types() -> None:
    assert "settings_version type bigint" in LOWER
    assert "version type bigint" in LOWER
    assert "chk_rules_trigger_text_nonblank" in LOWER
    assert "chk_rules_response_text_nonblank" in LOWER
    assert "chk_rules_lengths" in LOWER
    assert "idx_rules_seller_active_updated" in LOWER


def test_024_matches_production_rpc_surface() -> None:
    for name in (
        "bump_seller_product_settings_version",
        "get_seller_rules",
        "create_seller_rule",
        "update_seller_rule",
        "delete_seller_rule",
        "get_seller_product_settings",
        "patch_seller_product_settings",
    ):
        assert f"function public.{name}" in LOWER


def test_024_hardens_runtime_permissions() -> None:
    assert "search_path = pg_catalog, public" in LOWER
    assert "from public, anon, authenticated" in LOWER
    assert "to service_role" in LOWER
    assert "security definer" not in LOWER


def test_024_does_not_mutate_business_rows() -> None:
    assert "delete from public.rules" not in LOWER
    assert "delete from public.sellers" not in LOWER
    assert "truncate" not in LOWER
    assert "drop table" not in LOWER

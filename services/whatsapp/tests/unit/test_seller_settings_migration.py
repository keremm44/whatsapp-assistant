from pathlib import Path

SQL = Path("migrations/023_add_seller_rules_settings_crud.sql").read_text(encoding="utf-8")
LOWER = SQL.lower()


def test_migration_adds_versions_and_rule_updated_at() -> None:
    assert "settings_version bigint not null default 1" in LOWER
    assert "version bigint not null default 1" in LOWER
    assert "updated_at timestamptz not null default now()" in LOWER


def test_migration_preflights_active_trigger_duplicates() -> None:
    assert "having count(*) > 1" in LOWER
    assert "where is_active = true" in LOWER


def test_migration_adds_query_and_unique_indexes() -> None:
    assert "idx_rules_seller_active_created" in LOWER
    assert "uq_rules_seller_active_trigger" in LOWER
    assert "lower(btrim(trigger_text))" in LOWER


def test_migration_preserves_business_data() -> None:
    assert "drop table" not in LOWER
    assert "truncate" not in LOWER
    assert "delete from public.rules" not in LOWER
    assert "update public.rules" not in LOWER


def test_migration_records_023() -> None:
    assert "'023'" in SQL
    assert "add_seller_rules_and_product_settings" in SQL
    assert "seller_rules_product_settings_v1" in SQL


def test_migration_bumps_settings_version_for_other_safe_writers() -> None:
    assert "bump_seller_settings_version" in LOWER
    assert "trg_sellers_settings_version" in LOWER
    assert "new.settings_version = old.settings_version" in LOWER
    assert "search_path = pg_catalog, public" in LOWER
    assert "from public, anon, authenticated" in LOWER
    assert "to service_role" in LOWER

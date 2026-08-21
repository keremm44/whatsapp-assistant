from pathlib import Path


def test_migration_chain_is_contiguous_000_through_038() -> None:
    migrations = sorted(Path("migrations").glob("[0-9][0-9][0-9]_*.sql"))
    versions = [path.name[:3] for path in migrations]
    assert versions == [f"{version:03d}" for version in range(39)]


def test_023_024_025_files_match_live_names() -> None:
    assert Path("migrations/023_add_seller_rules_settings_crud.sql").exists()
    assert Path("migrations/024_harden_seller_product_settings_contract.sql").exists()
    assert Path("migrations/025_add_seller_product_crud.sql").exists()


def test_026_restores_atomic_active_rule_uniqueness() -> None:
    sql = Path("migrations/026_restore_active_rule_uniqueness.sql").read_text(encoding="utf-8").lower()
    assert "having count(*) > 1" in sql
    assert "uq_rules_seller_active_trigger" in sql
    assert "where is_active = true" in sql
    assert "seller_rule_active_uniqueness_v1" in sql


def test_027_gates_image_requirement_on_seller_config() -> None:
    sql = Path("migrations/027_honor_order_image_requirement.sql").read_text(encoding="utf-8").lower()
    assert "create or replace function public._recompute_order_completion" in sql
    assert "set search_path = pg_catalog, public" in sql
    assert "order_config -> 'image_required'" in sql
    assert "order_config -> 'custom_text_required'" in sql
    assert "if image_required and order_row.image_message_id is null then" in sql
    assert "if custom_text_required" in sql
    assert "revoke execute on function public._recompute_order_completion" in sql
    assert "grant execute on function public._recompute_order_completion" in sql
    assert "on conflict (version) do nothing" in sql


def test_035_only_hardens_quantity_function_search_paths() -> None:
    sql = Path("migrations/035_harden_quantity_function_search_paths.sql").read_text(
        encoding="utf-8"
    ).lower()

    assert sql.count("alter function public.") == 3
    assert "alter function public._return_issue_request_presenter" in sql
    assert "alter function public.create_or_get_return_issue_request" in sql
    assert "alter function public.evaluate_quantity_limit_request" in sql
    assert sql.count("set search_path = pg_catalog, public") == 3
    assert "create or replace function" not in sql
    assert "alter table" not in sql
    assert "update public." not in sql
    assert "delete from" not in sql
    assert "truncate" not in sql
    assert "'035'" in sql
    assert "'harden_quantity_function_search_paths'" in sql
    assert "'quantity_function_search_paths_v1'" in sql

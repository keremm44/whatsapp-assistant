from pathlib import Path


def test_migration_chain_is_contiguous_000_through_058() -> None:
    migrations = sorted(Path("migrations").glob("[0-9][0-9][0-9]_*.sql"))
    versions = [path.name[:3] for path in migrations]
    assert versions == [f"{version:03d}" for version in range(59)]


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


def test_054_owns_atomic_message_metric_persistence() -> None:
    path = Path("migrations/054_atomically_maintain_customer_message_count.sql")
    assert path.exists()
    sql = path.read_text(encoding="utf-8").lower()
    assert "persist_message_with_customer_metrics" in sql
    assert "reconcile_customer_message_metrics" in sql
    assert "'054'" in sql


def test_055_extends_claim_fencing_into_business_processing() -> None:
    path = Path("migrations/055_renew_whatsapp_worker_claim.sql")
    assert path.exists()
    sql = path.read_text(encoding="utf-8").lower()
    assert "renew_whatsapp_inbound_event_claim" in sql
    assert "e.claim_version = claim_version_value" in sql
    assert "set claimed_at = now()" in sql
    assert "'055'" in sql


def test_056_adds_operational_health_snapshot() -> None:
    path = Path("migrations/056_add_whatsapp_operational_health_snapshot.sql")
    assert path.exists()
    sql = path.read_text(encoding="utf-8").lower()
    assert "get_whatsapp_operational_health" in sql
    assert "unknown_recent_15m" in sql
    assert "'056'" in sql


def test_057_adds_durable_worker_heartbeat() -> None:
    path = Path("migrations/057_add_whatsapp_worker_heartbeat.sql")
    assert path.exists()
    sql = path.read_text(encoding="utf-8").lower()
    assert "record_whatsapp_worker_heartbeat" in sql
    assert "recent_heartbeat_count" in sql
    assert "'057'" in sql


def test_058_adds_durable_turn_debounce() -> None:
    path = Path("migrations/058_add_whatsapp_turn_buffer.sql")
    assert path.exists()
    sql = path.read_text(encoding="utf-8").lower()
    assert "_turn_debounce_seconds" in sql
    assert "turn_has_more" in sql
    assert "'058'" in sql

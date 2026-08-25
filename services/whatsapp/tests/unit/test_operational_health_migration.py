from pathlib import Path


MIGRATION = Path("migrations/056_add_whatsapp_operational_health_snapshot.sql")


def test_056_adds_privacy_safe_aggregate_health_rpc() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "create or replace function public.get_whatsapp_operational_health()" in sql
    assert "count(*) filter" in sql
    assert "oldest_due_pending_seconds" in sql
    assert "oldest_processing_seconds" in sql
    assert "unknown_recent_15m" in sql
    assert "payload" not in sql
    assert "recipient_id" not in sql
    assert "customer_id" not in sql


def test_056_health_rpc_is_backend_only_security_invoker() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "security invoker" in sql
    assert "set search_path = pg_catalog, public" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql


def test_056_registers_migration() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "'056'" in sql
    assert "'add_whatsapp_operational_health_snapshot'" in sql
    assert "'add_whatsapp_operational_health_snapshot_v1'" in sql

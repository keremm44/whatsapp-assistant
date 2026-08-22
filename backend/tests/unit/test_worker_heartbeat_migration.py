from pathlib import Path


MIGRATION = Path("migrations/057_add_whatsapp_worker_heartbeat.sql")


def test_057_adds_privacy_safe_worker_heartbeat_table() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "create table if not exists public.whatsapp_worker_heartbeats" in sql
    assert "worker_id varchar(120) primary key" in sql
    assert "last_seen_at timestamptz" in sql
    assert "payload" not in sql
    assert "phone" not in sql
    assert "customer_id" not in sql


def test_057_heartbeat_rpc_is_backend_only_security_invoker() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "create or replace function public.record_whatsapp_worker_heartbeat" in sql
    assert "security invoker" in sql
    assert "set search_path = pg_catalog, public" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql


def test_057_health_snapshot_includes_recent_worker_liveness() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "recent_heartbeat_count" in sql
    assert "last_heartbeat_age_seconds" in sql
    assert "interval '2 minutes'" in sql
    assert "interval '7 days'" in sql


def test_057_registers_migration() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "'057'" in sql
    assert "'add_whatsapp_worker_heartbeat'" in sql
    assert "'add_whatsapp_worker_heartbeat_v1'" in sql

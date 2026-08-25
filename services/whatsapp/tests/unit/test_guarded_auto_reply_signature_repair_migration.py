from pathlib import Path


MIGRATION = Path("migrations/051_repair_guarded_auto_reply_signature.sql")


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


def test_051_removes_accidental_double_precision_overload() -> None:
    sql = _sql()
    assert "drop function if exists public.persist_guarded_auto_reply" in sql
    assert "double precision" in sql
    assert "ai_confidence_value real default null" in sql


def test_051_restores_control_snapshot_behavior_on_real_signature() -> None:
    sql = _sql()
    assert "create or replace function public.persist_guarded_auto_reply" in sql
    assert "auto_reply_control_version" in sql
    assert "outgoing_row.auto_reply_control_version is distinct from expected_control_version" in sql
    assert "control_row.control_state <> 'assistant_active'" in sql
    assert "control_row.control_version <> expected_control_version" in sql


def test_051_keeps_guarded_reply_backend_only() -> None:
    sql = _sql()
    assert "set search_path = pg_catalog, public" in sql
    assert "revoke all on function public.persist_guarded_auto_reply" in sql
    assert "from public, anon, authenticated" in sql
    assert "grant execute on function public.persist_guarded_auto_reply" in sql
    assert "to service_role" in sql


def test_051_registers_repair_migration() -> None:
    sql = _sql()
    assert "'051'" in sql
    assert "'repair_guarded_auto_reply_signature'" in sql
    assert "'repair_guarded_auto_reply_signature_v1'" in sql
    assert "on conflict (version) do nothing" in sql

from pathlib import Path


MIGRATION = Path("migrations/052_recover_stale_whatsapp_sending.sql")


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


def test_052_indexes_only_sending_rows_for_stale_scan() -> None:
    sql = _sql()
    assert "idx_whatsapp_delivery_stale_sending" in sql
    assert "on public.whatsapp_delivery_outbox(last_attempt_at, id)" in sql
    assert "where status = 'sending'" in sql


def test_052_recovers_only_old_or_missing_attempt_timestamps() -> None:
    sql = _sql()
    assert "o.status = 'sending'" in sql
    assert "o.last_attempt_at is null" in sql
    assert "now() - interval '60 seconds'" in sql
    assert "limit 100" in sql
    assert "for update skip locked" in sql


def test_052_never_requeues_ambiguous_delivery() -> None:
    sql = _sql()
    assert "set status = 'unknown'" in sql
    assert "last_error_code = 'stale_sending_recovered'" in sql
    assert "next_attempt_at = null" in sql
    assert "set status = 'pending'" not in sql


def test_052_returns_bounded_recovery_count() -> None:
    sql = _sql()
    assert "'recovered_count'" in sql
    assert "count(*)::integer" in sql
    assert "limit 100" in sql


def test_052_recovery_rpc_is_backend_only_and_not_security_definer() -> None:
    sql = _sql()
    assert "set search_path = pg_catalog, public" in sql
    assert "security definer" not in sql
    assert "revoke all on function public.recover_stale_whatsapp_delivery_outbox()" in sql
    assert "from public, anon, authenticated" in sql
    assert "grant execute on function public.recover_stale_whatsapp_delivery_outbox()" in sql
    assert "to service_role" in sql


def test_052_registers_custom_migration() -> None:
    sql = _sql()
    assert "'052'" in sql
    assert "'recover_stale_whatsapp_sending'" in sql
    assert "'recover_stale_whatsapp_sending_v1'" in sql
    assert "on conflict (version) do nothing" in sql

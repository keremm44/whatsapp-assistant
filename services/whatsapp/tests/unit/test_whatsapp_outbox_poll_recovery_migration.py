from pathlib import Path


MIGRATION = Path("migrations/053_fold_stale_recovery_into_outbox_poll.sql")


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


def test_053_calls_stale_recovery_inside_existing_poll() -> None:
    sql = _sql()
    assert "create or replace function public.next_whatsapp_delivery_outbox_id()" in sql
    assert "public.recover_stale_whatsapp_delivery_outbox()" in sql
    assert "'recovered_stale_count'" in sql


def test_053_keeps_due_pending_discovery_contract() -> None:
    sql = _sql()
    assert "o.status = 'pending'" in sql
    assert "o.next_attempt_at <= now()" in sql
    assert "order by o.next_attempt_at nulls first, o.id" in sql
    assert "limit 1" in sql


def test_053_fails_closed_when_recovery_result_is_invalid() -> None:
    sql = _sql()
    assert "'stale_recovery_failed'" in sql
    assert "'stale_recovery_invalid_count'" in sql
    assert "recovered_count_value < 0" in sql


def test_053_preserves_backend_only_rpc_acl() -> None:
    sql = _sql()
    assert "set search_path = pg_catalog, public" in sql
    assert "security definer" not in sql
    assert "revoke all on function public.next_whatsapp_delivery_outbox_id()" in sql
    assert "from public, anon, authenticated" in sql
    assert "grant execute on function public.next_whatsapp_delivery_outbox_id()" in sql
    assert "to service_role" in sql


def test_053_registers_custom_migration() -> None:
    sql = _sql()
    assert "'053'" in sql
    assert "'fold_stale_recovery_into_outbox_poll'" in sql
    assert "'fold_stale_recovery_into_outbox_poll_v1'" in sql
    assert "on conflict (version) do nothing" in sql

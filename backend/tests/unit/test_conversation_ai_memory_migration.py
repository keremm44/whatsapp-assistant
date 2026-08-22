from pathlib import Path


MIGRATION = Path("migrations/060_add_conversation_ai_memory.sql")


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


def test_memory_table_is_bounded_rls_and_service_role_only() -> None:
    sql = _sql()
    assert "create table if not exists public.conversation_ai_memories" in sql
    assert "char_length(summary_text) <= 1600" in sql
    assert "enable row level security" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql
    assert "memory_incomplete boolean not null default false" in sql


def test_context_rpc_reads_only_bounded_pre_current_tail() -> None:
    sql = _sql()
    assert "create or replace function public.get_conversation_ai_context" in sql
    assert "m.id < current_message_id_value" in sql
    assert "limit 12" in sql
    assert "context_truncated" in sql
    assert "uncovered_count" in sql
    assert "media_url" not in sql


def test_memory_advance_is_cas_monotonic_and_same_conversation_serialized() -> None:
    sql = _sql()
    assert "memory_row.version <> expected_version_value" in sql
    assert "memory_already_advanced" in sql
    assert "version = version + 1" in sql
    assert "pg_advisory_xact_lock" in sql
    assert "conversation-ai-memory:" in sql
    assert "memory_incomplete = memory_incomplete or context_truncated_value" in sql


def test_memory_advance_fences_whatsapp_worker_when_claim_is_present() -> None:
    sql = _sql()
    assert "claim_piece_count not in (0, 3)" in sql
    assert "claim_row.status <> 'processing'" in sql
    assert "claim_row.claimed_by is distinct from normalized_worker" in sql
    assert "claim_row.claim_version is distinct from claim_version_value" in sql
    assert "'claim_lost'" in sql


def test_memory_rpcs_are_security_invoker_fixed_search_path_and_not_public() -> None:
    sql = _sql()
    assert sql.count("security invoker") == 2
    assert sql.count("set search_path = pg_catalog, public") == 2
    assert "security definer" not in sql
    assert "revoke all on function public.get_conversation_ai_context" in sql
    assert "revoke all on function public.advance_conversation_ai_memory" in sql
    assert "'060'" in sql

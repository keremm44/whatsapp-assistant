from pathlib import Path


MIGRATION = Path("migrations/050_guard_outbox_dispatch_against_control_changes.sql")


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


def test_050_persists_the_control_version_that_authorized_auto_reply() -> None:
    sql = _sql()
    assert "add column if not exists auto_reply_control_version bigint" in sql
    assert "auto_reply_control_version > 0" in sql
    assert "auto_reply_control_version" in sql
    assert "expected_control_version" in sql
    assert "persist_guarded_auto_reply" in sql
    assert "outgoing_row.auto_reply_control_version is distinct from expected_control_version" in sql


def test_050_adds_terminal_suppressed_delivery_state() -> None:
    sql = _sql()
    assert "'suppressed'" in sql
    assert "add column if not exists suppressed_at timestamptz" in sql
    assert "whatsapp_delivery_suppressed_at_check" in sql
    assert "control_changed_before_dispatch" in sql
    assert "before_resume_cursor" in sql


def test_050_claim_locks_control_before_outbox_and_fails_closed() -> None:
    sql = _sql()
    claim_start = sql.index("create or replace function public.claim_whatsapp_delivery_outbox")
    transition_start = sql.index("create or replace function public.transition_conversation_control")
    claim_sql = sql[claim_start:transition_start]

    control_lock = claim_sql.index("from public.conversation_states cs")
    outbox_lock = claim_sql.index("from public.whatsapp_delivery_outbox o\n    where o.id = target_outbox_id\n    for update", control_lock)
    assert control_lock < outbox_lock
    assert "control_row.control_state <> 'assistant_active'" in claim_sql
    assert "control_row.control_version <> outbox_row.expected_control_version" in claim_sql
    assert "set status = 'suppressed'" in claim_sql
    assert "set status = 'sending'" in claim_sql


def test_050_control_transition_blocks_recent_in_flight_dispatch() -> None:
    sql = _sql()
    transition_start = sql.index("create or replace function public.transition_conversation_control")
    transition_sql = sql[transition_start:]

    assert "status = 'sending'" in transition_sql
    assert "interval '60 seconds'" in transition_sql
    assert "outbound_dispatch_in_flight" in transition_sql
    assert "status = 'unknown'" in transition_sql
    assert "stale_sending_during_control_change" in transition_sql
    assert "set status = 'suppressed'" in transition_sql


def test_050_backend_only_rpc_acl_and_fixed_search_paths() -> None:
    sql = _sql()
    assert sql.count("set search_path = pg_catalog, public") == 4
    for function_name in (
        "persist_guarded_auto_reply",
        "ensure_whatsapp_delivery_outbox",
        "claim_whatsapp_delivery_outbox",
        "transition_conversation_control",
    ):
        assert f"revoke all on function public.{function_name}" in sql
        assert f"grant execute on function public.{function_name}" in sql


def test_050_registers_custom_migration() -> None:
    sql = _sql()
    assert "'050'" in sql
    assert "'guard_outbox_dispatch_against_control_changes'" in sql
    assert "'guard_outbox_dispatch_against_control_changes_v1'" in sql
    assert "on conflict (version) do nothing" in sql

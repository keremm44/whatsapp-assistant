from pathlib import Path


def _sql() -> str:
    return Path("migrations/058_add_whatsapp_turn_buffer.sql").read_text(
        encoding="utf-8"
    ).lower()


def test_turn_buffer_keeps_enqueue_rpc_signature_rolling_deploy_safe() -> None:
    sql = _sql()
    assert "create or replace function public.enqueue_whatsapp_inbound_event(" in sql
    assert "event_type_value text" in sql
    assert "event_key_value text" in sql
    assert "phone_number_id_value text" in sql
    assert "payload_value jsonb" in sql
    assert "_turn_debounce_seconds" in sql
    assert "_turn_max_seconds" in sql


def test_turn_buffer_resets_quiet_window_and_caps_total_wait() -> None:
    sql = _sql()
    assert "select min(created_at) into turn_started_at" in sql
    assert "turn_due_at := least(" in sql
    assert "make_interval(secs => debounce_seconds)" in sql
    assert "make_interval(secs => max_turn_seconds)" in sql
    assert "pending.attempt_count = 0" in sql
    assert "set available_at = turn_due_at" in sql


def test_immediate_message_flushes_pending_first_attempt_burst() -> None:
    sql = _sql()
    assert "if debounce_seconds = 0 then" in sql
    assert "turn_due_at := now();" in sql


def test_retry_rows_are_not_coalesced_into_fresh_customer_turn() -> None:
    sql = _sql()
    assert sql.count("attempt_count = 0") >= 3
    assert "a retry is a separate" in sql


def test_claim_preserves_fifo_fencing_and_marks_intermediate_turn_rows() -> None:
    sql = _sql()
    assert "for update skip locked" in sql
    assert "earlier.status in ('pending', 'processing')" in sql
    assert "claim_version = claim_version + 1" in sql
    assert "turn_has_more" in sql
    assert "newer.id > event_row.id" in sql
    assert "newer.available_at <= now()" in sql


def test_turn_buffer_rpc_security_and_migration_marker_are_present() -> None:
    sql = _sql()
    assert sql.count("set search_path = pg_catalog, public") == 2
    assert "from public, anon, authenticated" in sql
    assert "grant execute on function public.enqueue_whatsapp_inbound_event" in sql
    assert "grant execute on function public.claim_next_whatsapp_inbound_event" in sql
    assert "'058'" in sql
    assert "'add_whatsapp_turn_buffer'" in sql
    assert "'whatsapp_turn_buffer_v1'" in sql

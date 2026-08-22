from pathlib import Path


def _sql() -> str:
    return Path("migrations/046_serialize_inbound_and_atomic_flow_state.sql").read_text(
        encoding="utf-8"
    ).lower()


def test_046_adds_atomic_state_version_and_message_cursor() -> None:
    sql = _sql()

    assert "add column if not exists state_version bigint not null default 1" in sql
    assert "add column if not exists state_last_message_id bigint" in sql
    assert "conversation_states_state_last_message_fk" in sql
    assert "create or replace function public.transition_conversation_state" in sql
    assert "from public.conversation_states cs" in sql
    assert "for update" in sql
    assert "transition_trigger_message_id < state_row.state_last_message_id" in sql
    assert "previous_state_version" in sql
    assert "new_state_version" in sql
    assert "insert into public.state_transitions" in sql


def test_046_serializes_same_sender_inbound_fifo() -> None:
    sql = _sql()

    assert "create index if not exists idx_whatsapp_inbound_sender_open_fifo" in sql
    assert "create or replace function public.claim_next_whatsapp_inbound_event" in sql
    assert "earlier.phone_number_id = candidate.phone_number_id" in sql
    assert "earlier.payload ->> 'sender_id'" in sql
    assert "candidate.payload ->> 'sender_id'" in sql
    assert "earlier.id < candidate.id" in sql
    assert "earlier.status in ('pending', 'processing')" in sql
    assert "for update skip locked" in sql


def test_046_keeps_new_rpcs_backend_only_and_registers_migration() -> None:
    sql = _sql()

    assert sql.count("from public, anon, authenticated") >= 2
    assert sql.count("to service_role") >= 2
    assert "set search_path = pg_catalog, public" in sql
    assert "'046'" in sql
    assert "'serialize_inbound_and_atomic_flow_state'" in sql
    assert "'serialize_inbound_and_atomic_flow_state_v1'" in sql

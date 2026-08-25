from pathlib import Path


def test_045_serializes_auto_reply_with_conversation_control() -> None:
    sql = Path("migrations/045_guard_auto_reply_persistence.sql").read_text(
        encoding="utf-8"
    ).lower()

    assert "create or replace function public.persist_guarded_auto_reply" in sql
    assert "from public.conversation_states as cs" in sql
    assert "for update" in sql
    assert "control_row.control_state <> 'assistant_active'" in sql
    assert "control_row.control_version <> expected_control_version" in sql
    assert "target_source_message_id <= control_row.resume_after_message_id" in sql
    assert "m.direction = 'incoming'" in sql
    assert "reply_to_message_id" in sql
    assert "on conflict do nothing" in sql


def test_045_is_backend_only_and_registered() -> None:
    sql = Path("migrations/045_guard_auto_reply_persistence.sql").read_text(
        encoding="utf-8"
    ).lower()

    assert "set search_path = pg_catalog, public" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql
    assert "'045'" in sql
    assert "'guard_auto_reply_persistence'" in sql
    assert "'guard_auto_reply_persistence_v1'" in sql

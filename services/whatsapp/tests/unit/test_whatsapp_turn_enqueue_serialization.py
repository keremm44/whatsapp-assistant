from pathlib import Path


def _sql() -> str:
    return Path("migrations/059_serialize_whatsapp_turn_enqueue.sql").read_text(
        encoding="utf-8"
    ).lower()


def test_same_sender_advisory_lock_precedes_inbox_insert() -> None:
    sql = _sql()
    lock_position = sql.index("pg_advisory_xact_lock")
    insert_position = sql.index("insert into public.whatsapp_inbound_events")
    assert lock_position < insert_position
    assert "normalized_phone_number_id || ':' || sender_id_value" in sql


def test_different_senders_do_not_share_one_global_lock_key() -> None:
    sql = _sql()
    assert "'whatsapp-turn:' || normalized_phone_number_id || ':' || sender_id_value" in sql


def test_serialized_enqueue_preserves_turn_quiet_window_rules() -> None:
    sql = _sql()
    assert "turn_due_at := least(" in sql
    assert "make_interval(secs => debounce_seconds)" in sql
    assert "make_interval(secs => max_turn_seconds)" in sql
    assert "pending.attempt_count = 0" in sql
    assert "if debounce_seconds = 0 then" in sql


def test_serialized_enqueue_remains_service_role_only_and_fixed_search_path() -> None:
    sql = _sql()
    assert "set search_path = pg_catalog, public" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql
    assert "'serialize_whatsapp_turn_enqueue_v1'" in sql

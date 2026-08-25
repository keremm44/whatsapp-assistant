from __future__ import annotations

from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "028_add_conversation_control_state_filter.sql"
)


def migration_sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


def test_028_drops_four_arg_overload_before_creating_five_arg() -> None:
    sql = migration_sql()
    drop_at = sql.find(
        "DROP FUNCTION IF EXISTS public.get_seller_conversation_list(\n"
        "    BIGINT, INTEGER, INTEGER, BOOLEAN\n"
        ")"
    )
    create_at = sql.find(
        "CREATE OR REPLACE FUNCTION public.get_seller_conversation_list(\n"
        "    target_seller_id BIGINT,\n"
        "    result_limit INTEGER DEFAULT 20,\n"
        "    result_offset INTEGER DEFAULT 0,\n"
        "    attention_only BOOLEAN DEFAULT FALSE,\n"
        "    target_control_state TEXT DEFAULT NULL\n"
        ")"
    )
    assert drop_at != -1
    assert create_at != -1
    assert drop_at < create_at
    assert sql.count("CREATE OR REPLACE FUNCTION public.get_seller_conversation_list(") == 1


def test_028_filters_before_count_and_pagination() -> None:
    sql = migration_sql()
    assert "target_control_state IS NULL" in sql
    assert "OR control_state = target_control_state" in sql
    assert "NOT attention_only OR needs_attention" in sql
    filtered_at = sql.find("filtered AS (")
    paged_at = sql.find("paged AS (")
    total_at = sql.find("'total', (SELECT COUNT(*) FROM filtered)")
    assert filtered_at != -1
    assert paged_at != -1
    assert total_at != -1
    assert filtered_at < paged_at < total_at


def test_028_allowlists_existing_control_states_only() -> None:
    sql = migration_sql()
    assert "'ASSISTANT_ACTIVE'" in sql
    assert "'SELLER_TAKEN_OVER'" in sql
    assert "'RETURN_REVIEW'" in sql
    assert "'ASSISTANT_PAUSED'" in sql
    assert "Geçersiz control_state." in sql


def test_028_preserves_backend_only_grants_and_ordering() -> None:
    sql = migration_sql()
    assert "SET search_path = pg_catalog, public" in sql
    assert (
        "REVOKE EXECUTE ON FUNCTION public.get_seller_conversation_list(\n"
        "    BIGINT, INTEGER, INTEGER, BOOLEAN, TEXT\n"
        ") FROM PUBLIC, anon, authenticated;" in sql
    )
    assert (
        "GRANT EXECUTE ON FUNCTION public.get_seller_conversation_list(\n"
        "    BIGINT, INTEGER, INTEGER, BOOLEAN, TEXT\n"
        ") TO service_role;" in sql
    )
    assert "needs_attention DESC, sort_at DESC, customer_id DESC" in sql
    assert "CREATE POLICY" not in sql.upper()
    assert " TO anon" not in sql
    assert " TO authenticated" not in sql


def test_028_is_read_model_only() -> None:
    sql = migration_sql().upper()
    assert "DROP TABLE" not in sql
    assert "TRUNCATE" not in sql
    assert "DELETE FROM" not in sql
    assert "UPDATE PUBLIC." not in sql
    assert "INSERT INTO PUBLIC.SCHEMA_MIGRATIONS" in sql
    assert sql.count("BEGIN;") == 1
    assert sql.count("COMMIT;") == 1
    assert "CONVERSATION_CONTROL_STATE_FILTER_V1" in sql

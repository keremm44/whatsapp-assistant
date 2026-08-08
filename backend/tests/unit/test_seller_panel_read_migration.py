from __future__ import annotations

from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "020_add_seller_panel_read_models.sql"
)


def migration_sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


def test_020_has_expected_read_rpcs_and_indexes() -> None:
    sql = migration_sql()

    assert "CREATE OR REPLACE FUNCTION public.get_seller_conversation_list(" in sql
    assert "CREATE OR REPLACE FUNCTION public.get_seller_conversation_detail(" in sql
    assert "CREATE OR REPLACE FUNCTION public.get_seller_dashboard_tasks(" in sql
    assert "idx_customers_seller_last_message" in sql
    assert "idx_messages_seller_customer_id_desc" in sql
    assert "seller_panel_read_models_v1" in sql


def test_020_is_backend_only_and_hardened() -> None:
    sql = migration_sql()

    assert sql.count("SET search_path = pg_catalog, public") == 3
    assert sql.count("FROM PUBLIC, anon, authenticated") == 3
    assert sql.count("TO service_role") == 3
    assert "CREATE POLICY" not in sql.upper()
    assert "GRANT EXECUTE" in sql
    assert " TO anon" not in sql
    assert " TO authenticated" not in sql


def test_020_is_read_model_only_without_destructive_data_operations() -> None:
    sql = migration_sql().upper()

    assert "DROP TABLE" not in sql
    assert "TRUNCATE" not in sql
    assert "DELETE FROM" not in sql
    assert "UPDATE PUBLIC." not in sql
    assert "INSERT INTO PUBLIC.SCHEMA_MIGRATIONS" in sql


def test_020_transaction_and_dollar_quotes_are_balanced() -> None:
    sql = migration_sql()

    assert sql.count("BEGIN;") == 1
    assert sql.count("COMMIT;") == 1
    assert sql.count("$$") == 6


def test_020_does_not_expose_provider_media_urls_or_ai_language() -> None:
    sql = migration_sql()

    assert "'media_url'" not in sql
    assert "'ai_confidence'" not in sql


def test_020_rpc_parameter_names_match_database_contract() -> None:
    sql = migration_sql()

    assert (
        "public.get_seller_conversation_list(\n"
        "    target_seller_id BIGINT,\n"
        "    result_limit INTEGER DEFAULT 20,\n"
        "    result_offset INTEGER DEFAULT 0,\n"
        "    attention_only BOOLEAN DEFAULT FALSE\n"
        ")" in sql
    )
    assert (
        "public.get_seller_conversation_detail(\n"
        "    target_seller_id BIGINT,\n"
        "    target_customer_id BIGINT,\n"
        "    message_limit INTEGER DEFAULT 50,\n"
        "    before_message_id BIGINT DEFAULT NULL,\n"
        "    control_history_limit INTEGER DEFAULT 20\n"
        ")" in sql
    )
    assert (
        "public.get_seller_dashboard_tasks(\n"
        "    target_seller_id BIGINT,\n"
        "    task_type_value TEXT DEFAULT NULL,\n"
        "    result_limit INTEGER DEFAULT 50,\n"
        "    result_offset INTEGER DEFAULT 0\n"
        ")" in sql
    )

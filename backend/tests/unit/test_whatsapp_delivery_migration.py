from __future__ import annotations

from pathlib import Path


MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "036_add_whatsapp_delivery_outbox.sql"
)


def _migration() -> str:
    return MIGRATION_PATH.read_text(encoding="utf-8")


def test_whatsapp_delivery_migration_is_next_repository_version() -> None:
    sql = _migration()

    assert "'036'" in sql
    assert "'add_whatsapp_delivery_outbox'" in sql
    assert "ON CONFLICT (version) DO NOTHING" in sql


def test_whatsapp_delivery_migration_correlates_one_reply_to_one_inbound() -> None:
    sql = _migration()

    assert "ADD COLUMN IF NOT EXISTS reply_to_message_id BIGINT" in sql
    assert "messages_reply_to_message_id_fkey" in sql
    assert "idx_messages_outgoing_reply_source_unique" in sql
    assert "WHERE reply_to_message_id IS NOT NULL" in sql
    assert "direction = 'outgoing'" in sql


def test_whatsapp_channel_table_contains_routing_metadata_not_secrets() -> None:
    sql = _migration()
    channel_definition = sql.split(
        "CREATE TABLE IF NOT EXISTS public.whatsapp_channels",
        1,
    )[1].split("CREATE INDEX IF NOT EXISTS idx_whatsapp_channels_seller_active", 1)[0]

    assert "seller_id BIGINT NOT NULL" in channel_definition
    assert "phone_number_id VARCHAR(64) NOT NULL" in channel_definition
    assert "is_active BOOLEAN NOT NULL DEFAULT TRUE" in channel_definition
    assert "access_token" not in channel_definition.lower()
    assert "app_secret" not in channel_definition.lower()
    assert "credential" not in channel_definition.lower()


def test_whatsapp_outbox_has_durable_identity_and_state_guards() -> None:
    sql = _migration()

    for token in (
        "whatsapp_delivery_outbox_message_unique",
        "whatsapp_delivery_outbox_source_unique",
        "idx_whatsapp_delivery_provider_message_unique",
        "'PENDING'",
        "'SENDING'",
        "'SENT'",
        "'DELIVERED'",
        "'READ'",
        "'FAILED'",
        "'UNKNOWN'",
        "attempt_count INTEGER NOT NULL DEFAULT 0",
        "next_attempt_at TIMESTAMPTZ",
    ):
        assert token in sql


def test_whatsapp_backend_tables_are_not_browser_accessible() -> None:
    sql = _migration()

    assert "ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY" in sql
    assert "ALTER TABLE public.whatsapp_delivery_outbox ENABLE ROW LEVEL SECURITY" in sql
    assert "REVOKE ALL PRIVILEGES ON TABLE public.whatsapp_channels" in sql
    assert "REVOKE ALL PRIVILEGES ON TABLE public.whatsapp_delivery_outbox" in sql
    assert "FROM PUBLIC, anon, authenticated" in sql
    assert "TO service_role" in sql


def test_whatsapp_delivery_functions_are_invoker_scoped_and_atomic_boundaries_exist() -> None:
    sql = _migration()
    upper = sql.upper()

    assert "SECURITY DEFINER" not in upper
    for function_name in (
        "ensure_whatsapp_delivery_outbox",
        "claim_whatsapp_delivery_outbox",
        "mark_whatsapp_delivery_sent",
        "mark_whatsapp_delivery_failed",
        "mark_whatsapp_delivery_unknown",
        "schedule_whatsapp_delivery_retry",
        "apply_whatsapp_delivery_status",
    ):
        assert f"FUNCTION public.{function_name}" in sql

    assert "FOR UPDATE" in sql
    assert "provider = 'whatsapp_cloud'" in sql
    assert "provider_message_id = normalized_provider_message_id" in sql

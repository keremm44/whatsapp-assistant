from pathlib import Path


def test_048_recreates_fenced_completion_without_trailing_defaults() -> None:
    sql = Path("migrations/048_disambiguate_whatsapp_completion_rpc.sql").read_text(
        encoding="utf-8"
    ).lower()

    assert "drop function if exists public.complete_whatsapp_inbound_event" in sql
    assert "bigint, text, bigint, text, text, timestamptz" in sql
    marker = "create function public.complete_whatsapp_inbound_event("
    signature = sql.split(marker, 1)[1].split(")", 1)[0]
    assert "default" not in signature
    assert "worker_id_value text" in signature
    assert "claim_version_value bigint" in signature
    assert "'claim_lost'" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql
    assert "'048'" in sql
    assert "'disambiguate_whatsapp_completion_rpc'" in sql

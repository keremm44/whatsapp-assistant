from pathlib import Path


def _sql() -> str:
    return Path("migrations/047_fence_whatsapp_worker_claims.sql").read_text(
        encoding="utf-8"
    ).lower()


def test_047_adds_monotonic_claim_version() -> None:
    sql = _sql()

    assert "add column if not exists claim_version bigint not null default 0" in sql
    assert "whatsapp_inbound_events_claim_version_check" in sql
    assert "check (claim_version >= 0)" in sql
    assert "claim_version = claim_version + 1" in sql
    assert "interval '5 minutes'" in sql
    assert "for update skip locked" in sql


def test_047_completion_requires_worker_and_claim_version() -> None:
    sql = _sql()

    assert "worker_id_value text" in sql
    assert "claim_version_value bigint" in sql
    assert "event_row.claimed_by is distinct from normalized_worker" in sql
    assert "event_row.claim_version <> claim_version_value" in sql
    assert "'claim_lost'" in sql
    assert "where id = event_id_value" in sql
    assert "for update" in sql


def test_047_legacy_completion_is_fail_closed() -> None:
    sql = _sql()

    assert "'claim_fencing_required'" in sql
    assert sql.count("create or replace function public.complete_whatsapp_inbound_event") == 2


def test_047_keeps_worker_rpcs_backend_only_and_registers_migration() -> None:
    sql = _sql()

    assert "set search_path = pg_catalog, public" in sql
    assert sql.count("from public, anon, authenticated") >= 3
    assert sql.count("to service_role") >= 3
    assert "'047'" in sql
    assert "'fence_whatsapp_worker_claims'" in sql
    assert "'fence_whatsapp_worker_claims_v1'" in sql

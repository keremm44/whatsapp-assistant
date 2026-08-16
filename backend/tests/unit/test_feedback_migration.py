from pathlib import Path


MIGRATION = Path("migrations/030_create_seller_feedback.sql")
SQL = MIGRATION.read_text(encoding="utf-8")
LOWER = SQL.lower()


def test_030_creates_dedicated_feedback_schema_and_constraints() -> None:
    assert "create table if not exists public.seller_feedback" in LOWER
    assert "references public.sellers(id)" in LOWER
    assert "category in ('suggestion', 'problem', 'complaint', 'other')" in LOWER
    assert "status in ('open', 'in_review', 'resolved')" in LOWER
    assert "status varchar(16) not null default 'open'" in LOWER
    assert "version bigint not null default 1" in LOWER
    assert "seller_feedback_resolution_check" in LOWER


def test_030_feedback_reads_are_scoped_and_deterministically_paginated() -> None:
    assert "where sf.id = target_feedback_id\n      and sf.seller_id = target_seller_id" in LOWER
    assert "where sf.seller_id = target_seller_id" in LOWER
    assert LOWER.count("order by f.created_at desc, f.id desc") >= 2
    assert "limit result_limit\n        offset result_offset" in LOWER


def test_030_admin_update_uses_optimistic_concurrency_and_resolution_lifecycle() -> None:
    assert "for update" in LOWER
    assert "feedback_row.version <> expected_version_value" in LOWER
    assert "'reason', 'stale_version'" in LOWER
    assert "version = sf.version + 1" in LOWER
    assert "when next_status = 'resolved'" in LOWER
    assert "then coalesce(feedback_row.resolved_at, now())" in LOWER
    assert "else null" in LOWER


def test_030_feedback_rpcs_are_service_role_only() -> None:
    expected = (
        "create_seller_feedback",
        "get_seller_feedback_list",
        "get_seller_feedback_detail",
        "get_admin_feedback_list",
        "get_admin_feedback_detail",
        "update_admin_feedback",
    )
    for name in expected:
        assert f"function public.{name}" in LOWER
    assert "alter table public.seller_feedback enable row level security" in LOWER
    assert "revoke all privileges on table public.seller_feedback" in LOWER
    assert "revoke all privileges on sequence public.seller_feedback_id_seq" in LOWER
    assert LOWER.count("from public, anon, authenticated") == 8
    assert LOWER.count("to service_role") == 8
    assert LOWER.count("set search_path = pg_catalog, public") == 6


def test_030_is_non_destructive_and_records_migration() -> None:
    assert "drop table" not in LOWER
    assert "truncate" not in LOWER
    assert "delete from" not in LOWER
    assert "'030'" in SQL
    assert "create_seller_feedback" in SQL
    assert "seller_feedback_v1" in SQL
    assert SQL.count("BEGIN;") == 1
    assert SQL.count("COMMIT;") == 1

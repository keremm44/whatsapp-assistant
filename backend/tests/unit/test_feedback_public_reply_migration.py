from pathlib import Path


SQL = Path("migrations/043_add_feedback_public_reply.sql").read_text(encoding="utf-8").lower()
NORMALIZED = " ".join(SQL.split())


def test_public_reply_is_separate_from_private_admin_note() -> None:
    assert "add column if not exists admin_reply varchar(4000)" in NORMALIZED
    assert "add column if not exists admin_replied_at timestamptz" in NORMALIZED
    assert "seller_feedback_admin_reply_check" in SQL
    assert "seller_feedback_admin_reply_timestamp_check" in SQL
    assert "'admin_note', feedback_row.admin_note" in SQL
    assert "'admin_reply', feedback_row.admin_reply" in SQL


def test_seller_projections_include_reply_but_not_admin_note() -> None:
    start = SQL.index("create or replace function public.get_seller_feedback_list")
    end = SQL.index("create or replace function public.get_seller_feedback_detail")
    seller_list = SQL[start:end]
    assert "'admin_reply', p.admin_reply" in seller_list
    assert "admin_note" not in seller_list

    start = SQL.index("create or replace function public.get_seller_feedback_detail")
    end = SQL.index("create or replace function public.get_admin_feedback_detail")
    seller_detail = SQL[start:end]
    assert "'admin_reply', feedback_row.admin_reply" in seller_detail
    assert "admin_note" not in seller_detail


def test_update_rpc_is_optimistic_and_handles_both_fields() -> None:
    assert "drop function if exists public.update_admin_feedback(bigint, bigint, boolean, text, boolean, text)" in NORMALIZED
    assert "update_admin_reply boolean default false" in NORMALIZED
    assert "admin_reply_value text default null" in NORMALIZED
    assert "next_admin_note is distinct from feedback_row.admin_note" in SQL
    assert "next_admin_reply is distinct from feedback_row.admin_reply" in SQL
    assert "admin_replied_at" in SQL
    assert "current_version" in SQL


def test_migration_is_registered() -> None:
    assert "values ('043', 'add_feedback_public_reply', 'v1', current_user)" in NORMALIZED

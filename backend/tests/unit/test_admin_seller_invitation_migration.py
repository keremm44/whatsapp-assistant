from __future__ import annotations

from pathlib import Path
import re


SQL_PATH = Path("migrations/022_finalize_admin_seller_invitation.sql")


def _sql() -> str:
    return SQL_PATH.read_text(encoding="utf-8")


def test_migration_creates_only_backend_write_rpc_and_records_022() -> None:
    sql = _sql()
    lower = sql.lower()

    assert "create or replace function public.finalize_seller_invitation_from_application" in lower
    assert "'022'" in sql
    assert "'finalize_admin_seller_invitation'" in sql
    assert "'admin_seller_invitation_v1'" in sql
    assert "set search_path = pg_catalog, public" in lower
    assert "security definer" not in lower

    assert "revoke execute on function public.finalize_seller_invitation_from_application" in lower
    assert "from public, anon, authenticated" in lower
    assert "to service_role" in lower


def test_migration_finalizes_application_seller_profile_and_onboarding_atomically() -> None:
    sql = _sql().lower()

    assert "begin;" in sql
    assert "commit;" in sql
    assert "for update" in sql
    assert "insert into public.sellers" in sql
    assert "new_seller_id := seller_row.id" in sql
    assert "perform public.initialize_seller_onboarding(new_seller_id)" in sql
    assert "insert into public.user_profiles" in sql
    assert "update public.seller_applications" in sql
    assert "status = 'approved'" in sql
    assert "approved_seller_id = new_seller_id" in sql
    assert "'invited'" in sql


def test_migration_is_application_scoped_and_rejects_closed_statuses() -> None:
    sql = _sql().lower()

    assert "where application.id = target_application_id" in sql
    assert "application_row.status not in ('pending', 'contacted')" in sql
    assert "application_row.status = 'approved'" in sql
    assert "'already_invited'" in sql


def test_migration_has_no_destructive_table_or_data_operations() -> None:
    lower = _sql().lower()

    for forbidden in (
        "drop table",
        "truncate ",
        "delete from public.sellers",
        "delete from public.seller_applications",
        "delete from public.user_profiles",
    ):
        assert forbidden not in lower


def test_function_signature_does_not_use_rowtype_parameter() -> None:
    sql = _sql()
    signature_match = re.search(
        r"CREATE OR REPLACE FUNCTION\s+public\.finalize_seller_invitation_from_application\s*\((.*?)\)\s*RETURNS",
        sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    assert signature_match is not None
    assert "%ROWTYPE" not in signature_match.group(1).upper()

from __future__ import annotations

from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "021_align_public_seller_applications.sql"
)


def migration_sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


def test_021_makes_email_optional_and_adds_category() -> None:
    sql = migration_sql()

    assert "ALTER COLUMN email DROP NOT NULL" in sql
    assert "ADD COLUMN IF NOT EXISTS product_category TEXT" in sql
    assert "chk_seller_applications_email_nonblank" in sql
    assert "chk_seller_applications_product_category_length" in sql


def test_021_guards_duplicate_open_phone_before_unique_index() -> None:
    sql = migration_sql()

    assert "HAVING COUNT(*) > 1" in sql
    assert "uq_seller_applications_open_phone_digits" in sql
    assert "regexp_replace(phone, '[^0-9]', '', 'g')" in sql
    assert "status IN ('pending', 'contacted')" in sql


def test_021_is_non_destructive_and_keeps_backend_only_model() -> None:
    upper = migration_sql().upper()

    assert "DROP TABLE" not in upper
    assert "TRUNCATE" not in upper
    assert "DELETE FROM" not in upper
    assert "CREATE POLICY" not in upper
    assert "GRANT " not in upper
    assert "REVOKE " not in upper


def test_021_records_canonical_migration() -> None:
    sql = migration_sql()

    assert "'021'" in sql
    assert "'align_public_seller_applications'" in sql
    assert "'public_seller_applications_v1'" in sql
    assert sql.count("BEGIN;") == 1
    assert sql.count("COMMIT;") == 1

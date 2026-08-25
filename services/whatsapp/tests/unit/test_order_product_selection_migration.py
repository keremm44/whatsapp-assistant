from __future__ import annotations

from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "029_add_order_product_selection_state.sql"
)


def migration_sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


def test_029_is_contiguous_after_028() -> None:
    migrations = sorted(
        Path(__file__).resolve().parents[2].joinpath("migrations").glob(
            "[0-9][0-9][0-9]_*.sql"
        )
    )
    versions = [path.name[:3] for path in migrations]
    assert "028" in versions
    assert "029" in versions
    assert versions.index("029") == versions.index("028") + 1


def test_029_adds_awaiting_order_product_to_all_state_checks() -> None:
    sql = migration_sql()
    assert "AWAITING_ORDER_PRODUCT" in sql
    assert "conversation_states_current_state_check" in sql
    assert "state_transitions_from_state_check" in sql
    assert "state_transitions_to_state_check" in sql
    assert sql.count("'AWAITING_ORDER_PRODUCT'") == 3


def test_029_does_not_touch_conversation_control_states() -> None:
    sql = migration_sql()
    statements = "\n".join(
        line for line in sql.splitlines() if not line.lstrip().startswith("--")
    )
    assert "ASSISTANT_ACTIVE" not in statements
    assert "SELLER_TAKEN_OVER" not in statements
    assert "RETURN_REVIEW" not in statements
    assert "ASSISTANT_PAUSED" not in statements
    assert "control_state" not in statements


def test_029_does_not_mutate_business_rows() -> None:
    sql = migration_sql().upper()
    assert "DROP TABLE" not in sql
    assert "TRUNCATE" not in sql
    assert "DELETE FROM" not in sql
    assert "UPDATE PUBLIC." not in sql
    assert "INSERT INTO PUBLIC.SCHEMA_MIGRATIONS" in sql
    assert "ORDER_PRODUCT_SELECTION_STATE_V1" in sql
    assert sql.count("BEGIN;") == 1
    assert sql.count("COMMIT;") == 1


def test_029_does_not_redesign_auth_or_rls() -> None:
    sql = migration_sql().upper()
    assert "CREATE POLICY" not in sql
    assert "AUTH.USERS" not in sql
    assert " TO ANON" not in sql
    assert " TO AUTHENTICATED" not in sql

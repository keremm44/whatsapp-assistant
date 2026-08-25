from pathlib import Path


def test_061_completion_function_is_invoker_and_service_role_only() -> None:
    sql = Path("migrations/061_honor_order_number_requirement.sql").read_text(encoding="utf-8").lower()
    assert "security definer" not in sql
    assert "set search_path = pg_catalog, public" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql
    assert "drop table" not in sql
    assert "truncate" not in sql
    assert "delete from" not in sql

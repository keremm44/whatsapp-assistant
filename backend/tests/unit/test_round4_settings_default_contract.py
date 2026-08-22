from pathlib import Path


def test_order_number_missing_defaults_to_required_in_python_and_sql() -> None:
    policy = Path("order_collection_policy.py").read_text(encoding="utf-8")
    sql = Path("migrations/061_honor_order_number_requirement.sql").read_text(encoding="utf-8").lower()
    assert '"order_number_required",\n        default_when_missing=true' in policy.lower()
    assert "order_number_required boolean := true" in sql

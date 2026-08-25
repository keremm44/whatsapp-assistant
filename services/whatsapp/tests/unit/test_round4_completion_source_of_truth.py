from pathlib import Path


def test_python_and_sql_share_requirement_keys() -> None:
    policy = Path("order_collection_policy.py").read_text(encoding="utf-8")
    sql = Path("migrations/061_honor_order_number_requirement.sql").read_text(encoding="utf-8")
    for key in ("order_number_required", "image_required", "custom_text_required"):
        assert key in policy
        assert key in sql

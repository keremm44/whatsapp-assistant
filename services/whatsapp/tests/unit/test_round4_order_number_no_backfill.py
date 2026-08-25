from pathlib import Path


def test_061_does_not_backfill_seller_product_info() -> None:
    sql = Path("migrations/061_honor_order_number_requirement.sql").read_text(encoding="utf-8").lower()
    assert "update public.sellers" not in sql
    assert "insert into public.sellers" not in sql
    assert "order_number_required boolean := true" in sql

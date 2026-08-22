from pathlib import Path


def test_order_number_requirement_is_not_ai_derived() -> None:
    source = Path("order_collection_policy.py").read_text(encoding="utf-8")
    assert "get_seller_product_info" in source
    assert "intent" not in source.lower()

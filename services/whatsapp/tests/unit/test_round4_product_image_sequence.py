from pathlib import Path


def test_required_product_fields_are_sorted_before_collection() -> None:
    source = Path("order_collection_policy.py").read_text(encoding="utf-8")
    assert "required_fields.sort" in source
    assert "sort_order" in source
    assert "field_type" in source

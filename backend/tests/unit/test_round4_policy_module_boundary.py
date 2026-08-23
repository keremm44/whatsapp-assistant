from pathlib import Path


def test_order_collection_policy_is_deterministic_module() -> None:
    source = Path("order_collection_policy.py").read_text(encoding="utf-8")
    assert "ai_engine" not in source
    assert "classify_intent" not in source
    assert "get_seller_product_info" in source

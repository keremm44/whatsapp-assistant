from pathlib import Path


def test_collection_policy_reads_requirements_only_from_seller_config() -> None:
    source = Path("order_collection_policy.py").read_text(encoding="utf-8")
    assert "get_seller_product_info" in source
    assert '"order_number_required"' in source
    assert '"image_required"' in source
    assert '"custom_text_required"' in source
    assert "classify_intent" not in source
    assert "OpenAI" not in source

import order_collection_policy as policy


def test_requirement_defaults_preserve_existing_behavior(monkeypatch) -> None:
    monkeypatch.setattr(
        policy,
        "get_seller_product_info",
        lambda seller_id: {"durum": "başarılı", "product_info": {"order": {}}},
    )

    result = policy.read_order_collection_requirements(1)

    assert result == (True, True, True, False, None)

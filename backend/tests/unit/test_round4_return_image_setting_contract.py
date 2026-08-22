from pathlib import Path


def test_return_image_requirement_remains_per_issue_type_setting() -> None:
    source = Path("return_issue_service.py").read_text(encoding="utf-8")
    assert "RETURN_IMAGE_REQUIREMENTS" in source
    assert "image_requirement_snapshot" in source
    assert 'missing.append("image")' in source


def test_round4_does_not_duplicate_return_image_requirement_into_order_settings() -> None:
    source = Path("seller_settings_service.py").read_text(encoding="utf-8")
    order_block = source[source.index("class OrderSettingsPatch") : source.index("class UsageSettingsPatch")]
    assert "return_image" not in order_block
    assert "order_number_required" in order_block
    assert "image_required" in order_block
    assert "custom_text_required" in order_block

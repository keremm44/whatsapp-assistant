from pathlib import Path


def test_return_photo_preferences_are_not_reimplemented_in_round4_order_settings() -> None:
    return_source = Path("return_issue_service.py").read_text(encoding="utf-8")
    settings_source = Path("seller_settings_service.py").read_text(encoding="utf-8")
    assert "RETURN_IMAGE_REQUIREMENTS" in return_source
    assert "return_image_required" not in settings_source

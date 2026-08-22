from pathlib import Path


def test_backend_settings_surface_exposes_order_number_requirement() -> None:
    source = Path("seller_settings_service.py").read_text(encoding="utf-8")
    block = source[source.index("class OrderSettingsPatch") : source.index("class UsageSettingsPatch")]
    assert "order_number_required" in block
    assert '"order_number_required"' in block

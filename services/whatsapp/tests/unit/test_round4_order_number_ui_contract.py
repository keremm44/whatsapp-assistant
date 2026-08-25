from pathlib import Path


def test_frontend_contract_contains_order_number_requirement() -> None:
    source = (
        Path(__file__).resolve().parents[4]
        / "frontend"
        / "src"
        / "lib"
        / "seller"
        / "assistant-settings.ts"
    ).read_text(encoding="utf-8")
    assert "orderNumberRequired" in source
    assert "order_number_required" in source

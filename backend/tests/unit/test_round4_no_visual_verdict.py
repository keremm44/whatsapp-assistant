from pathlib import Path


def test_return_image_flow_keeps_seller_as_decision_maker() -> None:
    source = Path("return_issue_service.py").read_text(encoding="utf-8").lower()
    assert "seller_review_required" in source
    assert "image_requirement_snapshot" in source
    assert "damage_probability" not in source
    assert "vision verdict" not in source

from pathlib import Path


def test_bare_normal_image_has_no_unconditional_order_attachment_path() -> None:
    orchestrator = Path("chat_service/orchestrator.py").read_text(encoding="utf-8")
    order_state = Path("chat_service/order_state.py").read_text(encoding="utf-8")
    assert "image_message_id=incoming_message_id" not in orchestrator
    assert 'current_state == "AWAITING_IMAGE"' in order_state

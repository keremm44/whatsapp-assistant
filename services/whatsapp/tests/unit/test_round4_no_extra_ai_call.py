from pathlib import Path


def test_round4_image_routing_does_not_add_separate_vision_provider_call() -> None:
    orchestrator = Path("chat_service/orchestrator.py").read_text(encoding="utf-8")
    order_state = Path("chat_service/order_state.py").read_text(encoding="utf-8")
    return_flow = Path("chat_service/return_flow.py").read_text(encoding="utf-8")

    combined = "\n".join((orchestrator, order_state, return_flow))
    assert "vision_client" not in combined
    assert "classify_image" not in combined
    assert "analyze_image" not in combined

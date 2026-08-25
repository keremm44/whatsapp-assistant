from pathlib import Path


def test_context_first_image_semantics_are_explicit_in_runtime_sources() -> None:
    orchestrator = Path("chat_service/orchestrator.py").read_text(encoding="utf-8")
    order_state = Path("chat_service/order_state.py").read_text(encoding="utf-8")

    assert orchestrator.index("continue_active_return_issue_request(") < orchestrator.index(
        "order_state.process_active_state("
    )
    assert 'current_state == "AWAITING_IMAGE"' in order_state
    assert 'message_type != "image"' in order_state

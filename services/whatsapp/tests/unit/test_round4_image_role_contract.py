from pathlib import Path


def test_return_context_gets_image_before_order_state() -> None:
    source = Path("chat_service/orchestrator.py").read_text(encoding="utf-8")
    return_pos = source.index("continue_active_return_issue_request(")
    order_pos = source.index("order_state.process_active_state(")
    assert return_pos < order_pos


def test_core_personalization_image_requires_authoritative_order_state() -> None:
    source = Path("chat_service/order_state.py").read_text(encoding="utf-8")
    marker = 'if current_state == "AWAITING_IMAGE":'
    block = source[source.index(marker) : source.index('if current_state == "AWAITING_CUSTOM_TEXT":')]
    assert 'if message_type != "image":' in block
    assert "image_message_id=source_message_id" in block
    assert "return_issue_process_message" not in block


def test_product_specific_image_uses_message_reference_not_media_url() -> None:
    source = Path("order_service.py").read_text(encoding="utf-8")
    image_block = source[source.index('if field_type == "image":') : source.index("return False, None, f\"Desteklenmeyen alan tipi")]
    assert 'value.get("message_id")' in image_block
    assert 'return True, {"message_id": message_id}, None' in image_block
    assert "media_url" not in image_block


def test_return_evidence_collection_does_not_need_visual_damage_judgement() -> None:
    source = Path("return_issue_service.py").read_text(encoding="utf-8")
    assert "image_requirement_snapshot" in source
    assert "add_return_issue_request_evidence" in source
    forbidden = (
        "broken_probability",
        "damage_score",
        "vision_damage",
        "is_broken_by_ai",
    )
    for token in forbidden:
        assert token not in source

from pathlib import Path


def test_product_specific_image_fields_remain_supported() -> None:
    source = Path("order_service.py").read_text(encoding="utf-8")
    assert 'if field_type == "image":' in source
    assert 'return True, {"message_id": message_id}, None' in source
    assert 'question": f"{label} görselini gönderebilir misiniz?"' in source

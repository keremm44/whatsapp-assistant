from pagination import decode_cursor, encode_cursor


def test_signed_cursor_round_trips_only_for_its_seller() -> None:
    cursor = encode_cursor(seller_id=11, sort_value="2026-08-21T12:00:00+00:00", row_id=42)
    assert decode_cursor(cursor, seller_id=11) == ("2026-08-21T12:00:00+00:00", 42)
    assert decode_cursor(cursor, seller_id=12) is None


def test_cursor_rejects_tampering() -> None:
    cursor = encode_cursor(seller_id=11, sort_value="2026-08-21T12:00:00+00:00", row_id=42)
    assert decode_cursor(cursor[:-1] + ("A" if cursor[-1] != "A" else "B"), seller_id=11) is None

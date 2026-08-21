import pytest

from pagination import (
    LIST_CURSOR_VERSION,
    SellerListCursorError,
    decode_cursor,
    decode_seller_list_cursor,
    encode_cursor,
    encode_seller_list_cursor,
)


def test_signed_cursor_round_trips_only_for_its_seller() -> None:
    cursor = encode_cursor(seller_id=11, sort_value="2026-08-21T12:00:00+00:00", row_id=42)
    assert decode_cursor(cursor, seller_id=11) == ("2026-08-21T12:00:00+00:00", 42)
    assert decode_cursor(cursor, seller_id=12) is None


def test_cursor_rejects_tampering() -> None:
    cursor = encode_cursor(seller_id=11, sort_value="2026-08-21T12:00:00+00:00", row_id=42)
    assert decode_cursor(cursor[:-1] + ("A" if cursor[-1] != "A" else "B"), seller_id=11) is None


# =====================================================
# SELLER LIST V2 CURSORS (seller-bound + queue + filter)
# =====================================================

LIST_FILTERS = {"view": "all", "customer_id": None, "status": None}
LIST_POSITION = {"updated_at": "2026-08-21T12:00:00+00:00", "id": 42}


def test_seller_list_cursor_round_trips_for_its_seller() -> None:
    cursor = encode_seller_list_cursor(
        seller_id=11,
        queue="seller_orders_v2",
        filters=LIST_FILTERS,
        position=LIST_POSITION,
    )
    assert (
        decode_seller_list_cursor(
            cursor,
            seller_id=11,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
        )
        == LIST_POSITION
    )


def test_seller_list_cursor_fail_closed_for_other_seller() -> None:
    cursor = encode_seller_list_cursor(
        seller_id=11,
        queue="seller_orders_v2",
        filters=LIST_FILTERS,
        position=LIST_POSITION,
    )
    with pytest.raises(SellerListCursorError):
        decode_seller_list_cursor(
            cursor,
            seller_id=12,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
        )


def test_seller_list_cursor_fail_closed_for_other_queue() -> None:
    cursor = encode_seller_list_cursor(
        seller_id=11,
        queue="seller_orders_v2",
        filters=LIST_FILTERS,
        position=LIST_POSITION,
    )
    with pytest.raises(SellerListCursorError):
        decode_seller_list_cursor(
            cursor,
            seller_id=11,
            queue="seller_returns_v2",
            filters=LIST_FILTERS,
        )


def test_seller_list_cursor_fail_closed_for_different_filters() -> None:
    cursor = encode_seller_list_cursor(
        seller_id=11,
        queue="seller_orders_v2",
        filters=LIST_FILTERS,
        position=LIST_POSITION,
    )
    with pytest.raises(SellerListCursorError):
        decode_seller_list_cursor(
            cursor,
            seller_id=11,
            queue="seller_orders_v2",
            filters={"view": "collecting", "customer_id": None, "status": None},
        )


def test_seller_list_cursor_filter_fingerprint_is_order_insensitive() -> None:
    cursor = encode_seller_list_cursor(
        seller_id=11,
        queue="seller_orders_v2",
        filters={"view": "all", "customer_id": None, "status": None},
        position=LIST_POSITION,
    )
    # Aynı filtre kümesi, farklı sözlük sırasıyla aynı parmak izini üretir.
    assert (
        decode_seller_list_cursor(
            cursor,
            seller_id=11,
            queue="seller_orders_v2",
            filters={"status": None, "view": "all", "customer_id": None},
        )
        == LIST_POSITION
    )


def test_seller_list_cursor_rejects_tampering() -> None:
    cursor = encode_seller_list_cursor(
        seller_id=11,
        queue="seller_orders_v2",
        filters=LIST_FILTERS,
        position=LIST_POSITION,
    )
    tampered = cursor[:-1] + ("A" if cursor[-1] != "A" else "B")
    with pytest.raises(SellerListCursorError):
        decode_seller_list_cursor(
            tampered,
            seller_id=11,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
        )


def test_seller_list_cursor_rejects_garbage_and_oversized_tokens() -> None:
    with pytest.raises(SellerListCursorError):
        decode_seller_list_cursor(
            "not***base64",
            seller_id=11,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
        )
    with pytest.raises(SellerListCursorError):
        decode_seller_list_cursor(
            "a" * 2049,
            seller_id=11,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
        )
    with pytest.raises(SellerListCursorError):
        decode_seller_list_cursor(
            "",
            seller_id=11,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
        )


def test_seller_list_cursor_rejects_truncated_signature() -> None:
    cursor = encode_seller_list_cursor(
        seller_id=11,
        queue="seller_orders_v2",
        filters=LIST_FILTERS,
        position=LIST_POSITION,
    )
    with pytest.raises(SellerListCursorError):
        decode_seller_list_cursor(
            cursor[: -3],
            seller_id=11,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
        )


def test_seller_list_cursor_rejects_invalid_encode_inputs() -> None:
    with pytest.raises(SellerListCursorError):
        encode_seller_list_cursor(
            seller_id=0,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
            position=LIST_POSITION,
        )
    with pytest.raises(SellerListCursorError):
        encode_seller_list_cursor(
            seller_id=True,  # type: ignore[arg-type]
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
            position=LIST_POSITION,
        )
    with pytest.raises(SellerListCursorError):
        encode_seller_list_cursor(
            seller_id=11,
            queue="",
            filters=LIST_FILTERS,
            position=LIST_POSITION,
        )
    with pytest.raises(SellerListCursorError):
        encode_seller_list_cursor(
            seller_id=11,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
            position={},
        )


def test_seller_list_cursor_does_not_accept_legacy_tokens() -> None:
    legacy = encode_cursor(seller_id=11, sort_value="2026-08-21T12:00:00+00:00", row_id=42)
    with pytest.raises(SellerListCursorError):
        decode_seller_list_cursor(
            legacy,
            seller_id=11,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
        )


def test_seller_list_cursor_production_requires_secret(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("PAGINATION_CURSOR_SECRET", raising=False)
    with pytest.raises(SellerListCursorError):
        encode_seller_list_cursor(
            seller_id=11,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
            position=LIST_POSITION,
        )
    with pytest.raises(SellerListCursorError):
        decode_seller_list_cursor(
            "abc",
            seller_id=11,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
        )


def test_seller_list_cursor_development_uses_default_secret(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("PAGINATION_CURSOR_SECRET", raising=False)
    cursor = encode_seller_list_cursor(
        seller_id=11,
        queue="seller_orders_v2",
        filters=LIST_FILTERS,
        position=LIST_POSITION,
    )
    assert (
        decode_seller_list_cursor(
            cursor,
            seller_id=11,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
        )
        == LIST_POSITION
    )


def test_seller_list_cursor_rejects_too_short_secret(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("PAGINATION_CURSOR_SECRET", "short")
    with pytest.raises(SellerListCursorError):
        encode_seller_list_cursor(
            seller_id=11,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
            position=LIST_POSITION,
        )


def test_seller_list_cursor_explicit_secret_round_trips(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("PAGINATION_CURSOR_SECRET", "0123456789abcdef0123")
    cursor = encode_seller_list_cursor(
        seller_id=11,
        queue="seller_orders_v2",
        filters=LIST_FILTERS,
        position=LIST_POSITION,
    )
    assert (
        decode_seller_list_cursor(
            cursor,
            seller_id=11,
            queue="seller_orders_v2",
            filters=LIST_FILTERS,
        )
        == LIST_POSITION
    )
    assert LIST_CURSOR_VERSION == 1

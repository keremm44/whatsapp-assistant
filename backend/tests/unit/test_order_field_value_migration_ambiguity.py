from pathlib import Path


def test_record_order_field_value_uses_unambiguous_source_message_reference():
    root = Path(__file__).resolve().parents[2]
    sql_014 = (root / "migrations" / "014_create_orders_and_field_definitions.sql").read_text(encoding="utf-8")
    sql_019 = (root / "migrations" / "019_fix_order_field_value_parameter_ambiguity.sql").read_text(encoding="utf-8")

    bad = "AND source_message_id = source_message_id"
    fixed = "existing_value.source_message_id = record_order_field_value.source_message_id"

    assert bad not in sql_014
    assert bad not in sql_019
    assert fixed in sql_014
    assert fixed in sql_019
    assert "SET search_path = pg_catalog, public" in sql_019

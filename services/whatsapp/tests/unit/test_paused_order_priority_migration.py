from pathlib import Path
import re


MIGRATION = Path("migrations/031_prioritize_paused_conversations_with_orders.sql")
SQL = MIGRATION.read_text(encoding="utf-8")
LOWER = SQL.lower()
NORMALIZED = " ".join(LOWER.split())


def test_031_exposes_explicit_active_order_semantic() -> None:
    assert "(ao.id is not null) as has_active_order" in LOWER
    assert "'has_active_order', p.has_active_order" in LOWER


def test_031_reuses_existing_active_order_definition() -> None:
    assert "o.status in ('collecting', 'seller_review_required')" in LOWER
    assert "complete" not in re.search(
        r"left join lateral \(\s*select\s+o\.id,.*?\) as ao on true",
        LOWER,
        re.DOTALL,
    ).group(0)


def test_031_prioritizes_orders_only_for_paused_queue() -> None:
    priority = (
        "case when target_control_state = 'assistant_paused' "
        "then has_active_order else false end desc, needs_attention desc, "
        "sort_at desc, customer_id desc"
    )
    aggregate_priority = (
        "case when target_control_state = 'assistant_paused' "
        "then p.has_active_order else false end desc, p.needs_attention desc, "
        "p.sort_at desc, p.customer_id desc"
    )
    assert priority in NORMALIZED
    assert aggregate_priority in NORMALIZED


def test_031_preserves_recency_and_deterministic_tie_breaker_before_pagination() -> None:
    assert "needs_attention desc, sort_at desc, customer_id desc" in NORMALIZED
    assert re.search(
        r"customer_id desc\s+limit result_limit\s+offset result_offset",
        LOWER,
    )


def test_031_keeps_tenant_scope_and_single_query_without_row_multiplication() -> None:
    assert "where c.seller_id = target_seller_id" in LOWER
    assert "o.seller_id = c.seller_id" in LOWER
    assert "o.customer_id = c.id" in LOWER
    order_lateral = re.search(
        r"left join lateral \(\s*select\s+o\.id,.*?\) as ao on true",
        LOWER,
        re.DOTALL,
    ).group(0)
    assert "limit 1" in order_lateral
    assert LOWER.count("from public.orders as o") == 1


def test_031_is_read_model_only_service_role_migration() -> None:
    assert "update public." not in LOWER
    assert "delete from" not in LOWER
    assert "truncate" not in LOWER
    assert "drop table" not in LOWER
    assert "from public, anon, authenticated" in LOWER
    assert "to service_role" in LOWER
    assert "'031'" in SQL
    assert "prioritize_paused_conversations_with_orders" in SQL
    assert "paused_conversation_order_priority_v1" in SQL

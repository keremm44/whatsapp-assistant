from pathlib import Path


def _sql() -> str:
    return Path("migrations/049_enforce_customer_identity_uniqueness.sql").read_text(
        encoding="utf-8"
    ).lower()


def test_049_repairs_duplicates_before_unique_constraint() -> None:
    sql = _sql()

    assert "create temp table _customer_identity_merge" in sql
    assert "min(c.id) over" in sql
    assert "delete from public.conversation_states" in sql
    assert "update public.messages" in sql
    assert "update public.orders" in sql
    assert "update public.state_transitions" in sql
    assert "delete from public.customers" in sql
    assert "customers_seller_whatsapp_unique" in sql
    assert "unique (seller_id, whatsapp_number)" in sql


def test_049_fails_closed_on_unsafe_duplicate_business_state() -> None:
    sql = _sql()

    assert "active duplicate flow state" in sql
    assert "duplicate control state is not assistant-active" in sql
    assert "multiple active orders" in sql
    assert "multiple open return issues" in sql
    assert "multiple quantity reviews" in sql
    assert "max(control_version) + 1" in sql
    assert "max(state_version) + 1" in sql


def test_049_atomic_customer_rpc_uses_unique_conflict_target() -> None:
    sql = _sql()

    assert "create or replace function public.get_or_create_customer_identity" in sql
    assert "on conflict (seller_id, whatsapp_number) do nothing" in sql
    assert "returning * into customer_row" in sql
    assert "where c.seller_id = target_seller_id" in sql
    assert "and c.whatsapp_number = normalized_number" in sql
    assert "'created', created_value" in sql


def test_049_customer_rpc_is_backend_only_and_registered() -> None:
    sql = _sql()

    assert "set search_path = pg_catalog, public" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql
    assert "'049'" in sql
    assert "'enforce_customer_identity_uniqueness'" in sql
    assert "'enforce_customer_identity_uniqueness_v1'" in sql

from pathlib import Path


def test_034_quantity_review_schema_and_rpc_contract() -> None:
    sql = Path("migrations/034_add_quantity_limit_review_requests.sql").read_text(
        encoding="utf-8"
    )
    lowered = sql.lower()

    assert "'quantity_limit_request'" in lowered
    assert "requested_quantity integer" in lowered
    assert "min_quantity_snapshot integer" in lowered
    assert "max_quantity_snapshot integer" in lowered
    assert "quantity_limit_direction varchar(16)" in lowered
    assert "uq_return_issue_requests_one_open_regular_per_customer" in lowered
    assert "uq_return_issue_requests_one_open_quantity_per_customer" in lowered
    assert "issue_type <> 'quantity_limit_request'" in lowered
    assert "create or replace function public.evaluate_quantity_limit_request" in lowered
    assert "seller_product_info -> 'order' ->> 'min_quantity'" in lowered
    assert "seller_product_info -> 'order' ->> 'max_quantity'" in lowered
    assert "'status', 'within_limit'" in lowered
    assert "'status', 'seller_review_required'" not in lowered
    assert "'status', 'review_required'" in lowered
    assert "'seller_review_required'" in lowered
    assert "'not_requested'" in lowered
    assert "grant execute on function public.evaluate_quantity_limit_request" in lowered
    assert "'034'" in lowered
    assert "'add_quantity_limit_review_requests'" in lowered


def test_034_quantity_review_never_changes_conversation_control_or_creates_order() -> None:
    sql = Path("migrations/034_add_quantity_limit_review_requests.sql").read_text(
        encoding="utf-8"
    ).lower()

    assert "transition_conversation_control" not in sql
    assert "insert into public.orders" not in sql
    assert "create_order" not in sql


def test_quantity_chat_gate_runs_before_order_collection_mutation() -> None:
    source = Path("chat_service.py").read_text(encoding="utf-8")

    quantity_pos = source.index("quantity_result = handle_quantity_message(")
    state_pos = source.index("state_response = process_active_state(")
    active_return_pos = source.index(
        "return_issue_response = continue_active_return_issue_request("
    )

    assert active_return_pos < quantity_pos < state_pos
    assert 'source="quantity_limit"' in source


def test_regular_return_collection_excludes_quantity_review_rows() -> None:
    repository_source = Path("return_issue_repository.py").read_text(encoding="utf-8")
    service_source = Path("return_issue_service.py").read_text(encoding="utf-8")

    assert '.neq("issue_type", QUANTITY_LIMIT_ISSUE_TYPE)' in repository_source
    assert "get_active_collectable_return_issue_request" in service_source
    assert "QUANTITY_LIMIT_REQUEST" not in service_source.split(
        "ISSUE_TYPE_ORDER = [", 1
    )[1].split("]", 1)[0]

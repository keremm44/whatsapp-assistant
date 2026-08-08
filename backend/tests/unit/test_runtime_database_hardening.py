from __future__ import annotations

from pathlib import Path


MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "018_harden_runtime_database.sql"
)


def test_migration_018_records_version_and_keeps_backend_only_model() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "'018'" in content
    assert "'harden_runtime_database'" in content
    assert "CREATE POLICY" not in content
    assert "GRANT ALL" not in content
    assert "TO anon" not in content
    assert "TO authenticated" not in content


def test_migration_018_fixes_legacy_seller_defaults() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "ALTER COLUMN email DROP DEFAULT" in content
    assert "ALTER COLUMN phone DROP DEFAULT" in content
    assert "ALTER COLUMN status SET DEFAULT 'pending'" in content


def test_migration_018_hardens_all_runtime_function_search_paths() -> None:
    content = MIGRATION_PATH.read_text(encoding="utf-8")

    expected_functions = [
        "set_updated_at",
        "initialize_seller_onboarding",
        "unlock_next_onboarding_step",
        "enforce_onboarding_sequence",
        "complete_seller_onboarding_step",
        "transition_conversation_control",
        "resume_conversation_assistant",
        "_order_presenter",
        "_lock_order_scope",
        "get_or_create_active_order",
        "set_order_product_and_snapshot_fields",
        "record_order_field_value",
        "update_order_core",
        "_recompute_order_completion",
        "flag_order_review",
        "initialize_order_collection",
        "update_order_core_from_message",
        "_return_issue_request_presenter",
        "create_or_get_return_issue_request",
        "update_return_issue_request_from_message",
        "add_return_issue_request_evidence",
        "mark_return_issue_review_required",
        "mark_return_issue_handled",
        "update_return_issue_type_setting",
        "_normalize_unanswered_question_text",
        "_unanswered_question_group_presenter",
        "get_answered_unanswered_question",
        "record_unanswered_question_occurrence",
        "set_unanswered_question_answer",
        "dismiss_unanswered_question_group",
    ]

    for function_name in expected_functions:
        assert f"ALTER FUNCTION public.{function_name}" in content

    assert content.count("SET search_path = pg_catalog, public;") == len(expected_functions)

from pathlib import Path
import re


MIGRATION = Path("migrations/042_extend_announcements_presentation.sql")
SQL = MIGRATION.read_text(encoding="utf-8")
LOWER = SQL.lower()
NORMALIZED = " ".join(LOWER.split())


def _function_body(name: str) -> str:
    match = re.search(
        rf"create or replace function public\.{name}\(.*?as \$\$\n(.*?)\n\$\$;",
        LOWER,
        re.DOTALL,
    )
    assert match is not None
    return match.group(1)


def test_042_adds_presentation_columns_and_safe_constraints() -> None:
    assert "add column if not exists importance text not null default 'normal'" in NORMALIZED
    assert "add column if not exists image_url text" in NORMALIZED
    assert "chk_announcements_importance" in LOWER
    assert "importance in ('normal', 'important')" in LOWER
    assert "chk_announcements_image_url" in LOWER
    assert "left(lower(btrim(image_url)), 8) = 'https://'" in LOWER
    assert "position('@' in split_part" in LOWER


def test_042_replaces_under_specified_create_function() -> None:
    assert "drop function if exists public.create_announcement(bigint, text, text, text, bigint[])" in NORMALIZED
    body = _function_body("create_announcement")
    assert "importance_value" in body
    assert "image_url_value" in body
    assert "announcement_row.importance" in body
    assert "announcement_row.image_url" in body


def test_042_returns_presentation_fields_and_real_unread_count() -> None:
    for name in (
        "get_admin_announcements_list",
        "get_admin_announcement_detail",
        "get_seller_announcements_list",
        "get_seller_announcement_detail",
    ):
        body = _function_body(name)
        assert (
            "a.importance" in body
            or "importance', a.importance" in body
            or "announcement_row.importance" in body
        )
        assert (
            "a.image_url" in body
            or "image_url', a.image_url" in body
            or "announcement_row.image_url" in body
        )

    seller_list = _function_body("get_seller_announcements_list")
    assert "unread_count_value" in seller_list
    assert "at.read_at is null" in seller_list

    count = _function_body("get_seller_announcements_unread_count")
    assert "count(*)" in count
    assert "at.seller_id = target_seller_id" in count
    assert "at.read_at is null" in count

    mark_read = _function_body("mark_seller_announcement_read")
    assert "'unread_count', unread_count_value" in mark_read


def test_042_is_service_role_only_and_registered() -> None:
    assert "revoke all on function public.create_announcement" in LOWER
    assert "revoke all on function public.get_seller_announcements_unread_count" in LOWER
    assert "grant execute on function public.create_announcement" in LOWER
    assert "grant execute on function public.get_seller_announcements_unread_count" in LOWER
    assert "values ('042', 'extend_announcements_presentation', 'v1', current_user)" in NORMALIZED

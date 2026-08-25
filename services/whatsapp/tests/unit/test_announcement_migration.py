from pathlib import Path
import re


MIGRATION = Path("migrations/032_create_announcements.sql")
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


def test_032_uses_independent_announcement_and_target_tables() -> None:
    assert "create table if not exists public.announcements" in LOWER
    assert "create table if not exists public.announcement_targets" in LOWER
    assert "primary key (announcement_id, seller_id)" in LOWER
    assert "insert into public.seller_notifications" not in LOWER
    assert "references public.announcements(id)" in LOWER
    assert "references public.sellers(id)" in LOWER


def test_032_has_required_content_audience_audit_and_read_state_constraints() -> None:
    assert "between 1 and 200" in LOWER
    assert "between 1 and 4000" in LOWER
    assert "audience_type in ('all_sellers', 'selected_sellers')" in LOWER
    assert "created_by_profile_id bigint not null" in NORMALIZED
    assert "published_at timestamptz not null default now()" in NORMALIZED
    assert "read_at timestamptz" in LOWER


def test_032_publish_materializes_all_or_selected_targets_atomically() -> None:
    body = _function_body("create_announcement")
    announcement_insert = body.index("insert into public.announcements")
    all_insert = body.index("insert into public.announcement_targets", announcement_insert)
    normalized_body = " ".join(body.split())
    assert "select announcement_row.id, s.id from public.sellers as s" in normalized_body
    assert "where s.system_status in ('active', 'beta_active')" in normalized_body
    assert "from unnest(seller_ids_value)" in body
    assert announcement_insert < all_insert
    assert "get diagnostics target_count_value = row_count" in body


def test_032_rejects_duplicate_missing_and_unknown_selected_sellers_before_insert() -> None:
    body = _function_body("create_announcement")
    announcement_insert = body.index("insert into public.announcements")
    assert "cardinality(seller_ids_value)" in body
    assert "count(distinct requested.seller_id)" in body
    assert "left join public.sellers as s" in body
    assert body.index("count(distinct requested.seller_id)") < announcement_insert
    assert body.index("left join public.sellers as s") < announcement_insert


def test_032_seller_reads_and_write_are_tenant_target_scoped() -> None:
    list_body = _function_body("get_seller_announcements_list")
    detail_body = _function_body("get_seller_announcement_detail")
    read_body = _function_body("mark_seller_announcement_read")
    assert "at.seller_id = target_seller_id" in list_body
    assert "at.seller_id = target_seller_id" in detail_body
    assert "at.announcement_id = target_announcement_id" in detail_body
    assert "at.seller_id = target_seller_id" in read_body
    assert "at.announcement_id = target_announcement_id" in read_body


def test_032_mark_read_is_idempotent_and_preserves_first_timestamp() -> None:
    body = _function_body("mark_seller_announcement_read")
    assert "and at.read_at is null" in body
    assert "'changed', true" in body
    assert "'changed', false" in body
    assert body.count("set read_at = now()") == 1


def test_032_lists_have_counts_and_deterministic_pagination() -> None:
    admin_body = _function_body("get_admin_announcements_list")
    seller_body = _function_body("get_seller_announcements_list")
    assert "count(at.seller_id)" in admin_body
    assert "count(at.read_at)" in admin_body
    for body in (admin_body, seller_body):
        assert "order by a.published_at desc, a.id desc" in body
        assert "limit result_limit" in body
        assert "offset result_offset" in body


def test_032_security_definer_functions_are_service_role_only() -> None:
    assert LOWER.count("security definer") == 6
    assert LOWER.count("set search_path = pg_catalog, public") == 6
    assert "alter table public.announcements enable row level security" in LOWER
    assert "alter table public.announcement_targets enable row level security" in LOWER
    assert LOWER.count("revoke all privileges on table public.announcement") == 2
    assert "revoke all privileges on sequence public.announcements_id_seq" in LOWER
    assert LOWER.count("from public, anon, authenticated") == 9
    assert LOWER.count("to service_role") == 9
    assert "'032'" in SQL
    assert "create_announcements" in SQL


def test_032_has_no_out_of_scope_delivery_or_editing_features() -> None:
    for column in (
        "scheduled_at",
        "draft",
        "attachment",
        "email_delivery",
        "push_delivery",
        "whatsapp_delivery",
    ):
        assert column not in LOWER
    assert "update public.announcements" not in LOWER

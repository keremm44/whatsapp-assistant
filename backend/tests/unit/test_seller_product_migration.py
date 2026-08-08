from pathlib import Path

SQL = Path("migrations/025_add_seller_product_crud.sql").read_text(encoding="utf-8")
LOWER = SQL.lower()


def test_025_adds_product_version_and_normalized_unique_name() -> None:
    assert "version bigint not null default 1" in LOWER
    assert "chk_products_version" in LOWER
    assert "uq_products_seller_name_normalized" in LOWER
    assert "lower(btrim(name::text))" in LOWER


def test_025_exposes_only_expected_product_rpcs() -> None:
    for name in (
        "get_seller_products",
        "create_seller_product",
        "update_seller_product",
    ):
        assert f"function public.{name}" in LOWER
    assert "delete_seller_product" not in LOWER


def test_025_hardens_rpc_permissions() -> None:
    assert "from public, anon, authenticated" in LOWER
    assert "to service_role" in LOWER
    assert "security definer" not in LOWER
    assert "search_path = pg_catalog, public" in LOWER


def test_025_preserves_product_history() -> None:
    assert "delete from public.products" not in LOWER
    assert "drop table" not in LOWER
    assert "truncate" not in LOWER


def test_025_records_canonical_migration() -> None:
    assert "'025'" in SQL
    assert "add_seller_product_crud" in SQL
    assert "seller_product_crud_v1" in SQL

from __future__ import annotations

from pathlib import Path

from scripts.check_migration_parity import (
    compare_versions,
    discover_local_versions,
    normalize_remote_versions,
)


def test_local_migration_chain_is_contiguous() -> None:
    versions = discover_local_versions()

    assert versions[0] == "000"
    assert versions == [f"{value:03d}" for value in range(int(versions[-1]) + 1)]


def test_parity_detects_a_skipped_migration_even_when_later_version_exists() -> None:
    local = ["040", "041", "042", "043"]
    remote = ["040", "042"]

    missing, unexpected = compare_versions(local, remote)

    assert missing == ["041", "043"]
    assert unexpected == []


def test_parity_detects_database_versions_missing_from_repo() -> None:
    missing, unexpected = compare_versions(["041", "042"], ["041", "042", "044"])

    assert missing == []
    assert unexpected == ["044"]


def test_remote_version_normalization_ignores_empty_values() -> None:
    rows = [
        {"version": "42"},
        {"version": " 043 "},
        {"version": ""},
        {"version": None},
    ]

    assert normalize_remote_versions(rows) == ["042", "043"]


def test_local_chain_rejects_a_gap(tmp_path: Path) -> None:
    (tmp_path / "000_first.sql").write_text("-- 000", encoding="utf-8")
    (tmp_path / "002_third.sql").write_text("-- 002", encoding="utf-8")

    try:
        discover_local_versions(tmp_path)
        raise AssertionError("A migration gap should fail validation.")
    except RuntimeError as exc:
        assert "001" in str(exc)

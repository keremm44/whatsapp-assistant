from __future__ import annotations

import re
from pathlib import Path


MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
MIGRATION_FILENAME_RE = re.compile(r"^(?P<version>\d{3})_[a-z0-9_]+\.sql$")


def _migration_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


def test_migration_filenames_use_three_digit_versions() -> None:
    files = _migration_files()
    assert files, "backend/migrations must contain migration SQL files"

    invalid = [path.name for path in files if MIGRATION_FILENAME_RE.fullmatch(path.name) is None]
    assert invalid == [], f"invalid migration filenames: {invalid}"


def test_migration_versions_are_contiguous_and_unique() -> None:
    files = _migration_files()
    versions = [
        int(MIGRATION_FILENAME_RE.fullmatch(path.name).group("version"))
        for path in files
    ]

    assert versions[0] == 0, "migration chain must start at 000"
    assert len(versions) == len(set(versions)), "migration versions must be unique"
    assert versions == list(range(versions[-1] + 1)), (
        "migration versions must be contiguous; "
        f"found {versions[0]:03d}-{versions[-1]:03d} with a gap"
    )

from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Iterable

from database.core import get_supabase


MIGRATION_PATTERN = re.compile(r"^(?P<version>\d{3})_(?P<name>.+)\.sql$")
MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"


def discover_local_versions(migrations_dir: Path = MIGRATIONS_DIR) -> list[str]:
    """Return local migration versions after validating a contiguous chain."""
    versions: list[str] = []

    for path in sorted(migrations_dir.glob("*.sql")):
        match = MIGRATION_PATTERN.match(path.name)
        if match is None:
            continue
        versions.append(match.group("version"))

    if not versions:
        raise RuntimeError("No migration files were found.")

    if len(versions) != len(set(versions)):
        duplicates = sorted({version for version in versions if versions.count(version) > 1})
        raise RuntimeError(f"Duplicate migration versions: {', '.join(duplicates)}")

    latest = int(versions[-1])
    expected = [f"{value:03d}" for value in range(latest + 1)]
    if versions != expected:
        missing = sorted(set(expected) - set(versions))
        unexpected = sorted(set(versions) - set(expected))
        details: list[str] = []
        if missing:
            details.append(f"missing local versions: {', '.join(missing)}")
        if unexpected:
            details.append(f"unexpected local versions: {', '.join(unexpected)}")
        raise RuntimeError("Migration chain is not contiguous (" + "; ".join(details) + ").")

    return versions


def normalize_remote_versions(rows: Iterable[dict]) -> list[str]:
    versions = sorted({str(row.get("version", "")).strip().zfill(3) for row in rows})
    return [version for version in versions if version]


def compare_versions(local_versions: Iterable[str], remote_versions: Iterable[str]) -> tuple[list[str], list[str]]:
    local = set(local_versions)
    remote = set(remote_versions)
    return sorted(local - remote), sorted(remote - local)


def load_remote_versions() -> list[str]:
    response = (
        get_supabase()
        .table("schema_migrations")
        .select("version")
        .order("version")
        .execute()
    )
    return normalize_remote_versions(response.data or [])


def _print_versions(label: str, versions: list[str]) -> None:
    latest = versions[-1] if versions else "none"
    print(f"{label}: {len(versions)} migrations, latest={latest}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Validate the local migration chain and, unless --local-only is used, "
            "require exact parity with public.schema_migrations."
        )
    )
    parser.add_argument(
        "--local-only",
        action="store_true",
        help="Validate only migration filenames; do not connect to Supabase.",
    )
    args = parser.parse_args()

    try:
        local_versions = discover_local_versions()
    except RuntimeError as exc:
        print(f"Migration validation failed: {exc}")
        return 1

    _print_versions("Local", local_versions)

    if args.local_only:
        return 0

    try:
        remote_versions = load_remote_versions()
    except Exception as exc:
        print(f"Could not read public.schema_migrations: {exc}")
        return 1

    _print_versions("Database", remote_versions)
    missing, unexpected = compare_versions(local_versions, remote_versions)

    if missing:
        print("Missing in database: " + ", ".join(missing))
    if unexpected:
        print("Present in database but absent locally: " + ", ".join(unexpected))

    if missing or unexpected:
        print("Migration parity FAILED. Apply missing migrations in ascending order; never skip gaps.")
        return 1

    print("Migration parity OK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

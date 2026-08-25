from pathlib import Path
import re


MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"


def test_postgres_function_input_signatures_do_not_use_rowtype_percent_syntax():
    """%ROWTYPE is valid for PL/pgSQL variables, not function argument types."""
    pattern = re.compile(
        r"CREATE\s+OR\s+REPLACE\s+FUNCTION\s+[^\(]+\((.*?)\)\s*RETURNS",
        re.IGNORECASE | re.DOTALL,
    )

    failures = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        sql = path.read_text(encoding="utf-8")
        for signature_args in pattern.findall(sql):
            if "%ROWTYPE" in signature_args.upper():
                failures.append(path.name)
                break

    assert failures == [], (
        "PostgreSQL function parameter signatures cannot use %ROWTYPE: "
        + ", ".join(failures)
    )

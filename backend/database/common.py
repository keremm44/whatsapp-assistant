from __future__ import annotations

from typing import Any


def is_positive_int(value: Any) -> bool:
    """bool değerlerini kimlik olarak kabul etmeden pozitif int doğrular."""
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def extract_rpc_payload(data: Any) -> dict[str, Any] | None:
    """Supabase sürümlerindeki dict/tek elemanlı liste farkını normalize eder."""
    if isinstance(data, dict):
        return data

    if (
        isinstance(data, list)
        and len(data) == 1
        and isinstance(data[0], dict)
    ):
        return data[0]

    return None

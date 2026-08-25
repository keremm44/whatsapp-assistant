from __future__ import annotations

from pathlib import Path

import pytest

from tests.integration import run_whatsapp_concurrency_stress as entrypoint


def test_entrypoint_rejects_production(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("WHATSAPP_STRESS_TARGET", "isolated-test-db")

    with pytest.raises(RuntimeError, match="production APP_ENV"):
        entrypoint._assert_isolated_target()


def test_entrypoint_requires_isolated_database(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.delenv("WHATSAPP_STRESS_TARGET", raising=False)

    with pytest.raises(RuntimeError, match="isolated-test-db"):
        entrypoint._assert_isolated_target()


def test_reclaim_runs_before_pending_duplicate_webhook_case() -> None:
    text = Path("tests/integration/run_whatsapp_concurrency_stress.py").read_text(
        encoding="utf-8"
    )

    assert text.index("_test_worker_reclaim_fencing") < text.index(
        "_test_duplicate_webhook_burst"
    )
    assert "finally:" in text
    assert "stress._cleanup(" in text

from __future__ import annotations

import pytest

from scripts import run_tests


def test_concurrency_runner_rejects_production(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("WHATSAPP_STRESS_TARGET", "isolated-test-db")

    with pytest.raises(SystemExit, match="production APP_ENV"):
        run_tests._assert_concurrency_stress_target()


def test_concurrency_runner_requires_isolated_target(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.delenv("WHATSAPP_STRESS_TARGET", raising=False)

    with pytest.raises(SystemExit, match="isolated-test-db"):
        run_tests._assert_concurrency_stress_target()


def test_concurrency_runner_accepts_isolated_staging(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.setenv("WHATSAPP_STRESS_TARGET", "isolated-test-db")

    run_tests._assert_concurrency_stress_target()

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

import observability
from settings import get_settings


def _settings(
    *,
    dsn: str | None = None,
    traces_sample_rate: float = 0.0,
) -> Any:
    return SimpleNamespace(
        sentry_dsn=dsn,
        sentry_traces_sample_rate=traces_sample_rate,
        app_env="test",
        app_version="0.4.0-test",
        log_level="INFO",
    )


def test_sentry_is_noop_without_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    def must_not_init(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("SENTRY_DSN yokken sentry_sdk.init çağrılmamalı")

    monkeypatch.setattr(observability.sentry_sdk, "init", must_not_init)

    assert observability.init_sentry(_settings()) is False


def test_sentry_uses_privacy_safe_defaults(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    captured: dict[str, Any] = {}
    dsn = "https://public@example.ingest.sentry.io/123"

    def fake_init(**kwargs: Any) -> None:
        captured.update(kwargs)

    monkeypatch.setattr(observability.sentry_sdk, "init", fake_init)

    with caplog.at_level("INFO"):
        enabled = observability.init_sentry(
            _settings(dsn=dsn, traces_sample_rate=0.25)
        )

    assert enabled is True
    assert captured["dsn"] == dsn
    assert captured["environment"] == "test"
    assert captured["release"] == "0.4.0-test"
    assert captured["send_default_pii"] is False
    assert captured["max_request_body_size"] == "never"
    assert captured["traces_sample_rate"] == 0.25
    assert len(captured["integrations"]) == 1
    assert captured["integrations"][0].__class__.__name__ == "FastApiIntegration"
    assert dsn not in caplog.text


def test_sentry_init_failure_is_not_silently_swallowed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_init(**kwargs: Any) -> None:
        raise ValueError("invalid sentry config")

    monkeypatch.setattr(observability.sentry_sdk, "init", fail_init)

    with pytest.raises(ValueError, match="invalid sentry config"):
        observability.init_sentry(
            _settings(dsn="https://public@example.ingest.sentry.io/123")
        )


def test_sentry_settings_default_to_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.delenv("SENTRY_TRACES_SAMPLE_RATE", raising=False)
    get_settings.cache_clear()

    try:
        current = get_settings()
        assert current.sentry_dsn is None
        assert current.sentry_traces_sample_rate == 0.0
    finally:
        get_settings.cache_clear()


def test_sentry_settings_accept_explicit_sampling(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv(
        "SENTRY_DSN",
        "https://public@example.ingest.sentry.io/123",
    )
    monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "0.125")
    get_settings.cache_clear()

    try:
        current = get_settings()
        assert current.sentry_dsn == "https://public@example.ingest.sentry.io/123"
        assert current.sentry_traces_sample_rate == 0.125
    finally:
        get_settings.cache_clear()


@pytest.mark.parametrize(
    "value",
    ["not-a-number", "-0.01", "1.01", "nan"],
)
def test_invalid_sentry_sampling_is_rejected(
    monkeypatch: pytest.MonkeyPatch,
    value: str,
) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", value)
    get_settings.cache_clear()

    try:
        with pytest.raises(RuntimeError, match="SENTRY_TRACES_SAMPLE_RATE"):
            get_settings()
    finally:
        get_settings.cache_clear()


def test_operational_alert_uses_fingerprint_and_cooldown(monkeypatch) -> None:
    captures: list[tuple[str, str]] = []
    scopes: list[Any] = []

    class FakeScope:
        def __init__(self) -> None:
            self.tags: dict[str, str] = {}
            self.extras: dict[str, Any] = {}
            self.fingerprint: list[str] | None = None

        def set_tag(self, key: str, value: str) -> None:
            self.tags[key] = value

        def set_extra(self, key: str, value: Any) -> None:
            self.extras[key] = value

    class ScopeContext:
        def __enter__(self) -> FakeScope:
            scope = FakeScope()
            scopes.append(scope)
            return scope

        def __exit__(self, *args: Any) -> None:
            return None

    monkeypatch.setattr(observability.sentry_sdk, "new_scope", lambda: ScopeContext())
    monkeypatch.setattr(
        observability.sentry_sdk,
        "capture_message",
        lambda message, level: captures.append((message, level)),
    )
    observability.reset_operational_alert_cooldowns()

    assert observability.emit_operational_alert(
        "queue_backlog",
        severity="warning",
        message="backlog",
        details={"count": 9, "unsafe": "x" * 300},
        clock=lambda: 100.0,
    ) is True
    assert observability.emit_operational_alert(
        "queue_backlog",
        severity="warning",
        message="backlog",
        details={"count": 10},
        clock=lambda: 101.0,
    ) is False

    assert captures == [("WhatsApp operational alert: queue_backlog", "warning")]
    assert scopes[0].fingerprint == ["whatsapp-ops", "queue_backlog"]
    assert scopes[0].tags["ops.alert_code"] == "queue_backlog"
    assert scopes[0].extras["count"] == 9
    assert len(scopes[0].extras["unsafe"]) == 128


def test_sentry_initializes_before_fastapi_app_creation() -> None:
    source = Path("main.py").read_text(encoding="utf-8")

    assert source.index("init_sentry(settings)") < source.index("app = FastAPI(")

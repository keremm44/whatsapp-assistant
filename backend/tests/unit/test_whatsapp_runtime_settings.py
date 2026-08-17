from __future__ import annotations

from settings import get_settings


def test_whatsapp_runtime_is_disabled_by_default(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("WHATSAPP_RUNTIME_ENABLED", raising=False)
    get_settings.cache_clear()
    try:
        assert get_settings().whatsapp_runtime_enabled is False
    finally:
        get_settings.cache_clear()


def test_whatsapp_runtime_requires_explicit_truthy_env(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("WHATSAPP_RUNTIME_ENABLED", "true")
    get_settings.cache_clear()
    try:
        assert get_settings().whatsapp_runtime_enabled is True
    finally:
        get_settings.cache_clear()


def test_whatsapp_runtime_unknown_value_stays_disabled(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("WHATSAPP_RUNTIME_ENABLED", "definitely-not-enabled")
    get_settings.cache_clear()
    try:
        assert get_settings().whatsapp_runtime_enabled is False
    finally:
        get_settings.cache_clear()

from __future__ import annotations

import pytest

from settings import get_settings


def _clear_send_env(monkeypatch) -> None:
    monkeypatch.delenv("WHATSAPP_SEND_ENABLED", raising=False)
    monkeypatch.delenv("WHATSAPP_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("WHATSAPP_GRAPH_API_VERSION", raising=False)


def test_whatsapp_runtime_is_disabled_by_default(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("WHATSAPP_RUNTIME_ENABLED", raising=False)
    _clear_send_env(monkeypatch)
    get_settings.cache_clear()
    try:
        assert get_settings().whatsapp_runtime_enabled is False
    finally:
        get_settings.cache_clear()


def test_whatsapp_runtime_requires_explicit_truthy_env(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("WHATSAPP_RUNTIME_ENABLED", "true")
    _clear_send_env(monkeypatch)
    get_settings.cache_clear()
    try:
        assert get_settings().whatsapp_runtime_enabled is True
    finally:
        get_settings.cache_clear()


def test_whatsapp_runtime_unknown_value_stays_disabled(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("WHATSAPP_RUNTIME_ENABLED", "definitely-not-enabled")
    _clear_send_env(monkeypatch)
    get_settings.cache_clear()
    try:
        assert get_settings().whatsapp_runtime_enabled is False
    finally:
        get_settings.cache_clear()


def test_whatsapp_send_is_disabled_by_default_without_credentials(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    _clear_send_env(monkeypatch)
    get_settings.cache_clear()
    try:
        current = get_settings()
        assert current.whatsapp_send_enabled is False
        assert current.whatsapp_access_token is None
        assert current.whatsapp_graph_api_version is None
    finally:
        get_settings.cache_clear()


def test_whatsapp_send_enabled_requires_token_and_explicit_graph_version(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    _clear_send_env(monkeypatch)
    monkeypatch.setenv("WHATSAPP_SEND_ENABLED", "true")
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="WHATSAPP_ACCESS_TOKEN"):
            get_settings()
    finally:
        get_settings.cache_clear()


def test_whatsapp_send_accepts_explicit_valid_configuration(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("WHATSAPP_SEND_ENABLED", "true")
    monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "x" * 40)
    monkeypatch.setenv("WHATSAPP_GRAPH_API_VERSION", "v99.0")
    get_settings.cache_clear()
    try:
        current = get_settings()
        assert current.whatsapp_send_enabled is True
        assert current.whatsapp_access_token == "x" * 40
        assert current.whatsapp_graph_api_version == "v99.0"
    finally:
        get_settings.cache_clear()


def test_whatsapp_send_rejects_unversioned_graph_api(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("WHATSAPP_SEND_ENABLED", "true")
    monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "x" * 40)
    monkeypatch.setenv("WHATSAPP_GRAPH_API_VERSION", "latest")
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="WHATSAPP_GRAPH_API_VERSION"):
            get_settings()
    finally:
        get_settings.cache_clear()

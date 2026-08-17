from __future__ import annotations

import ai_engine
import database
import main


def test_database_client_is_lazy(monkeypatch) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    database.reset_supabase_client()

    try:
        database.get_supabase()
        raise AssertionError("Eksik veritabanı ayarları reddedilmeliydi.")
    except RuntimeError as exc:
        assert "SUPABASE_URL" in str(exc)


def test_classifier_falls_back_without_key(monkeypatch) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    ai_engine.reset_classifier_client()

    result = ai_engine.classify_intent("Merhaba")

    assert result["durum"] == "başarılı"
    assert result["intent"] == "greeting"
    assert result["fallback_used"] is True
    assert result["classifier_unavailable"] is True


def test_unsafe_development_routes_are_disabled_by_default() -> None:
    route_paths = {
    route.path
    for route in main.app.routes
    if hasattr(route, "path")
}

    assert "/health" in route_paths
    assert "/health/ready" in route_paths
    assert "/sellers" not in route_paths
    assert "/chat" not in route_paths


def test_production_rejects_development_endpoints(monkeypatch) -> None:
    from settings import get_settings

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ENABLE_DEV_ENDPOINTS", "true")
    monkeypatch.setenv("INTERNAL_API_TOKEN", "x" * 32)
    get_settings.cache_clear()

    try:
        get_settings()
        raise AssertionError(
            "Production ortamında geliştirme endpointleri açılmamalıydı."
        )
    except RuntimeError as exc:
        assert "Production" in str(exc)
    finally:
        get_settings.cache_clear()


def test_unknown_app_env_is_rejected(monkeypatch) -> None:
    from settings import get_settings

    monkeypatch.setenv("APP_ENV", "prod")
    get_settings.cache_clear()

    try:
        get_settings()
        raise AssertionError("Bilinmeyen APP_ENV değeri reddedilmeliydi.")
    except RuntimeError as exc:
        message = str(exc)
        assert "APP_ENV" in message
        assert "production" in message
        assert "development" in message
    finally:
        get_settings.cache_clear()


def test_production_requires_supabase_runtime_config(monkeypatch) -> None:
    from settings import get_settings

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ENABLE_DEV_ENDPOINTS", "false")
    monkeypatch.setenv("CORS_ORIGINS", "https://seller.example.com")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    get_settings.cache_clear()

    try:
        get_settings()
        raise AssertionError(
            "Production eksik Supabase ayarlarıyla başlamamalıydı."
        )
    except RuntimeError as exc:
        message = str(exc)
        assert "SUPABASE_URL" in message
        assert "SUPABASE_SERVICE_KEY" in message
    finally:
        get_settings.cache_clear()


def test_production_rejects_non_https_supabase_url(monkeypatch) -> None:
    from settings import get_settings

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ENABLE_DEV_ENDPOINTS", "false")
    monkeypatch.setenv("CORS_ORIGINS", "https://seller.example.com")
    monkeypatch.setenv("SUPABASE_URL", "http://project.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-role-test-key")
    get_settings.cache_clear()

    try:
        get_settings()
        raise AssertionError("Production HTTP Supabase URL ile başlamamalıydı.")
    except RuntimeError as exc:
        assert "HTTPS" in str(exc)
    finally:
        get_settings.cache_clear()


def test_production_accepts_minimal_required_backend_config(monkeypatch) -> None:
    from settings import get_settings

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ENABLE_DEV_ENDPOINTS", "false")
    monkeypatch.setenv("CORS_ORIGINS", "https://seller.example.com")
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-role-test-key")
    get_settings.cache_clear()

    try:
        current = get_settings()
        assert current.is_production is True
        assert current.enable_dev_endpoints is False
    finally:
        get_settings.cache_clear()


def test_development_settings_keep_supabase_config_lazy(monkeypatch) -> None:
    from settings import get_settings

    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("ENABLE_DEV_ENDPOINTS", "false")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    get_settings.cache_clear()

    try:
        current = get_settings()
        assert current.app_env == "development"
        assert current.is_production is False
    finally:
        get_settings.cache_clear()

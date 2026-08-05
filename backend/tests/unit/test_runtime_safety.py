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

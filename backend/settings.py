from __future__ import annotations

import os
import re
from functools import lru_cache
from urllib.parse import urlsplit

from dotenv import load_dotenv
from pydantic import BaseModel


load_dotenv()


_TRUE_VALUES = {"1", "true", "yes", "on", "evet"}
_ALLOWED_APP_ENVS = frozenset({"development", "test", "production"})
_ALLOWED_LOG_LEVELS = frozenset({"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"})
_WHATSAPP_GRAPH_VERSION_RE = re.compile(r"^v[1-9][0-9]*\.[0-9]+$")


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in _TRUE_VALUES


def _csv_env(name: str) -> tuple[str, ...]:
    raw = os.getenv(name, "")
    return tuple(item.strip() for item in raw.split(",") if item.strip())


def _required_env(name: str) -> str | None:
    value = os.getenv(name, "").strip()
    return value or None


def _env_sample_rate(name: str, default: float = 0.0) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw.strip())
    except ValueError as exc:
        raise RuntimeError(
            f"{name} 0.0 ile 1.0 arasında sayısal bir değer olmalıdır."
        ) from exc
    if not 0.0 <= value <= 1.0:
        raise RuntimeError(f"{name} 0.0 ile 1.0 arasında olmalıdır.")
    return value


def _validate_production_supabase_config() -> None:
    supabase_url = _required_env("SUPABASE_URL")
    service_key = _required_env("SUPABASE_SERVICE_KEY")
    missing = [
        name
        for name, value in (
            ("SUPABASE_URL", supabase_url),
            ("SUPABASE_SERVICE_KEY", service_key),
        )
        if value is None
    ]
    if missing:
        raise RuntimeError(
            "Production ortamında zorunlu backend ayarları eksik: "
            + ", ".join(missing)
            + "."
        )

    assert supabase_url is not None
    try:
        parsed = urlsplit(supabase_url)
        hostname = parsed.hostname
        username = parsed.username
        password = parsed.password
    except ValueError as exc:
        raise RuntimeError(
            "Production ortamında SUPABASE_URL geçerli bir HTTPS URL olmalıdır."
        ) from exc

    if (
        parsed.scheme.lower() != "https"
        or not hostname
        or username is not None
        or password is not None
    ):
        raise RuntimeError(
            "Production ortamında SUPABASE_URL geçerli bir HTTPS URL olmalıdır."
        )


def _validate_whatsapp_send_config(
    send_enabled: bool,
    *,
    runtime_enabled: bool,
) -> tuple[str | None, str | None]:
    access_token = _required_env("WHATSAPP_ACCESS_TOKEN")
    graph_api_version = _required_env("WHATSAPP_GRAPH_API_VERSION")

    if not send_enabled:
        return access_token, graph_api_version
    if not runtime_enabled:
        raise RuntimeError(
            "WHATSAPP_SEND_ENABLED=true için WHATSAPP_RUNTIME_ENABLED=true zorunludur."
        )

    missing = [
        name
        for name, value in (
            ("WHATSAPP_ACCESS_TOKEN", access_token),
            ("WHATSAPP_GRAPH_API_VERSION", graph_api_version),
        )
        if value is None
    ]
    if missing:
        raise RuntimeError(
            "WhatsApp outbound gönderimi için zorunlu backend ayarları eksik: "
            + ", ".join(missing)
            + "."
        )

    assert access_token is not None
    assert graph_api_version is not None
    if len(access_token) < 20:
        raise RuntimeError(
            "WHATSAPP_ACCESS_TOKEN outbound gönderim için geçersiz görünüyor."
        )
    if _WHATSAPP_GRAPH_VERSION_RE.fullmatch(graph_api_version) is None:
        raise RuntimeError(
            "WHATSAPP_GRAPH_API_VERSION vNN.N biçiminde olmalıdır."
        )
    return access_token, graph_api_version


class AppSettings(BaseModel):
    app_env: str
    app_version: str
    enable_dev_endpoints: bool
    internal_api_token: str | None
    cors_origins: tuple[str, ...]
    media_allowed_hosts: tuple[str, ...]
    log_level: str
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.0
    whatsapp_verify_token: str | None = None
    whatsapp_app_secret: str | None = None
    whatsapp_runtime_enabled: bool = False
    whatsapp_send_enabled: bool = False
    whatsapp_access_token: str | None = None
    whatsapp_graph_api_version: str | None = None

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    if app_env not in _ALLOWED_APP_ENVS:
        allowed = ", ".join(sorted(_ALLOWED_APP_ENVS))
        raise RuntimeError(
            f"APP_ENV değeri geçersiz: {app_env!r}. İzin verilen değerler: {allowed}."
        )

    app_version = os.getenv("APP_VERSION", "0.4.0").strip()
    if not app_version or len(app_version) > 80:
        raise RuntimeError("APP_VERSION boş olamaz ve en fazla 80 karakter olmalıdır.")

    log_level = os.getenv("LOG_LEVEL", "INFO").strip().upper()
    if log_level not in _ALLOWED_LOG_LEVELS:
        allowed_levels = ", ".join(sorted(_ALLOWED_LOG_LEVELS))
        raise RuntimeError(
            f"LOG_LEVEL geçersiz: {log_level!r}. İzin verilen değerler: {allowed_levels}."
        )

    enable_dev_endpoints = _env_bool("ENABLE_DEV_ENDPOINTS", default=False)
    internal_api_token = os.getenv("INTERNAL_API_TOKEN", "").strip() or None
    cors_origins = _csv_env("CORS_ORIGINS")
    media_allowed_hosts = tuple(
        host.strip().lower().rstrip(".")
        for host in _csv_env("MEDIA_ALLOWED_HOSTS")
        if host.strip()
    )

    if app_env == "production" and enable_dev_endpoints:
        raise RuntimeError("Production ortamında geliştirme endpointleri açılamaz.")
    if enable_dev_endpoints and (
        internal_api_token is None or len(internal_api_token) < 24
    ):
        raise RuntimeError(
            "Geliştirme endpointleri için en az 24 karakterlik INTERNAL_API_TOKEN zorunludur."
        )
    if app_env == "production" and "*" in cors_origins:
        raise RuntimeError("Production ortamında CORS_ORIGINS yıldız olamaz.")
    if app_env == "production":
        _validate_production_supabase_config()

    whatsapp_runtime_enabled = _env_bool(
        "WHATSAPP_RUNTIME_ENABLED",
        default=False,
    )
    whatsapp_send_enabled = _env_bool(
        "WHATSAPP_SEND_ENABLED",
        default=False,
    )
    whatsapp_access_token, whatsapp_graph_api_version = _validate_whatsapp_send_config(
        whatsapp_send_enabled,
        runtime_enabled=whatsapp_runtime_enabled,
    )

    return AppSettings(
        app_env=app_env,
        app_version=app_version,
        enable_dev_endpoints=enable_dev_endpoints,
        internal_api_token=internal_api_token,
        cors_origins=cors_origins,
        media_allowed_hosts=media_allowed_hosts,
        log_level=log_level,
        sentry_dsn=_required_env("SENTRY_DSN"),
        sentry_traces_sample_rate=_env_sample_rate(
            "SENTRY_TRACES_SAMPLE_RATE",
            default=0.0,
        ),
        whatsapp_verify_token=_required_env("WHATSAPP_VERIFY_TOKEN"),
        whatsapp_app_secret=_required_env("WHATSAPP_APP_SECRET"),
        whatsapp_runtime_enabled=whatsapp_runtime_enabled,
        whatsapp_send_enabled=whatsapp_send_enabled,
        whatsapp_access_token=whatsapp_access_token,
        whatsapp_graph_api_version=whatsapp_graph_api_version,
    )

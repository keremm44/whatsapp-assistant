from __future__ import annotations

import os
from functools import lru_cache
from urllib.parse import urlsplit

from dotenv import load_dotenv
from pydantic import BaseModel


load_dotenv()


_TRUE_VALUES = {"1", "true", "yes", "on", "evet"}
_ALLOWED_APP_ENVS = frozenset({"development", "test", "production"})


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)

    if raw is None:
        return default

    return raw.strip().lower() in _TRUE_VALUES


def _csv_env(name: str) -> tuple[str, ...]:
    raw = os.getenv(name, "")
    return tuple(
        item.strip()
        for item in raw.split(",")
        if item.strip()
    )


def _required_env(name: str) -> str | None:
    value = os.getenv(name, "").strip()
    return value or None


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


class AppSettings(BaseModel):
    app_env: str
    app_version: str
    enable_dev_endpoints: bool
    internal_api_token: str | None
    cors_origins: tuple[str, ...]
    media_allowed_hosts: tuple[str, ...]
    log_level: str

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    if app_env not in _ALLOWED_APP_ENVS:
        allowed = ", ".join(sorted(_ALLOWED_APP_ENVS))
        raise RuntimeError(
            f"APP_ENV değeri geçersiz: {app_env!r}. "
            f"İzin verilen değerler: {allowed}."
        )

    enable_dev_endpoints = _env_bool(
        "ENABLE_DEV_ENDPOINTS",
        default=False,
    )
    internal_api_token = (
        os.getenv("INTERNAL_API_TOKEN", "").strip() or None
    )
    cors_origins = _csv_env("CORS_ORIGINS")
    # Medya proxy'sinin güvendiği sağlayıcı hostları. Boşsa medya
    # indirme tamamen kapalıdır (fail-closed). Yalnızca host adı
    # yazılır (şema/port/kullanıcı bilgisi kabul edilmez).
    media_allowed_hosts = tuple(
        host.strip().lower().rstrip(".")
        for host in _csv_env("MEDIA_ALLOWED_HOSTS")
        if host.strip()
    )

    if app_env == "production" and enable_dev_endpoints:
        raise RuntimeError(
            "Production ortamında geliştirme endpointleri açılamaz."
        )

    if enable_dev_endpoints and (
        internal_api_token is None or len(internal_api_token) < 24
    ):
        raise RuntimeError(
            "Geliştirme endpointleri için en az 24 karakterlik "
            "INTERNAL_API_TOKEN zorunludur."
        )

    if app_env == "production" and "*" in cors_origins:
        raise RuntimeError(
            "Production ortamında CORS_ORIGINS yıldız olamaz."
        )

    if app_env == "production":
        _validate_production_supabase_config()

    return AppSettings(
        app_env=app_env,
        app_version=os.getenv("APP_VERSION", "0.4.0").strip(),
        enable_dev_endpoints=enable_dev_endpoints,
        internal_api_token=internal_api_token,
        cors_origins=cors_origins,
        media_allowed_hosts=media_allowed_hosts,
        log_level=os.getenv("LOG_LEVEL", "INFO").strip().upper(),
    )

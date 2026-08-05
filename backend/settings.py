from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel


load_dotenv()


_TRUE_VALUES = {"1", "true", "yes", "on", "evet"}


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


class AppSettings(BaseModel):
    app_env: str
    app_version: str
    enable_dev_endpoints: bool
    internal_api_token: str | None
    cors_origins: tuple[str, ...]
    log_level: str

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    enable_dev_endpoints = _env_bool(
        "ENABLE_DEV_ENDPOINTS",
        default=False,
    )
    internal_api_token = (
        os.getenv("INTERNAL_API_TOKEN", "").strip() or None
    )
    cors_origins = _csv_env("CORS_ORIGINS")

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

    return AppSettings(
        app_env=app_env,
        app_version=os.getenv("APP_VERSION", "0.4.0").strip(),
        enable_dev_endpoints=enable_dev_endpoints,
        internal_api_token=internal_api_token,
        cors_origins=cors_origins,
        log_level=os.getenv("LOG_LEVEL", "INFO").strip().upper(),
    )

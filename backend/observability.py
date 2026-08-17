from __future__ import annotations

import logging

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

from settings import AppSettings


logger = logging.getLogger(__name__)


def init_sentry(settings: AppSettings) -> bool:
    """Sentry error monitoring'i yalnız açıkça DSN verildiğinde başlatır."""
    if not settings.sentry_dsn:
        logger.info("Sentry devre dışı: SENTRY_DSN ayarlanmamış.")
        return False

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        release=settings.app_version,
        send_default_pii=False,
        max_request_body_size="never",
        traces_sample_rate=settings.sentry_traces_sample_rate,
        integrations=[FastApiIntegration()],
    )

    logger.info(
        "Sentry etkin: environment=%s release=%s traces_sample_rate=%s",
        settings.app_env,
        settings.app_version,
        settings.sentry_traces_sample_rate,
    )
    return True

from __future__ import annotations

import logging
import secrets
import threading
import time
from typing import Any, Callable

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from settings import AppSettings


logger = logging.getLogger(__name__)
_REQUEST_ID_HEADER = b"x-request-id"
_OPERATIONAL_ALERT_COOLDOWN_SECONDS = 300.0
_operational_alert_last_sent: dict[str, float] = {}
_operational_alert_lock = threading.Lock()


def configure_logging(settings: AppSettings) -> None:
    """Configure the same process log format for API, worker and ops checks."""
    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


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


def emit_operational_alert(
    code: str,
    *,
    severity: str,
    message: str,
    details: dict[str, Any] | None = None,
    cooldown_seconds: float = _OPERATIONAL_ALERT_COOLDOWN_SECONDS,
    clock: Callable[[], float] = time.monotonic,
) -> bool:
    """Log and group one PII-free operational alert with in-process cooldown."""
    normalized_code = code.strip() if isinstance(code, str) else ""
    normalized_severity = severity if severity in {"warning", "error"} else "warning"
    if not normalized_code or len(normalized_code) > 96:
        return False

    safe_details: dict[str, int | float | bool | str | None] = {}
    for key, value in (details or {}).items():
        if (
            isinstance(key, str)
            and 1 <= len(key) <= 64
            and isinstance(value, (int, float, bool, str, type(None)))
        ):
            safe_details[key] = value if not isinstance(value, str) else value[:128]

    log_fn = logger.error if normalized_severity == "error" else logger.warning
    log_fn(
        "ops_alert code=%s severity=%s message=%s details=%r",
        normalized_code,
        normalized_severity,
        message,
        safe_details,
    )

    now = clock()
    with _operational_alert_lock:
        last_sent = _operational_alert_last_sent.get(normalized_code)
        if last_sent is not None and now - last_sent < cooldown_seconds:
            return False
        _operational_alert_last_sent[normalized_code] = now

    with sentry_sdk.new_scope() as scope:
        scope.set_tag("ops.alert_code", normalized_code)
        scope.set_tag("ops.severity", normalized_severity)
        scope.fingerprint = ["whatsapp-ops", normalized_code]
        for key, value in safe_details.items():
            scope.set_extra(key, value)
        sentry_sdk.capture_message(
            f"WhatsApp operational alert: {normalized_code}",
            level=normalized_severity,
        )
    return True


def reset_operational_alert_cooldowns() -> None:
    """Test helper; no production caller should need this."""
    with _operational_alert_lock:
        _operational_alert_last_sent.clear()


def _request_id(scope: Scope) -> str:
    for name, value in scope.get("headers", []):
        if name.lower() == _REQUEST_ID_HEADER:
            try:
                candidate = value.decode("ascii").strip()
            except UnicodeDecodeError:
                break
            if 8 <= len(candidate) <= 128 and candidate.replace("-", "").replace("_", "").isalnum():
                return candidate
    return secrets.token_urlsafe(16)


class RequestMetricsMiddleware:
    """Privacy-safe API timing and response-size telemetry.

    No authorization header, query value, request body, phone number, or other
    PII is logged. The request ID lets a single API/worker incident be traced.
    """

    def __init__(self, app: ASGIApp, *, clock: Callable[[], float] = time.perf_counter) -> None:
        self.app = app
        self.clock = clock

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        started = self.clock()
        request_id = _request_id(scope)
        status_code = 500
        response_bytes = 0

        async def measured_send(message: Message) -> None:
            nonlocal status_code, response_bytes
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                headers = list(message.get("headers", []))
                headers.append((_REQUEST_ID_HEADER, request_id.encode("ascii")))
                message = {**message, "headers": headers}
            elif message["type"] == "http.response.body":
                response_bytes += len(message.get("body", b""))
            await send(message)

        try:
            await self.app(scope, receive, measured_send)
        finally:
            duration_ms = round((self.clock() - started) * 1000, 2)
            logger.info(
                "api_request request_id=%s method=%s path=%s status=%s duration_ms=%s response_bytes=%s",
                request_id,
                scope.get("method", ""),
                scope.get("path", ""),
                status_code,
                duration_ms,
                response_bytes,
            )

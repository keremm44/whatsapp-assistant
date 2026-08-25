from __future__ import annotations

from collections import OrderedDict, deque
import json
import math
import threading
import time
from typing import Callable

from starlette.types import ASGIApp, Receive, Scope, Send


DEFAULT_MAX_BODY_BYTES = 16 * 1024
DEFAULT_RATE_LIMIT = 10
DEFAULT_RATE_WINDOW_SECONDS = 60.0
DEFAULT_MAX_TRACKED_CLIENTS = 4096


class PublicApplicationAbuseProtectionMiddleware:
    """Bound public seller-application request size and burst rate.

    Client identity comes only from the ASGI ``scope.client`` value. The
    application never trusts X-Forwarded-For directly; a deployment may let its
    ASGI server resolve trusted proxy headers before this middleware runs.

    The rate limiter is intentionally process-local defense in depth. It does
    not replace an edge/distributed limiter when the API runs with multiple
    workers or instances.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        path: str = "/applications",
        max_body_bytes: int = DEFAULT_MAX_BODY_BYTES,
        rate_limit: int = DEFAULT_RATE_LIMIT,
        rate_window_seconds: float = DEFAULT_RATE_WINDOW_SECONDS,
        max_tracked_clients: int = DEFAULT_MAX_TRACKED_CLIENTS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if max_body_bytes <= 0:
            raise ValueError("max_body_bytes must be positive")
        if rate_limit <= 0:
            raise ValueError("rate_limit must be positive")
        if rate_window_seconds <= 0:
            raise ValueError("rate_window_seconds must be positive")
        if max_tracked_clients <= 0:
            raise ValueError("max_tracked_clients must be positive")

        self.app = app
        self.path = path
        self.max_body_bytes = max_body_bytes
        self.rate_limit = rate_limit
        self.rate_window_seconds = rate_window_seconds
        self.max_tracked_clients = max_tracked_clients
        self._clock = clock
        self._lock = threading.Lock()
        self._attempts: OrderedDict[str, deque[float]] = OrderedDict()

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        if (
            scope.get("type") != "http"
            or scope.get("method") != "POST"
            or scope.get("path") != self.path
        ):
            await self.app(scope, receive, send)
            return

        limited, retry_after = self._record_attempt(self._client_key(scope))
        if limited:
            await self._send_json(
                send,
                status_code=429,
                body={
                    "detail": {
                        "code": "seller_application_rate_limited",
                        "message": (
                            "Çok fazla başvuru denemesi yapıldı. "
                            "Lütfen kısa süre sonra tekrar deneyin."
                        ),
                    }
                },
                extra_headers=[
                    (b"retry-after", str(retry_after).encode("ascii")),
                ],
            )
            return

        content_length = self._content_length(scope)
        if content_length is not None and content_length > self.max_body_bytes:
            await self._send_too_large(send)
            return

        body, too_large = await self._read_limited_body(receive)
        if too_large:
            await self._send_too_large(send)
            return
        if body is None:
            return

        delivered = False

        async def replay_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {
                    "type": "http.request",
                    "body": body,
                    "more_body": False,
                }
            return {"type": "http.disconnect"}

        await self.app(scope, replay_receive, send)

    def _record_attempt(self, client_key: str) -> tuple[bool, int]:
        now = self._clock()
        cutoff = now - self.rate_window_seconds

        with self._lock:
            bucket = self._attempts.get(client_key)
            if bucket is None:
                if len(self._attempts) >= self.max_tracked_clients:
                    self._attempts.popitem(last=False)
                bucket = deque()
                self._attempts[client_key] = bucket
            else:
                self._attempts.move_to_end(client_key)

            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= self.rate_limit:
                retry_after = max(
                    1,
                    math.ceil(
                        bucket[0] + self.rate_window_seconds - now
                    ),
                )
                return True, retry_after

            bucket.append(now)
            return False, 0

    def _client_key(self, scope: Scope) -> str:
        client = scope.get("client")
        if isinstance(client, (tuple, list)) and client:
            return str(client[0])
        return "<unknown>"

    def _content_length(self, scope: Scope) -> int | None:
        for name, value in scope.get("headers", []):
            if name.lower() != b"content-length":
                continue
            try:
                parsed = int(value.decode("ascii"))
            except (UnicodeDecodeError, ValueError):
                return None
            return parsed if parsed >= 0 else None
        return None

    async def _read_limited_body(
        self,
        receive: Receive,
    ) -> tuple[bytes | None, bool]:
        chunks: list[bytes] = []
        total = 0

        while True:
            message = await receive()
            message_type = message.get("type")

            if message_type == "http.disconnect":
                return None, False
            if message_type != "http.request":
                continue

            chunk = message.get("body", b"")
            total += len(chunk)
            if total > self.max_body_bytes:
                return None, True

            if chunk:
                chunks.append(chunk)

            if not message.get("more_body", False):
                return b"".join(chunks), False

    async def _send_too_large(self, send: Send) -> None:
        await self._send_json(
            send,
            status_code=413,
            body={
                "detail": {
                    "code": "seller_application_request_too_large",
                    "message": "Başvuru isteği izin verilen boyutu aşıyor.",
                }
            },
        )

    async def _send_json(
        self,
        send: Send,
        *,
        status_code: int,
        body: dict[str, object],
        extra_headers: list[tuple[bytes, bytes]] | None = None,
    ) -> None:
        payload = json.dumps(
            body,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        headers = [
            (b"content-type", b"application/json; charset=utf-8"),
            (b"content-length", str(len(payload)).encode("ascii")),
            (b"cache-control", b"no-store"),
        ]
        if extra_headers:
            headers.extend(extra_headers)

        await send(
            {
                "type": "http.response.start",
                "status": status_code,
                "headers": headers,
            }
        )
        await send(
            {
                "type": "http.response.body",
                "body": payload,
                "more_body": False,
            }
        )

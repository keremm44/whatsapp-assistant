"""
authenticated_rate_limit.py — Authenticated endpoint rate limiting middleware.

Strateji:
  - Kimlik: Authorization header'daki Bearer token'ın ilk 16 karakteri
    (token'ın tamamını saklamak gereksiz; truncation hem hafıza tasarrufu
    sağlar hem de PII riski taşımaz).
  - Algoritma: Sliding window (token bucket değil) — public_abuse_protection
    ile aynı yaklaşım, tutarlılık için.
  - Sınır: Dakikada RATE_LIMIT istek (varsayılan 120/dk).
  - Kapsam: Yalnızca /seller/* ve /admin/* path'leri.
    /webhooks/*, /health, /, /docs, /openapi.json dışarıda.
  - Thread-safe: tek lock + OrderedDict LRU.
  - Process-local: Redis gerektirmez; multi-worker deploy için
    edge-layer rate limiting (Cloudflare, Railway, vb.) ek katman olarak
    tercih edilir. Bu katman defense-in-depth içindir.
  - 429 yanıtı: Retry-After header ile.

Ayarlanabilir parametreler (AppSettings üzerinden veya doğrudan):
  RATE_LIMIT_AUTHENTICATED      int   dakikada maksimum istek (default: 120)
  RATE_LIMIT_WINDOW_SECONDS     float pencere süresi saniye (default: 60)
  RATE_LIMIT_MAX_TRACKED        int   izlenen token bucket sayısı (default: 8192)
"""

from __future__ import annotations

import json
import math
import threading
import time
from collections import OrderedDict, deque
from typing import Callable

from starlette.types import ASGIApp, Receive, Scope, Send

# ── Yapılandırma sabitleri ─────────────────────────────────────────────────

DEFAULT_RATE_LIMIT: int = 120          # istek / pencere
DEFAULT_WINDOW_SECONDS: float = 60.0   # pencere süresi (sn)
DEFAULT_MAX_TRACKED: int = 8192        # max izlenen kimlik sayısı

# Rate limiting uygulanacak path prefix'leri
_LIMITED_PREFIXES: tuple[str, ...] = ("/seller/", "/admin/")

# Hariç tutulan path'ler (tam eşleşme veya prefix)
_EXCLUDED_PATHS: frozenset[str] = frozenset({
    "/",
    "/health",
    "/health/ready",
    "/docs",
    "/openapi.json",
    "/redoc",
})
_EXCLUDED_PREFIXES: tuple[str, ...] = (
    "/webhooks/",
    "/public/",
    "/applications",
)

# Token'dan kaç karakter kimlik olarak kullanılır (PII azaltma)
_TOKEN_KEY_LENGTH: int = 16


# ── Middleware ─────────────────────────────────────────────────────────────


class AuthenticatedRateLimitMiddleware:
    """
    Authenticated seller/admin endpoint'lerine sliding window rate limit uygular.

    Yalnızca Authorization: Bearer <token> başlığı bulunan isteklere uygulanır.
    Token yoksa (unauthenticated istek) bu middleware atlanır — auth katmanı
    zaten 401 döndürecektir.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        rate_limit: int = DEFAULT_RATE_LIMIT,
        window_seconds: float = DEFAULT_WINDOW_SECONDS,
        max_tracked: int = DEFAULT_MAX_TRACKED,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if rate_limit <= 0:
            raise ValueError("rate_limit pozitif olmalıdır.")
        if window_seconds <= 0:
            raise ValueError("window_seconds pozitif olmalıdır.")
        if max_tracked <= 0:
            raise ValueError("max_tracked pozitif olmalıdır.")

        self.app = app
        self.rate_limit = rate_limit
        self.window_seconds = window_seconds
        self.max_tracked = max_tracked
        self._clock = clock
        self._lock = threading.Lock()
        self._buckets: OrderedDict[str, deque[float]] = OrderedDict()

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        # Yalnızca HTTP isteklerine uygula
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")

        # Hariç tutulan path'ler
        if path in _EXCLUDED_PATHS:
            await self.app(scope, receive, send)
            return
        if any(path.startswith(p) for p in _EXCLUDED_PREFIXES):
            await self.app(scope, receive, send)
            return

        # Yalnızca /seller/* ve /admin/* kapsama girer
        if not any(path.startswith(p) for p in _LIMITED_PREFIXES):
            await self.app(scope, receive, send)
            return

        # Token al — yoksa middleware'i atla
        token_key = self._extract_token_key(scope)
        if token_key is None:
            await self.app(scope, receive, send)
            return

        # Rate limit kontrolü
        limited, retry_after = self._check_and_record(token_key)
        if limited:
            await self._send_429(send, retry_after)
            return

        await self.app(scope, receive, send)

    # ── Yardımcı metodlar ──────────────────────────────────────────────────

    def _extract_token_key(self, scope: Scope) -> str | None:
        """Authorization: Bearer <token> header'ından truncated key üretir."""
        for name, value in scope.get("headers", []):
            if name.lower() != b"authorization":
                continue
            try:
                decoded = value.decode("latin-1").strip()
            except (UnicodeDecodeError, AttributeError):
                return None
            if not decoded.lower().startswith("bearer "):
                return None
            token = decoded[7:].strip()
            if not token:
                return None
            # Yalnızca ilk N karakteri key olarak kullan
            return token[:_TOKEN_KEY_LENGTH]
        return None

    def _check_and_record(self, key: str) -> tuple[bool, int]:
        """
        Sliding window kontrolü.
        Döner: (rate_limited, retry_after_seconds)
        """
        now = self._clock()
        cutoff = now - self.window_seconds

        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                # LRU eviction: en eski bucket'ı çıkar
                if len(self._buckets) >= self.max_tracked:
                    self._buckets.popitem(last=False)
                bucket = deque()
                self._buckets[key] = bucket
            else:
                self._buckets.move_to_end(key)

            # Pencere dışı kalan timestamp'leri temizle
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= self.rate_limit:
                retry_after = max(
                    1,
                    math.ceil(bucket[0] + self.window_seconds - now),
                )
                return True, retry_after

            bucket.append(now)
            return False, 0

    async def _send_429(self, send: Send, retry_after: int) -> None:
        body = json.dumps(
            {
                "detail": {
                    "code": "rate_limit_exceeded",
                    "message": (
                        "Çok fazla istek gönderildi. "
                        "Lütfen kısa süre sonra tekrar deneyin."
                    ),
                }
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")

        headers = [
            (b"content-type", b"application/json; charset=utf-8"),
            (b"content-length", str(len(body)).encode("ascii")),
            (b"retry-after", str(retry_after).encode("ascii")),
            (b"cache-control", b"no-store"),
        ]

        await send({
            "type": "http.response.start",
            "status": 429,
            "headers": headers,
        })
        await send({
            "type": "http.response.body",
            "body": body,
            "more_body": False,
        })

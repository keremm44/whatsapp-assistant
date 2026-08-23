"""
Unit tests for AuthenticatedRateLimitMiddleware.

Gerçek ağ/Supabase bağlantısı yok.
Monotonic clock inject edilerek deterministik zaman kontrolü sağlanır.
"""

from __future__ import annotations

import json
import pytest

from authenticated_rate_limit import (
    AuthenticatedRateLimitMiddleware,
    DEFAULT_RATE_LIMIT,
    DEFAULT_WINDOW_SECONDS,
)


# ── ASGI test altyapısı ────────────────────────────────────────────────────


def _make_scope(
    path: str = "/seller/me",
    method: str = "GET",
    token: str | None = "test-token-abc",
) -> dict:
    headers = []
    if token is not None:
        headers.append(
            (b"authorization", f"Bearer {token}".encode("latin-1"))
        )
    return {
        "type": "http",
        "method": method,
        "path": path,
        "headers": headers,
        "client": ("127.0.0.1", 54321),
    }


async def _dummy_receive():
    return {"type": "http.disconnect"}


class _ResponseCapture:
    def __init__(self):
        self.status: int | None = None
        self.body: bytes = b""
        self.headers: list[tuple[bytes, bytes]] = []

    async def __call__(self, message: dict) -> None:
        if message["type"] == "http.response.start":
            self.status = message["status"]
            self.headers = list(message.get("headers", []))
        elif message["type"] == "http.response.body":
            self.body += message.get("body", b"")


async def _passthrough_app(scope, receive, send):
    """Her zaman 200 döndüren sahte uygulama."""
    await send({
        "type": "http.response.start",
        "status": 200,
        "headers": [(b"content-length", b"0")],
    })
    await send({"type": "http.response.body", "body": b"", "more_body": False})


def _make_middleware(
    rate_limit: int = 5,
    window_seconds: float = 60.0,
    max_tracked: int = 100,
    clock=None,
) -> AuthenticatedRateLimitMiddleware:
    if clock is None:
        _t = [0.0]
        def clock():
            return _t[0]
    return AuthenticatedRateLimitMiddleware(
        _passthrough_app,
        rate_limit=rate_limit,
        window_seconds=window_seconds,
        max_tracked=max_tracked,
        clock=clock,
    )


# ── Testler ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_normal_request_passes_through():
    """Rate limit aşılmayan istek 200 döndürür."""
    mw = _make_middleware(rate_limit=10)
    capture = _ResponseCapture()
    await mw(_make_scope(), _dummy_receive, capture)
    assert capture.status == 200


@pytest.mark.asyncio
async def test_no_token_passes_through():
    """Token olmayan istek rate limit'e takılmaz."""
    mw = _make_middleware(rate_limit=1)
    capture = _ResponseCapture()
    await mw(_make_scope(token=None), _dummy_receive, capture)
    assert capture.status == 200
    # İkinci istek de geçmeli (token olmadan sayılmıyor)
    capture2 = _ResponseCapture()
    await mw(_make_scope(token=None), _dummy_receive, capture2)
    assert capture2.status == 200


@pytest.mark.asyncio
async def test_rate_limit_exceeded_returns_429():
    """Limit aşıldığında 429 döner."""
    t = [0.0]
    mw = _make_middleware(rate_limit=3, window_seconds=60.0, clock=lambda: t[0])

    for _ in range(3):
        c = _ResponseCapture()
        await mw(_make_scope(), _dummy_receive, c)
        assert c.status == 200

    # 4. istek rate-limited olmalı
    c = _ResponseCapture()
    await mw(_make_scope(), _dummy_receive, c)
    assert c.status == 429


@pytest.mark.asyncio
async def test_429_has_retry_after_header():
    """429 yanıtında Retry-After başlığı bulunur."""
    t = [0.0]
    mw = _make_middleware(rate_limit=1, window_seconds=60.0, clock=lambda: t[0])

    # İlk istek geçer
    c1 = _ResponseCapture()
    await mw(_make_scope(), _dummy_receive, c1)
    assert c1.status == 200

    # İkinci istek rate-limited
    c2 = _ResponseCapture()
    await mw(_make_scope(), _dummy_receive, c2)
    assert c2.status == 429

    header_names = [name.lower() for name, _ in c2.headers]
    assert b"retry-after" in header_names


@pytest.mark.asyncio
async def test_429_body_has_error_code():
    """429 yanıtının JSON body'si rate_limit_exceeded kodu taşır."""
    t = [0.0]
    mw = _make_middleware(rate_limit=1, clock=lambda: t[0])

    c1 = _ResponseCapture()
    await mw(_make_scope(), _dummy_receive, c1)
    c2 = _ResponseCapture()
    await mw(_make_scope(), _dummy_receive, c2)

    assert c2.status == 429
    data = json.loads(c2.body)
    assert data["detail"]["code"] == "rate_limit_exceeded"


@pytest.mark.asyncio
async def test_window_expiry_resets_limit():
    """Pencere süresi geçtikten sonra limit sıfırlanır."""
    t = [0.0]
    mw = _make_middleware(rate_limit=2, window_seconds=10.0, clock=lambda: t[0])

    # 2 istek gönder → limit dolu
    for _ in range(2):
        c = _ResponseCapture()
        await mw(_make_scope(), _dummy_receive, c)
        assert c.status == 200

    # 3. istek → 429
    c = _ResponseCapture()
    await mw(_make_scope(), _dummy_receive, c)
    assert c.status == 429

    # Pencereyi geç (10 sn + epsilon)
    t[0] = 10.1

    # İstek tekrar geçmeli
    c = _ResponseCapture()
    await mw(_make_scope(), _dummy_receive, c)
    assert c.status == 200


@pytest.mark.asyncio
async def test_different_tokens_have_separate_buckets():
    """Farklı token'lar birbirinin limitini etkilemez."""
    t = [0.0]
    mw = _make_middleware(rate_limit=2, clock=lambda: t[0])

    # Token A: 2 istek gönder → limit dolu
    for _ in range(2):
        c = _ResponseCapture()
        await mw(_make_scope(token="token-aaaa"), _dummy_receive, c)
        assert c.status == 200

    # Token A: 3. istek → 429
    c = _ResponseCapture()
    await mw(_make_scope(token="token-aaaa"), _dummy_receive, c)
    assert c.status == 429

    # Token B: ilk istek → 200 (farklı bucket)
    c = _ResponseCapture()
    await mw(_make_scope(token="token-bbbb"), _dummy_receive, c)
    assert c.status == 200


@pytest.mark.asyncio
async def test_excluded_paths_bypass_limit():
    """Hariç tutulan path'ler rate limit'e takılmaz."""
    t = [0.0]
    excluded = ["/health", "/health/ready", "/", "/docs", "/openapi.json"]
    mw = _make_middleware(rate_limit=1, clock=lambda: t[0])

    for path in excluded:
        for _ in range(5):  # limit=1 ama geçmeli
            c = _ResponseCapture()
            await mw(_make_scope(path=path), _dummy_receive, c)
            assert c.status == 200, f"{path} için beklenen 200, alınan {c.status}"


@pytest.mark.asyncio
async def test_webhook_path_bypasses_limit():
    """/webhooks/* path'i rate limit kapsamı dışındadır."""
    t = [0.0]
    mw = _make_middleware(rate_limit=1, clock=lambda: t[0])

    for _ in range(5):
        c = _ResponseCapture()
        await mw(_make_scope(path="/webhooks/whatsapp"), _dummy_receive, c)
        assert c.status == 200


@pytest.mark.asyncio
async def test_non_seller_admin_path_bypasses_limit():
    """Kapsam dışı path'ler (/dev/*, vb.) rate limit'e girmez."""
    t = [0.0]
    mw = _make_middleware(rate_limit=1, clock=lambda: t[0])

    for _ in range(5):
        c = _ResponseCapture()
        await mw(_make_scope(path="/dev/db-test"), _dummy_receive, c)
        assert c.status == 200


@pytest.mark.asyncio
async def test_seller_path_is_rate_limited():
    """/seller/* path'i rate limit kapsamındadır."""
    t = [0.0]
    mw = _make_middleware(rate_limit=2, clock=lambda: t[0])

    for _ in range(2):
        c = _ResponseCapture()
        await mw(_make_scope(path="/seller/orders"), _dummy_receive, c)
        assert c.status == 200

    c = _ResponseCapture()
    await mw(_make_scope(path="/seller/orders"), _dummy_receive, c)
    assert c.status == 429


@pytest.mark.asyncio
async def test_admin_path_is_rate_limited():
    """/admin/* path'i rate limit kapsamındadır."""
    t = [0.0]
    mw = _make_middleware(rate_limit=1, clock=lambda: t[0])

    c1 = _ResponseCapture()
    await mw(_make_scope(path="/admin/sellers"), _dummy_receive, c1)
    assert c1.status == 200

    c2 = _ResponseCapture()
    await mw(_make_scope(path="/admin/sellers"), _dummy_receive, c2)
    assert c2.status == 429


@pytest.mark.asyncio
async def test_lru_eviction_does_not_crash():
    """max_tracked aşıldığında LRU eviction crash vermez."""
    t = [0.0]
    mw = _make_middleware(rate_limit=100, max_tracked=3, clock=lambda: t[0])

    for i in range(10):
        c = _ResponseCapture()
        await mw(_make_scope(token=f"token-{i:04d}"), _dummy_receive, c)
        assert c.status == 200

    assert len(mw._buckets) <= 3


@pytest.mark.asyncio
async def test_malformed_authorization_header_bypasses():
    """Hatalı Authorization header rate limit'e girmez (401 auth katmanına bırakılır)."""
    t = [0.0]
    mw = _make_middleware(rate_limit=1, clock=lambda: t[0])

    scope = _make_scope(token=None)
    scope["headers"].append((b"authorization", b"Basic dXNlcjpwYXNz"))

    for _ in range(5):
        c = _ResponseCapture()
        await mw(scope, _dummy_receive, c)
        assert c.status == 200


@pytest.mark.asyncio
async def test_default_constants_are_sensible():
    """Varsayılan sabitler üretim için makul aralıktadır."""
    assert DEFAULT_RATE_LIMIT >= 60, "dakikada en az 60 istek beklenir"
    assert DEFAULT_WINDOW_SECONDS == 60.0

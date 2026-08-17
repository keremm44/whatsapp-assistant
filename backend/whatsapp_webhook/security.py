from __future__ import annotations

import hashlib
import hmac
import secrets

from fastapi import Request


class WebhookBodyTooLarge(ValueError):
    """Webhook request exceeded the bounded JSON payload size."""


def verify_meta_signature(
    app_secret: str,
    body: bytes,
    signature_header: str | None,
) -> bool:
    """Verify Meta's sha256 HMAC against the exact raw request body."""
    if not app_secret or not signature_header:
        return False
    if not signature_header.startswith("sha256="):
        return False

    expected = "sha256=" + hmac.new(
        app_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return secrets.compare_digest(expected, signature_header.strip())


async def read_bounded_body(request: Request, *, max_bytes: int) -> bytes:
    """Read request bytes without accepting an unbounded webhook body."""
    chunks: list[bytes] = []
    total = 0

    async for chunk in request.stream():
        total += len(chunk)
        if total > max_bytes:
            raise WebhookBodyTooLarge(
                f"Webhook gövdesi {max_bytes} byte sınırını aşıyor."
            )
        chunks.append(chunk)

    return b"".join(chunks)

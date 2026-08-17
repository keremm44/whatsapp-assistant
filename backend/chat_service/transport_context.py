from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator


INTERNAL_OUTGOING_PROVIDER = "internal"
WHATSAPP_PENDING_OUTGOING_PROVIDER = "whatsapp_cloud_pending"
_ALLOWED_OUTGOING_PROVIDERS = frozenset(
    {INTERNAL_OUTGOING_PROVIDER, WHATSAPP_PENDING_OUTGOING_PROVIDER}
)

_outgoing_provider: ContextVar[str] = ContextVar(
    "chat_outgoing_provider",
    default=INTERNAL_OUTGOING_PROVIDER,
)
_incoming_message_id: ContextVar[int | None] = ContextVar(
    "chat_incoming_message_id",
    default=None,
)
_outgoing_message_id: ContextVar[int | None] = ContextVar(
    "chat_outgoing_message_id",
    default=None,
)


def normalize_outgoing_provider(value: str) -> str:
    normalized = value.strip() if isinstance(value, str) else ""
    if normalized not in _ALLOWED_OUTGOING_PROVIDERS:
        raise ValueError("Desteklenmeyen outgoing provider.")
    return normalized


@contextmanager
def transport_scope(outgoing_provider: str) -> Iterator[None]:
    """Keep transport-only state request-local and reset it deterministically."""
    normalized = normalize_outgoing_provider(outgoing_provider)
    provider_token = _outgoing_provider.set(normalized)
    incoming_token = _incoming_message_id.set(None)
    outgoing_token = _outgoing_message_id.set(None)
    try:
        yield
    finally:
        _outgoing_message_id.reset(outgoing_token)
        _incoming_message_id.reset(incoming_token)
        _outgoing_provider.reset(provider_token)


def current_outgoing_provider() -> str:
    return _outgoing_provider.get()


def current_incoming_message_id() -> int | None:
    return _incoming_message_id.get()


def current_outgoing_message_id() -> int | None:
    return _outgoing_message_id.get()


def record_incoming_message_id(message_id: int) -> None:
    if isinstance(message_id, int) and not isinstance(message_id, bool) and message_id > 0:
        _incoming_message_id.set(message_id)


def record_outgoing_message_id(message_id: int) -> None:
    if isinstance(message_id, int) and not isinstance(message_id, bool) and message_id > 0:
        _outgoing_message_id.set(message_id)

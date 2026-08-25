from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator, NamedTuple


INTERNAL_OUTGOING_PROVIDER = "internal"
WHATSAPP_PENDING_OUTGOING_PROVIDER = "whatsapp_cloud_pending"
_ALLOWED_OUTGOING_PROVIDERS = frozenset(
    {INTERNAL_OUTGOING_PROVIDER, WHATSAPP_PENDING_OUTGOING_PROVIDER}
)
_MAX_WORKER_ID_LENGTH = 120


class WhatsAppClaimContext(NamedTuple):
    event_id: int
    worker_id: str
    claim_version: int


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
_whatsapp_claim: ContextVar[WhatsAppClaimContext | None] = ContextVar(
    "chat_whatsapp_claim",
    default=None,
)
_suppress_outgoing_for_turn: ContextVar[bool] = ContextVar(
    "chat_suppress_outgoing_for_turn",
    default=False,
)


def normalize_outgoing_provider(value: str) -> str:
    normalized = value.strip() if isinstance(value, str) else ""
    if normalized not in _ALLOWED_OUTGOING_PROVIDERS:
        raise ValueError("Desteklenmeyen outgoing provider.")
    return normalized


def _positive_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def normalize_whatsapp_claim(
    *,
    worker_event_id: int | None,
    worker_id: str | None,
    claim_version: int | None,
) -> WhatsAppClaimContext | None:
    supplied = (
        worker_event_id is not None,
        worker_id is not None,
        claim_version is not None,
    )
    if not any(supplied):
        return None
    if not all(supplied):
        raise ValueError("WhatsApp worker claim bilgileri birlikte gönderilmelidir.")

    normalized_worker = worker_id.strip() if isinstance(worker_id, str) else ""
    if (
        not _positive_int(worker_event_id)
        or not normalized_worker
        or len(normalized_worker) > _MAX_WORKER_ID_LENGTH
        or not _positive_int(claim_version)
    ):
        raise ValueError("WhatsApp worker claim bilgileri geçersiz.")
    return WhatsAppClaimContext(
        event_id=worker_event_id,
        worker_id=normalized_worker,
        claim_version=claim_version,
    )


@contextmanager
def transport_scope(
    outgoing_provider: str,
    *,
    worker_event_id: int | None = None,
    worker_id: str | None = None,
    claim_version: int | None = None,
    suppress_outgoing: bool = False,
) -> Iterator[None]:
    """Keep transport, queue-lease and turn state request-local and deterministic."""
    normalized = normalize_outgoing_provider(outgoing_provider)
    claim = normalize_whatsapp_claim(
        worker_event_id=worker_event_id,
        worker_id=worker_id,
        claim_version=claim_version,
    )
    if claim is not None and normalized != WHATSAPP_PENDING_OUTGOING_PROVIDER:
        raise ValueError("Worker claim yalnız WhatsApp pending transport ile kullanılabilir.")
    if not isinstance(suppress_outgoing, bool):
        raise ValueError("Turn outgoing suppression boolean olmalıdır.")
    if suppress_outgoing and normalized != WHATSAPP_PENDING_OUTGOING_PROVIDER:
        raise ValueError("Turn outgoing suppression yalnız WhatsApp pending transport ile kullanılabilir.")

    provider_token = _outgoing_provider.set(normalized)
    incoming_token = _incoming_message_id.set(None)
    outgoing_token = _outgoing_message_id.set(None)
    claim_token = _whatsapp_claim.set(claim)
    suppression_token = _suppress_outgoing_for_turn.set(suppress_outgoing)
    try:
        yield
    finally:
        _suppress_outgoing_for_turn.reset(suppression_token)
        _whatsapp_claim.reset(claim_token)
        _outgoing_message_id.reset(outgoing_token)
        _incoming_message_id.reset(incoming_token)
        _outgoing_provider.reset(provider_token)


def current_outgoing_provider() -> str:
    return _outgoing_provider.get()


def current_incoming_message_id() -> int | None:
    return _incoming_message_id.get()


def current_outgoing_message_id() -> int | None:
    return _outgoing_message_id.get()


def current_whatsapp_claim() -> WhatsAppClaimContext | None:
    return _whatsapp_claim.get()


def outgoing_suppressed_for_turn() -> bool:
    return _suppress_outgoing_for_turn.get()


def record_incoming_message_id(message_id: int) -> None:
    if isinstance(message_id, int) and not isinstance(message_id, bool) and message_id > 0:
        _incoming_message_id.set(message_id)


def record_outgoing_message_id(message_id: int) -> None:
    if isinstance(message_id, int) and not isinstance(message_id, bool) and message_id > 0:
        _outgoing_message_id.set(message_id)

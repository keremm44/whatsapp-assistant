"""Compatibility facade for the split chat-service package."""

from __future__ import annotations

import sys
from types import ModuleType
from typing import Any

from . import dependencies
from . import content
from . import responses
from . import return_flow
from . import order_helpers
from . import order_state
from . import orchestrator
from . import transport_context


def sohbet_isle(
    seller_id: int,
    whatsapp_number: str,
    kullanici_mesaji: str,
    customer_name: str | None = None,
    provider: str = "internal",
    provider_message_id: str | None = None,
    message_type: str = "text",
    media_url: str | None = None,
    outgoing_provider: str = transport_context.INTERNAL_OUTGOING_PROVIDER,
    worker_event_id: int | None = None,
    worker_id: str | None = None,
    claim_version: int | None = None,
    suppress_outgoing: bool = False,
) -> dict[str, Any]:
    """Run the historical chat flow inside an explicit request-local transport scope."""
    normalized_provider = transport_context.normalize_outgoing_provider(
        outgoing_provider
    )
    with transport_context.transport_scope(
        normalized_provider,
        worker_event_id=worker_event_id,
        worker_id=worker_id,
        claim_version=claim_version,
        suppress_outgoing=suppress_outgoing,
    ):
        result = orchestrator.sohbet_isle(
            seller_id=seller_id,
            whatsapp_number=whatsapp_number,
            kullanici_mesaji=kullanici_mesaji,
            customer_name=customer_name,
            provider=provider,
            provider_message_id=provider_message_id,
            message_type=message_type,
            media_url=media_url,
        )

        if (
            normalized_provider
            == transport_context.WHATSAPP_PENDING_OUTGOING_PROVIDER
            and isinstance(result, dict)
        ):
            result = dict(result)
            incoming_message_id = transport_context.current_incoming_message_id()
            outgoing_message_id = transport_context.current_outgoing_message_id()
            if incoming_message_id is not None:
                result.setdefault("incoming_message_id", incoming_message_id)
            if outgoing_message_id is not None:
                result.setdefault("outgoing_message_id", outgoing_message_id)
        return result


_MODULES = (
    dependencies,
    content,
    responses,
    return_flow,
    order_helpers,
    order_state,
    orchestrator,
)

_SKIP_EXPORTS = {
    "annotations",
    "sys",
    "ModuleType",
    "Any",
    "TypedDict",
    "re",
    "deps",
    "content",
    "responses",
    "return_flow",
    "order_helpers",
    "order_state",
    "orchestrator",
    "transport_context",
}

_EXPORT_TARGETS: dict[str, ModuleType] = {}

# Dependencies come first deliberately: the historical module exposed imported
# collaborators as ordinary attributes and tests monkeypatch those names.
for _module in _MODULES:
    for _name, _value in vars(_module).items():
        if _name.startswith("__") or _name in _SKIP_EXPORTS:
            continue
        if _name not in globals():
            globals()[_name] = _value
            _EXPORT_TARGETS[_name] = _module


class _ChatServiceCompatibilityModule(ModuleType):
    """Forward package-level monkeypatches to the owning implementation."""

    def __setattr__(self, name: str, value: object) -> None:
        target = _EXPORT_TARGETS.get(name)
        if target is not None:
            setattr(target, name, value)
        super().__setattr__(name, value)


sys.modules[__name__].__class__ = _ChatServiceCompatibilityModule

__all__ = sorted(
    {"sohbet_isle"}
    | {name for name in _EXPORT_TARGETS if not name.startswith("_")}
)

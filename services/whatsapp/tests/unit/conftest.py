from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest

import chat_service
import return_issue_service


# Quantity-limit reviews share the return/issue seller queue but must never be
# consumed as active return collection. The production seam therefore moved to
# get_active_collectable_return_issue_request. Older chat/return harnesses still
# monkeypatch the previous local seam name. Keep that test seam compatible while
# delegating to the new collectable lookup by default; production modules are not
# changed and quantity reviews remain excluded from collection.
_CHAT_COLLECTABLE_LOOKUP = chat_service.get_active_collectable_return_issue_request
_RETURN_COLLECTABLE_LOOKUP = return_issue_service.get_active_collectable_return_issue_request

if not hasattr(chat_service, "get_active_return_issue_request"):
    chat_service.get_active_return_issue_request = _CHAT_COLLECTABLE_LOOKUP

if not hasattr(return_issue_service, "get_active_return_issue_request"):
    return_issue_service.get_active_return_issue_request = _RETURN_COLLECTABLE_LOOKUP


def _dynamic_legacy_lookup(
    module: Any,
    fallback: Callable[..., dict[str, Any]],
    *args: Any,
    **kwargs: Any,
) -> dict[str, Any]:
    lookup = getattr(module, "get_active_return_issue_request", fallback)
    return lookup(*args, **kwargs)


@pytest.fixture(autouse=True)
def legacy_return_lookup_test_seam(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bridge legacy monkeypatch seams to the new collectable lookup in tests."""

    monkeypatch.setattr(
        chat_service,
        "get_active_collectable_return_issue_request",
        lambda *args, **kwargs: _dynamic_legacy_lookup(
            chat_service,
            _CHAT_COLLECTABLE_LOOKUP,
            *args,
            **kwargs,
        ),
    )
    monkeypatch.setattr(
        return_issue_service,
        "get_active_collectable_return_issue_request",
        lambda *args, **kwargs: _dynamic_legacy_lookup(
            return_issue_service,
            _RETURN_COLLECTABLE_LOOKUP,
            *args,
            **kwargs,
        ),
    )

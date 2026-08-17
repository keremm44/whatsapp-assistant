"""Compatibility facade for the split chat-service package."""

from __future__ import annotations

import sys
from types import ModuleType

from . import dependencies
from . import content
from . import responses
from . import return_flow
from . import order_helpers
from . import order_state
from . import orchestrator


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

__all__ = sorted(name for name in _EXPORT_TARGETS if not name.startswith("_"))

"""Database compatibility package split by persistence domain.

The public surface intentionally remains compatible with the former
``database.py`` module. Existing ``from database import ...`` imports and
pytest monkeypatch seams continue to work while implementation lives in
focused submodules.
"""

from __future__ import annotations

import sys
from types import ModuleType

from . import core
from . import messaging
from . import conversations
from . import notifications
from . import unanswered
from . import rules
from . import seller_settings
from . import applications
from . import profiles
from . import onboarding
from . import lifecycle
from . import orders
from . import order_fields
from . import returns
from . import return_reads
from . import seller_panel
from . import feedback
from . import announcements


_MODULES = (
    core,
    messaging,
    conversations,
    notifications,
    unanswered,
    rules,
    seller_settings,
    applications,
    profiles,
    onboarding,
    lifecycle,
    orders,
    order_fields,
    returns,
    return_reads,
    seller_panel,
    feedback,
    announcements,
)

# Imported implementation helpers that were never part of the old module API.
_SKIP_EXPORTS = {
    "annotations",
    "sys",
    "ModuleType",
    "Any",
    "TypedDict",
    "UUID",
    "datetime",
    "timedelta",
    "timezone",
    "os",
    "re",
    "unicodedata",
    "load_dotenv",
    "Client",
    "create_client",
    "prepare_onboarding_step",
}

_EXPORT_TARGETS: dict[str, ModuleType] = {}

# First definition wins. Core comes first for get_supabase/time helpers and the
# canonical domain module comes before any compatibility wrapper with the same
# name. Private helpers are retained because the old monolith exposed them to
# tests/debug tooling as ordinary module attributes.
for _module in _MODULES:
    for _name, _value in vars(_module).items():
        if _name.startswith("__") or _name in _SKIP_EXPORTS:
            continue
        if _name not in globals():
            globals()[_name] = _value
            _EXPORT_TARGETS[_name] = _module


class _DatabaseCompatibilityModule(ModuleType):
    """Forward monkeypatch/setattr operations to the owning implementation."""

    def __setattr__(self, name: str, value: object) -> None:
        target = _EXPORT_TARGETS.get(name)
        if target is not None:
            setattr(target, name, value)
        super().__setattr__(name, value)


sys.modules[__name__].__class__ = _DatabaseCompatibilityModule

__all__ = sorted(
    name
    for name in _EXPORT_TARGETS
    if not name.startswith("_")
)

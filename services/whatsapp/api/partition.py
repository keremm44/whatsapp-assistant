from __future__ import annotations

from collections.abc import Iterable

from fastapi import APIRouter


def build_route_partition(
    source_router: APIRouter,
    route_paths: Iterable[str],
) -> APIRouter:
    """Return an APIRouter containing the selected existing APIRoute objects.

    Keeping the original route objects preserves endpoint callables, dependency
    graphs, response metadata, and existing monkeypatch seams while ownership is
    migrated out of the legacy protected-routes module.
    """
    selected_paths = frozenset(route_paths)
    router = APIRouter()
    for route in source_router.routes:
        if getattr(route, "path", None) in selected_paths:
            router.routes.append(route)
    return router

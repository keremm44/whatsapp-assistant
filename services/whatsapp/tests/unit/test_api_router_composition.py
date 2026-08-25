from __future__ import annotations

from collections import Counter

from api.router import PARTITIONED_PATHS, router as api_router
from protected_routes import router as legacy_protected_router


def _route_signatures(router) -> Counter[tuple[str, tuple[str, ...], int | None]]:
    signatures: Counter[tuple[str, tuple[str, ...], int | None]] = Counter()
    for route in router.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if path is None or methods is None:
            continue
        signatures[(path, tuple(sorted(methods)), getattr(route, "status_code", None))] += 1
    return signatures


def _route_endpoints(router) -> dict[tuple[str, tuple[str, ...]], object]:
    endpoints: dict[tuple[str, tuple[str, ...]], object] = {}
    for route in router.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        endpoint = getattr(route, "endpoint", None)
        if path is None or methods is None or endpoint is None:
            continue
        endpoints[(path, tuple(sorted(methods)))] = endpoint
    return endpoints


def test_composed_router_preserves_legacy_protected_route_surface() -> None:
    assert _route_signatures(api_router) == _route_signatures(legacy_protected_router)


def test_all_legacy_protected_paths_have_domain_ownership() -> None:
    legacy_paths = {
        route.path
        for route in legacy_protected_router.routes
        if getattr(route, "path", None) is not None
    }
    assert PARTITIONED_PATHS == legacy_paths


def test_composed_router_reuses_existing_handler_objects() -> None:
    assert _route_endpoints(api_router) == _route_endpoints(legacy_protected_router)


def test_composed_router_has_no_duplicate_method_path_pairs() -> None:
    method_paths: list[tuple[str, str]] = []
    for route in api_router.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if path is None or methods is None:
            continue
        method_paths.extend((method, path) for method in methods)

    assert len(method_paths) == len(set(method_paths))

from __future__ import annotations

from collections import Counter

from api.router import router as api_router
from api.seller.products import ROUTE_PATHS as PRODUCT_ROUTE_PATHS
from api.seller.settings import ROUTE_PATHS as SETTINGS_ROUTE_PATHS
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


def test_composed_router_preserves_legacy_protected_route_surface() -> None:
    assert _route_signatures(api_router) == _route_signatures(legacy_protected_router)


def test_first_seller_partitions_are_owned_once() -> None:
    partitioned_paths = SETTINGS_ROUTE_PATHS | PRODUCT_ROUTE_PATHS

    for path in partitioned_paths:
        matching_routes = [
            route
            for route in api_router.routes
            if getattr(route, "path", None) == path
        ]
        legacy_matching_routes = [
            route
            for route in legacy_protected_router.routes
            if getattr(route, "path", None) == path
        ]
        assert len(matching_routes) == len(legacy_matching_routes)


def test_composed_router_has_no_duplicate_method_path_pairs() -> None:
    method_paths: list[tuple[str, str]] = []
    for route in api_router.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if path is None or methods is None:
            continue
        method_paths.extend((method, path) for method in methods)

    assert len(method_paths) == len(set(method_paths))

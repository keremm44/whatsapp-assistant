from __future__ import annotations

from collections import Counter

from api.router import PARTITIONED_PATHS, router as api_router
from api.seller.onboarding import ROUTE_PATHS as ONBOARDING_ROUTE_PATHS
from api.seller.onboarding import router as onboarding_router
from api.seller.products import ROUTE_PATHS as PRODUCT_ROUTE_PATHS
from api.seller.products import router as products_router
from api.seller.settings import ROUTE_PATHS as SETTINGS_ROUTE_PATHS
from api.seller.settings import router as settings_router
from protected_routes import router as legacy_protected_router


EXTRACTED_PATHS = SETTINGS_ROUTE_PATHS | PRODUCT_ROUTE_PATHS | ONBOARDING_ROUTE_PATHS


def _route_signatures(router) -> Counter[tuple[str, tuple[str, ...], int | None]]:
    signatures: Counter[tuple[str, tuple[str, ...], int | None]] = Counter()
    for route in router.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if path is None or methods is None:
            continue
        signatures[(path, tuple(sorted(methods)), getattr(route, "status_code", None))] += 1
    return signatures


def _route_endpoints(
    router,
    *,
    include_paths: frozenset[str] | None = None,
    exclude_paths: frozenset[str] | None = None,
) -> dict[tuple[str, tuple[str, ...]], object]:
    endpoints: dict[tuple[str, tuple[str, ...]], object] = {}
    for route in router.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        endpoint = getattr(route, "endpoint", None)
        if path is None or methods is None or endpoint is None:
            continue
        if include_paths is not None and path not in include_paths:
            continue
        if exclude_paths is not None and path in exclude_paths:
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


def test_not_yet_extracted_routes_reuse_legacy_handler_objects() -> None:
    assert _route_endpoints(
        api_router,
        exclude_paths=EXTRACTED_PATHS,
    ) == _route_endpoints(
        legacy_protected_router,
        exclude_paths=EXTRACTED_PATHS,
    )


def test_extracted_routes_use_domain_handler_objects() -> None:
    native_endpoints = {
        **_route_endpoints(settings_router),
        **_route_endpoints(products_router),
        **_route_endpoints(onboarding_router),
    }
    composed_endpoints = _route_endpoints(api_router, include_paths=EXTRACTED_PATHS)
    legacy_endpoints = _route_endpoints(
        legacy_protected_router,
        include_paths=EXTRACTED_PATHS,
    )

    assert composed_endpoints == native_endpoints
    assert set(native_endpoints) == set(legacy_endpoints)
    for key, endpoint in native_endpoints.items():
        assert composed_endpoints[key] is endpoint
        assert legacy_endpoints[key] is not endpoint


def test_composed_router_has_no_duplicate_method_path_pairs() -> None:
    method_paths: list[tuple[str, str]] = []
    for route in api_router.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if path is None or methods is None:
            continue
        method_paths.extend((method, path) for method in methods)

    assert len(method_paths) == len(set(method_paths))

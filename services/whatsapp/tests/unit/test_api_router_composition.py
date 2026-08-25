from __future__ import annotations

from collections import Counter

from api.admin.announcements import ROUTE_PATHS as ADMIN_ANNOUNCEMENT_ROUTE_PATHS
from api.admin.announcements import router as admin_announcements_router
from api.admin.applications import ROUTE_PATHS as ADMIN_APPLICATION_ROUTE_PATHS
from api.admin.applications import router as admin_applications_router
from api.admin.feedback import ROUTE_PATHS as ADMIN_FEEDBACK_ROUTE_PATHS
from api.admin.feedback import router as admin_feedback_router
from api.admin.sellers import ROUTE_PATHS as ADMIN_SELLER_ROUTE_PATHS
from api.admin.sellers import router as admin_sellers_router
from api.auth import ROUTE_PATHS as AUTH_ROUTE_PATHS
from api.auth import router as auth_router
from api.router import PARTITIONED_PATHS, router as api_router
from api.seller.account import ROUTE_PATHS as SELLER_ACCOUNT_ROUTE_PATHS
from api.seller.account import router as seller_account_router
from api.seller.announcements import ROUTE_PATHS as SELLER_ANNOUNCEMENT_ROUTE_PATHS
from api.seller.announcements import router as seller_announcements_router
from api.seller.conversations import ROUTE_PATHS as CONVERSATION_ROUTE_PATHS
from api.seller.conversations import router as conversations_router
from api.seller.dashboard import ROUTE_PATHS as DASHBOARD_ROUTE_PATHS
from api.seller.dashboard import router as dashboard_router
from api.seller.entitlements import ROUTE_PATHS as ENTITLEMENT_ROUTE_PATHS
from api.seller.entitlements import router as entitlements_router
from api.seller.feedback import ROUTE_PATHS as SELLER_FEEDBACK_ROUTE_PATHS
from api.seller.feedback import router as seller_feedback_router
from api.seller.onboarding import ROUTE_PATHS as ONBOARDING_ROUTE_PATHS
from api.seller.onboarding import router as onboarding_router
from api.seller.orders import ROUTE_PATHS as ORDER_ROUTE_PATHS
from api.seller.orders import router as orders_router
from api.seller.products import ROUTE_PATHS as PRODUCT_ROUTE_PATHS
from api.seller.products import router as products_router
from api.seller.returns import ROUTE_PATHS as RETURN_ROUTE_PATHS
from api.seller.returns import router as returns_router
from api.seller.settings import ROUTE_PATHS as SETTINGS_ROUTE_PATHS
from api.seller.settings import router as settings_router
from api.seller.unanswered import ROUTE_PATHS as UNANSWERED_ROUTE_PATHS
from api.seller.unanswered import router as unanswered_router


DOMAIN_ROUTERS = (
    (AUTH_ROUTE_PATHS, auth_router),
    (SELLER_ACCOUNT_ROUTE_PATHS, seller_account_router),
    (ENTITLEMENT_ROUTE_PATHS, entitlements_router),
    (SETTINGS_ROUTE_PATHS, settings_router),
    (PRODUCT_ROUTE_PATHS, products_router),
    (ONBOARDING_ROUTE_PATHS, onboarding_router),
    (CONVERSATION_ROUTE_PATHS, conversations_router),
    (DASHBOARD_ROUTE_PATHS, dashboard_router),
    (ADMIN_APPLICATION_ROUTE_PATHS, admin_applications_router),
    (ADMIN_SELLER_ROUTE_PATHS, admin_sellers_router),
    (ORDER_ROUTE_PATHS, orders_router),
    (RETURN_ROUTE_PATHS, returns_router),
    (UNANSWERED_ROUTE_PATHS, unanswered_router),
    (SELLER_FEEDBACK_ROUTE_PATHS, seller_feedback_router),
    (ADMIN_FEEDBACK_ROUTE_PATHS, admin_feedback_router),
    (ADMIN_ANNOUNCEMENT_ROUTE_PATHS, admin_announcements_router),
    (SELLER_ANNOUNCEMENT_ROUTE_PATHS, seller_announcements_router),
)


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


def test_partitioned_paths_match_native_domain_ownership() -> None:
    expected_paths = frozenset().union(*(paths for paths, _ in DOMAIN_ROUTERS))
    assert PARTITIONED_PATHS == expected_paths


def test_composed_router_is_exact_native_router_union() -> None:
    expected_signatures: Counter[tuple[str, tuple[str, ...], int | None]] = Counter()
    for _, domain_router in DOMAIN_ROUTERS:
        expected_signatures.update(_route_signatures(domain_router))

    assert _route_signatures(api_router) == expected_signatures


def test_composed_routes_use_native_handler_objects() -> None:
    composed_endpoints = _route_endpoints(api_router)
    native_endpoints: dict[tuple[str, tuple[str, ...]], object] = {}

    for paths, domain_router in DOMAIN_ROUTERS:
        domain_endpoints = _route_endpoints(domain_router)
        assert {path for path, _ in domain_endpoints} == set(paths)
        for key, endpoint in domain_endpoints.items():
            assert key not in native_endpoints
            native_endpoints[key] = endpoint

    assert composed_endpoints == native_endpoints
    for key, endpoint in native_endpoints.items():
        assert composed_endpoints[key] is endpoint


def test_composed_router_has_no_duplicate_method_path_pairs() -> None:
    method_paths: list[tuple[str, str]] = []
    for route in api_router.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if path is None or methods is None:
            continue
        method_paths.extend((method, path) for method in methods)

    assert len(method_paths) == len(set(method_paths))

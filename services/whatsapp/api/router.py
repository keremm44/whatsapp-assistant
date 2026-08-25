from __future__ import annotations

from fastapi import APIRouter

from api.auth import ROUTE_PATHS as AUTH_ROUTE_PATHS
from api.auth import router as auth_router
from api.admin.announcements import ROUTE_PATHS as ADMIN_ANNOUNCEMENT_ROUTE_PATHS
from api.admin.announcements import router as admin_announcements_router
from api.admin.applications import ROUTE_PATHS as ADMIN_APPLICATION_ROUTE_PATHS
from api.admin.applications import router as admin_applications_router
from api.admin.feedback import ROUTE_PATHS as ADMIN_FEEDBACK_ROUTE_PATHS
from api.admin.feedback import router as admin_feedback_router
from api.admin.sellers import ROUTE_PATHS as ADMIN_SELLER_ROUTE_PATHS
from api.admin.sellers import router as admin_sellers_router
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


PARTITIONED_PATHS = frozenset().union(
    AUTH_ROUTE_PATHS,
    ADMIN_ANNOUNCEMENT_ROUTE_PATHS,
    ADMIN_APPLICATION_ROUTE_PATHS,
    ADMIN_FEEDBACK_ROUTE_PATHS,
    ADMIN_SELLER_ROUTE_PATHS,
    SELLER_ACCOUNT_ROUTE_PATHS,
    SELLER_ANNOUNCEMENT_ROUTE_PATHS,
    CONVERSATION_ROUTE_PATHS,
    DASHBOARD_ROUTE_PATHS,
    ENTITLEMENT_ROUTE_PATHS,
    SELLER_FEEDBACK_ROUTE_PATHS,
    ONBOARDING_ROUTE_PATHS,
    ORDER_ROUTE_PATHS,
    PRODUCT_ROUTE_PATHS,
    RETURN_ROUTE_PATHS,
    SETTINGS_ROUTE_PATHS,
    UNANSWERED_ROUTE_PATHS,
)

router = APIRouter()

for source_router in (
    auth_router,
    seller_account_router,
    entitlements_router,
    settings_router,
    products_router,
    onboarding_router,
    conversations_router,
    dashboard_router,
    admin_applications_router,
    admin_sellers_router,
    orders_router,
    returns_router,
    unanswered_router,
    seller_feedback_router,
    admin_feedback_router,
    admin_announcements_router,
    seller_announcements_router,
):
    router.routes.extend(source_router.routes)

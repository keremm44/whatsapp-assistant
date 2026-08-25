# WhatsApp API route layout

This package is the composition boundary for protected WhatsApp API routes.

The migration away from `protected_routes.py` is intentionally staged:

1. `main.py` includes `api.router` instead of the legacy protected router directly.
2. Every current protected path is assigned to an explicit `api/auth.py`, `api/seller/*`, or `api/admin/*` ownership module.
3. All production protected route domains now own native handlers in their domain modules. Auth, seller account, settings, products, onboarding, conversations, dashboard/sidebar, orders, returns, unanswered questions, feedback, and announcements are native implementations; admin applications, seller activation, feedback, and announcements are native as well.
4. `tests/unit/test_api_router_composition.py` locks route-surface coverage, duplicate protection, legacy signature parity, and native-handler ownership.

`protected_routes.py` is no longer part of production route composition. It remains temporarily as a compatibility/golden source for legacy tests while those harnesses are migrated. The final cleanup can remove duplicate legacy route definitions once no tests import or patch that module for behavior verification. New protected route ownership and handler implementations should live under `api/`; do not grow a new monolithic route surface in `protected_routes.py`.

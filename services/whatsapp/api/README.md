# WhatsApp API route layout

This package is the composition boundary for protected WhatsApp API routes.

Protected route ownership is fully native:

1. `main.py` includes `api.router` as the protected API composition boundary.
2. Every protected path is assigned to an explicit `api/auth.py`, `api/seller/*`, or `api/admin/*` ownership module.
3. Auth, seller account, settings, products, onboarding, conversations, dashboard/sidebar, orders, returns, unanswered questions, feedback, and announcements own native handlers; admin applications, seller activation, feedback, and announcements are native as well.
4. `tests/unit/test_api_router_composition.py` locks domain ownership, exact native-router composition, handler ownership, and duplicate method/path protection.

The former monolithic `protected_routes.py` compatibility layer has been retired. New protected route ownership and handler implementations belong under `api/`; do not recreate a parallel monolithic protected route surface.

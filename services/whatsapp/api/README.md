# WhatsApp API route layout

This package is the composition boundary for protected WhatsApp API routes.

The migration away from `protected_routes.py` is intentionally staged:

1. `main.py` includes `api.router` instead of the legacy protected router directly.
2. Every current protected path is assigned to an explicit `api/auth.py`, `api/seller/*`, or `api/admin/*` ownership module.
3. Domains not yet extracted still reuse the existing legacy `APIRoute` objects so their path, method, status code, auth dependency, request model, response metadata and handler callables stay unchanged.
4. Extracted domains own native route handlers in their domain module. Auth, seller account, settings, products, onboarding, conversations, dashboard/sidebar, returns, unanswered questions, feedback, and announcements are now native implementations; admin applications, seller activation, feedback, and announcements are native as well.
5. `tests/unit/test_api_router_composition.py` locks route-surface coverage, duplicate protection, legacy-handler parity for untouched domains, and native-handler ownership for extracted domains.

`protected_routes.py` remains a temporary compatibility source while the migration continues. For already extracted domains, its duplicate route definitions are no longer used by the composed production router and can be removed once remaining legacy imports/test seams are migrated. New protected route ownership and handler implementations should live under `api/`; do not grow a new monolithic route surface in `protected_routes.py`.

# WhatsApp API route layout

This package is the composition boundary for protected WhatsApp API routes.

The migration away from `protected_routes.py` is intentionally staged:

1. `main.py` includes `api.router` instead of the legacy protected router directly.
2. Every current protected path is assigned to an explicit `api/auth.py`, `api/seller/*`, or `api/admin/*` ownership module.
3. The ownership modules reuse the existing `APIRoute` objects, so path, method, status code, auth dependency, request model, response metadata and handler callables stay unchanged.
4. `tests/unit/test_api_router_composition.py` locks route-surface coverage, duplicate protection and handler-object parity.
5. Handler implementations can then move out of `protected_routes.py` domain by domain in later focused changes.

During this transition, `protected_routes.py` remains the compatibility source for handler implementations and existing direct unit-test/monkeypatch seams. New protected route ownership should be declared under `api/`; do not grow a new monolithic route surface in `protected_routes.py`.

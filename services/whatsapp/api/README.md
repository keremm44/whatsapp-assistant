# WhatsApp API route layout

This package is the composition boundary for protected WhatsApp API routes.

The migration away from `protected_routes.py` is intentionally incremental:

1. `main.py` includes `api.router`.
2. Seller route groups are partitioned into domain modules without changing their path, method, status code, auth dependency, request model, response shape, or handler implementation.
3. After route-surface parity is locked by tests, handler implementations can move out of `protected_routes.py` domain by domain.

During the transition, `protected_routes.py` remains the compatibility source for handlers and existing direct unit-test seams. Do not add a new protected endpoint there when a matching domain router already exists under `api/`.

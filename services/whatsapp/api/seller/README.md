# Seller route partitions

Seller-facing protected endpoints are being split out of the legacy `protected_routes.py` module one domain at a time.

Current partitions:

- `settings.py`: `/seller/settings` and `/seller/rules*`
- `products.py`: `/seller/products*`

These modules currently own route registration while reusing the existing handler objects. This keeps public API behavior and existing compatibility seams stable before the handler implementations themselves are moved in a later step.

# Seller route partitions

Seller-facing protected endpoints are split into explicit route-ownership modules while `protected_routes.py` is dismantled incrementally.

Current ownership modules:

- `account.py`: seller identity/access surface
- `settings.py`: assistant/business settings and seller rules — native handlers extracted
- `products.py`: seller products — native handlers extracted
- `onboarding.py`: WhatsApp onboarding — native handlers extracted
- `conversations.py`: conversation list/detail, media and ownership control
- `dashboard.py`: dashboard tasks and sidebar summary
- `orders.py`: orders and dynamic order-field definitions
- `returns.py`: return/issue requests and return settings
- `unanswered.py`: unanswered-question work queue
- `feedback.py`: seller feedback
- `announcements.py`: seller announcements

Domains not yet extracted continue to reuse their original legacy `APIRoute`/handler objects. Extracted domains are registered from their native routers, with focused unit tests patching the new module seams directly. The legacy settings/product/onboarding definitions remain temporarily in `protected_routes.py` only as compatibility copies; `api.router` does not use those legacy route objects anymore.

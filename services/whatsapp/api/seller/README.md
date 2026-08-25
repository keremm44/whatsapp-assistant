# Seller route partitions

Seller-facing protected endpoints are split into explicit route-ownership modules while `protected_routes.py` is dismantled incrementally.

Current ownership modules:

- `account.py`: seller identity/access surface — native handler extracted
- `settings.py`: assistant/business settings and seller rules — native handlers extracted
- `products.py`: seller products — native handlers extracted
- `onboarding.py`: WhatsApp onboarding — native handlers extracted
- `conversations.py`: conversation list/detail, media and ownership control — native handlers extracted
- `dashboard.py`: dashboard tasks and sidebar summary — native handlers extracted
- `orders.py`: orders and dynamic order-field definitions
- `returns.py`: return/issue requests and return settings
- `unanswered.py`: unanswered-question work queue — native handlers extracted
- `feedback.py`: seller feedback — native handlers extracted
- `announcements.py`: seller announcements — native handlers extracted

Domains not yet extracted continue to reuse their original legacy `APIRoute`/handler objects. Extracted domains are registered from their native routers, with focused unit tests patching the new module seams directly. The legacy account/settings/product/onboarding/conversation/dashboard/unanswered/feedback/announcement definitions remain temporarily in `protected_routes.py` only as compatibility copies; `api.router` does not use those legacy route objects anymore.

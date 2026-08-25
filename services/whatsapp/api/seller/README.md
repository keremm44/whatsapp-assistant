# Seller route ownership

Seller-facing protected endpoints are split into explicit native route-ownership modules.

Current ownership modules:

- `account.py`: seller identity/access surface
- `settings.py`: assistant/business settings and seller rules
- `products.py`: seller products
- `onboarding.py`: WhatsApp onboarding
- `conversations.py`: conversation list/detail, media and ownership control
- `dashboard.py`: dashboard tasks and sidebar summary
- `orders.py`: orders and dynamic order-field definitions
- `returns.py`: return/issue requests and return settings
- `unanswered.py`: unanswered-question work queue
- `feedback.py`: seller feedback
- `announcements.py`: seller announcements

All seller route modules own native handlers and are composed through `api.router`. There is no legacy protected-route compatibility layer; tests patch the native module seam used by production.

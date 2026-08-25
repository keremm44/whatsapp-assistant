# Seller route partitions

Seller-facing protected endpoints are split into explicit route-ownership modules while the existing `protected_routes.py` handler implementations remain compatible during the transition.

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

The modules currently reuse the original `APIRoute`/handler objects. This preserves auth dependencies, request models, response metadata and existing test seams while the monolithic handler file is dismantled in later focused steps.

# Seller route partitions

Seller-facing protected endpoints are split into explicit route-ownership modules while `protected_routes.py` is dismantled incrementally.

Current ownership modules:

- `account.py`: seller identity/access surface — native handler extracted
- `settings.py`: assistant/business settings and seller rules — native handlers extracted
- `products.py`: seller products — native handlers extracted
- `onboarding.py`: WhatsApp onboarding — native handlers extracted
- `conversations.py`: conversation list/detail, media and ownership control — native handlers extracted
- `dashboard.py`: dashboard tasks and sidebar summary — native handlers extracted
- `orders.py`: orders and dynamic order-field definitions — native handlers extracted
- `returns.py`: return/issue requests and return settings — native handlers extracted
- `unanswered.py`: unanswered-question work queue — native handlers extracted
- `feedback.py`: seller feedback — native handlers extracted
- `announcements.py`: seller announcements — native handlers extracted

All seller route ownership modules now provide native handlers. `protected_routes.py` remains only as a temporary compatibility/golden source for legacy tests while the final cleanup migrates those test harnesses and removes duplicate definitions. Production `api.router` no longer composes seller routes from legacy `APIRoute` objects.

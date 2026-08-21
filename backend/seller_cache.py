from __future__ import annotations

import threading
import time
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")


class SellerScopedTTLCache:
    """Small in-process cache for non-sensitive, seller-scoped read models.

    Values are keyed by a namespace and authenticated seller id only. Cache
    failures never become application failures: callers always recompute.
    """

    def __init__(self, *, ttl_seconds: float = 10.0, clock: Callable[[], float] = time.monotonic) -> None:
        self.ttl_seconds = ttl_seconds
        self.clock = clock
        self._values: dict[tuple[str, int], tuple[float, object]] = {}
        self._lock = threading.Lock()

    def get_or_load(self, namespace: str, seller_id: int, loader: Callable[[], T]) -> T:
        key = (namespace, seller_id)
        now = self.clock()
        with self._lock:
            cached = self._values.get(key)
            if cached is not None and cached[0] > now:
                return cached[1]  # type: ignore[return-value]
        value = loader()
        with self._lock:
            self._values[key] = (self.clock() + self.ttl_seconds, value)
        return value

    def invalidate_seller(self, seller_id: int) -> None:
        with self._lock:
            for key in [key for key in self._values if key[1] == seller_id]:
                self._values.pop(key, None)


seller_read_cache = SellerScopedTTLCache()

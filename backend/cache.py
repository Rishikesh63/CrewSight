"""
Simple in-memory cache with TTL for CrewSight.

Thread-safe using threading.Lock. Default TTL is 300 seconds (5 minutes).
All Coral query results and AI summaries are stored here to avoid re-querying
on every dashboard request.
"""

import time
import threading
from dataclasses import dataclass, field
from typing import Any, Optional

DEFAULT_TTL = 300  # 5 minutes


@dataclass
class CacheEntry:
    """A single cached value with an expiry timestamp."""
    value: Any
    expires_at: float


class Cache:
    """
    Thread-safe in-memory key-value cache with per-entry TTL.

    Usage:
        cache = Cache()
        cache.set("issues", [...], ttl_seconds=300)
        data = cache.get("issues")   # None if expired or not set
        cache.clear()                # Clear all entries
    """

    def __init__(self) -> None:
        self._store: dict[str, CacheEntry] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        """
        Retrieve a value from the cache.

        Returns None if the key doesn't exist or has expired.
        Expired entries are evicted on access.
        """
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            if time.time() > entry.expires_at:
                del self._store[key]
                return None
            return entry.value

    def set(self, key: str, value: Any, ttl_seconds: int = DEFAULT_TTL) -> None:
        """
        Store a value in the cache with a TTL.

        Args:
            key:         Cache key
            value:       Value to store (any serialisable type)
            ttl_seconds: How long to keep the entry (default 300 s)
        """
        with self._lock:
            self._store[key] = CacheEntry(
                value=value,
                expires_at=time.time() + ttl_seconds,
            )

    def delete(self, key: str) -> None:
        """Remove a single entry from the cache."""
        with self._lock:
            self._store.pop(key, None)

    def clear(self) -> None:
        """Remove all entries from the cache."""
        with self._lock:
            self._store.clear()

    def size(self) -> int:
        """Return the number of entries currently in the cache (including expired)."""
        with self._lock:
            return len(self._store)

    def keys(self) -> list[str]:
        """Return all cache keys (including expired ones not yet evicted)."""
        with self._lock:
            return list(self._store.keys())


# ---------------------------------------------------------------------------
# Global singleton — import this in coral_client.py and main.py
# ---------------------------------------------------------------------------
cache = Cache()

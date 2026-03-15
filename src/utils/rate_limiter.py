"""Simple rate limiter for API calls (e.g. Finnhub 60/min)."""

import logging
import time
from threading import Lock

logger = logging.getLogger(__name__)


class RateLimiter:
    """Enforce minimum delay between calls; optional cap per minute."""

    def __init__(self, min_interval_seconds: float = 1.0, max_calls_per_minute: int | None = 60) -> None:
        self.min_interval = min_interval_seconds
        self.max_per_minute = max_calls_per_minute
        self._last_call = 0.0
        self._minute_calls: list[float] = []
        self._lock = Lock()

    def wait(self) -> None:
        """Block until the next call is allowed, then record the call."""
        with self._lock:
            now = time.monotonic()
            # Enforce min interval
            elapsed = now - self._last_call
            if elapsed < self.min_interval:
                sleep_time = self.min_interval - elapsed
                time.sleep(sleep_time)
                now = time.monotonic()
            # Enforce per-minute cap
            if self.max_per_minute is not None:
                cutoff = now - 60.0
                self._minute_calls = [t for t in self._minute_calls if t > cutoff]
                if len(self._minute_calls) >= self.max_per_minute:
                    wait_until = self._minute_calls[0] + 60.0
                    sleep_time = wait_until - now
                    if sleep_time > 0:
                        logger.debug("Rate limit: waiting %.1fs for minute window", sleep_time)
                        time.sleep(sleep_time)
                        now = time.monotonic()
                    self._minute_calls = [t for t in self._minute_calls if t > now - 60.0]
                self._minute_calls.append(now)
            self._last_call = now

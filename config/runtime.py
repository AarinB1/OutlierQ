"""Mutable runtime configuration for OutlierQ.

Values here can be changed at runtime via CLI flags or API endpoints.
The pipeline reads from this module rather than settings.py for values
that need to be togglable without restarting the process.
"""

import threading

from config.settings import MIROFISH_ENABLED as _INITIAL_MIROFISH_ENABLED

_lock = threading.Lock()
_mirofish_enabled: bool = _INITIAL_MIROFISH_ENABLED


def is_mirofish_enabled() -> bool:
    """Return the current MiroFish enabled state (thread-safe)."""
    with _lock:
        return _mirofish_enabled


def set_mirofish_enabled(value: bool) -> None:
    """Set the MiroFish enabled state (thread-safe)."""
    global _mirofish_enabled
    with _lock:
        _mirofish_enabled = value


def toggle_mirofish() -> bool:
    """Flip the MiroFish enabled state and return the new value."""
    global _mirofish_enabled
    with _lock:
        _mirofish_enabled = not _mirofish_enabled
        return _mirofish_enabled

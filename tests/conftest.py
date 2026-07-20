"""Shared test bootstrap.

Import torch fully before any test triggers it mid-import. scipy >= 1.17's
array-API compatibility layer probes ``sys.modules['torch'].Tensor`` whenever
torch is present; if a test file's import chain starts loading torch and then
reaches scipy before torch finishes initializing (the FastAPI app import does
exactly this), the probe raises ``AttributeError: module 'torch' has no
attribute 'Tensor'`` and errors the test. Full-suite runs never see this
because earlier test modules import torch at collection time — this makes
single-file runs behave the same way.
"""

try:  # pragma: no cover - environment guard, not logic
    import torch  # noqa: F401
except ImportError:
    pass

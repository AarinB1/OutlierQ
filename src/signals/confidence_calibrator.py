"""Confidence calibration against realized signal outcomes.

Signal confidence accumulates heuristic adjustments (event blend, contract
liquidity, technical indicators, MiroFish agreement) that were never checked
against reality. This module fits an isotonic regression from *stated*
confidence to *realized* win rate on evaluated signals, so a stored
confidence of 0.8 means "signals like this have won ~80% of the time"
rather than "the heuristics summed to 0.8".

Activation threshold (documented): calibration fits only once there are at
least ``MIN_SAMPLES`` (40) evaluated signals containing both wins and
non-wins. Below that, ``calibrate()`` is the identity function and the
pipeline stores raw confidence unchanged — the scaffolding is inert until
enough labeled outcomes exist.

The fitted mapping is persisted as JSON (isotonic breakpoints), refit
automatically after each evaluation pass, and applied by SignalEngine when
storing new signals. Raw pre-calibration confidence is kept on the signal
as ``raw_confidence`` for auditability.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from config.settings import CACHE_DIR, LOG_FORMAT
from src.db.tables import Signal

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

MIN_SAMPLES = 40
DEFAULT_PATH = CACHE_DIR / "confidence_calibration.json"


class ConfidenceCalibrator:
    """Maps stated signal confidence to empirically realized win rate."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or DEFAULT_PATH
        self._x: list[float] = []
        self._y: list[float] = []
        self.metadata: dict = {}
        self.load()

    @property
    def is_fitted(self) -> bool:
        return len(self._x) >= 2

    # ── Fitting ───────────────────────────────────────────────────────

    def fit(self, session: Session) -> dict:
        """Fit isotonic regression on evaluated signals; persist on success.

        Returns a status dict. Does not fit (and clears nothing) when below
        the activation threshold.
        """
        rows = (
            session.query(Signal.confidence, Signal.outcome)
            .filter(Signal.outcome.isnot(None), Signal.confidence.isnot(None))
            .all()
        )
        samples = [(float(c), 1.0 if outcome == "profit" else 0.0) for c, outcome in rows]
        n = len(samples)
        wins = sum(y for _, y in samples)

        if n < MIN_SAMPLES or wins == 0 or wins == n:
            reason = (
                f"needs >= {MIN_SAMPLES} evaluated signals with both outcomes "
                f"(have {n}, wins={int(wins)})"
            )
            logger.info("Confidence calibration inactive: %s", reason)
            return {"calibrated": False, "n_samples": n, "reason": reason}

        from sklearn.isotonic import IsotonicRegression

        xs = [s[0] for s in samples]
        ys = [s[1] for s in samples]
        iso = IsotonicRegression(y_min=0.02, y_max=0.98, out_of_bounds="clip")
        iso.fit(xs, ys)

        brier_raw = sum((x - y) ** 2 for x, y in samples) / n
        brier_cal = sum((float(iso.predict([x])[0]) - y) ** 2 for x, y in samples) / n

        self._x = [float(v) for v in iso.X_thresholds_]
        self._y = [float(v) for v in iso.y_thresholds_]
        self.metadata = {
            "fitted_at": datetime.now(timezone.utc).isoformat(),
            "n_samples": n,
            "wins": int(wins),
            "brier_raw": round(brier_raw, 4),
            "brier_calibrated": round(brier_cal, 4),
        }
        self.save()
        logger.info(
            "Confidence calibration fitted on %d signals (Brier %.4f -> %.4f)",
            n, brier_raw, brier_cal,
        )
        return {"calibrated": True, **self.metadata}

    def maybe_refit(self, session: Session) -> dict:
        """Refit after an evaluation pass; inert below the activation threshold."""
        try:
            return self.fit(session)
        except Exception:
            logger.exception("Confidence calibration refit failed")
            return {"calibrated": False, "reason": "refit error"}

    # ── Application ───────────────────────────────────────────────────

    def calibrate(self, raw_confidence: float) -> float:
        """Map raw confidence to realized win rate. Identity when unfitted."""
        if not self.is_fitted:
            return raw_confidence
        x = max(self._x[0], min(self._x[-1], float(raw_confidence)))
        # Piecewise-linear interpolation over the isotonic breakpoints.
        for i in range(1, len(self._x)):
            if x <= self._x[i]:
                x0, x1 = self._x[i - 1], self._x[i]
                y0, y1 = self._y[i - 1], self._y[i]
                if x1 == x0:
                    return y1
                t = (x - x0) / (x1 - x0)
                return y0 + t * (y1 - y0)
        return self._y[-1]

    # ── Diagnostics ───────────────────────────────────────────────────

    def reliability_table(self, session: Session, bins: int = 5) -> list[dict]:
        """Stated-confidence bins vs realized win rate, for reporting."""
        rows = (
            session.query(Signal.confidence, Signal.outcome)
            .filter(Signal.outcome.isnot(None), Signal.confidence.isnot(None))
            .all()
        )
        table = []
        for b in range(bins):
            lo, hi = b / bins, (b + 1) / bins
            in_bin = [
                (float(c), outcome == "profit")
                for c, outcome in rows
                if lo <= float(c) < hi or (b == bins - 1 and float(c) == hi)
            ]
            if not in_bin:
                table.append({"bin": f"{lo:.1f}-{hi:.1f}", "count": 0,
                              "stated": None, "realized": None})
                continue
            table.append({
                "bin": f"{lo:.1f}-{hi:.1f}",
                "count": len(in_bin),
                "stated": round(sum(c for c, _ in in_bin) / len(in_bin), 3),
                "realized": round(sum(1 for _, won in in_bin if won) / len(in_bin), 3),
            })
        return table

    # ── Persistence ───────────────────────────────────────────────────

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps({
            "x_thresholds": self._x,
            "y_thresholds": self._y,
            "metadata": self.metadata,
        }))

    def load(self) -> bool:
        if not self.path.exists():
            return False
        try:
            data = json.loads(self.path.read_text())
            x = [float(v) for v in data.get("x_thresholds", [])]
            y = [float(v) for v in data.get("y_thresholds", [])]
            if len(x) == len(y) and len(x) >= 2:
                self._x, self._y = x, y
                self.metadata = dict(data.get("metadata", {}))
                return True
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            logger.warning("Ignoring unreadable calibration file %s: %s", self.path, exc)
        return False

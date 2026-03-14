"""Z-score spike detection for news volume anomalies.

Detects when a ticker is receiving abnormally high news coverage by
comparing today's article count against a 14-day rolling baseline.
A z-score >= 3.0 indicates a statistically significant volume spike.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT
from src.db.database import get_session
from src.db.tables import Article

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Cold-start defaults when fewer than 7 days of history exist
_DEFAULT_BASELINE_MEAN = 3.0
_DEFAULT_BASELINE_STD = 2.0
_MIN_HISTORY_DAYS = 7
_ROLLING_WINDOW_DAYS = 14


class VolumeDetector:
    """Detects abnormal news volume spikes via z-score analysis."""

    def __init__(self, threshold: float = 3.0) -> None:
        self.threshold = threshold

    def compute_baseline(self, ticker: str, session: Session | None = None) -> tuple[float, float]:
        """Return (mean, std_dev) of daily article counts over the rolling window.

        If fewer than 7 days of history exist, returns default baseline values.
        """
        def _query(s: Session) -> tuple[float, float]:
            cutoff = datetime.now(timezone.utc) - timedelta(days=_ROLLING_WINDOW_DAYS)
            today_start = datetime.now(timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )

            # Get daily article counts for this ticker over the rolling window,
            # excluding today (today is what we're measuring against the baseline)
            rows = (
                s.query(
                    func.date(Article.ingested_at).label("day"),
                    func.count(Article.id).label("cnt"),
                )
                .filter(
                    Article.ticker == ticker,
                    Article.ingested_at >= cutoff,
                    Article.ingested_at < today_start,
                )
                .group_by(func.date(Article.ingested_at))
                .all()
            )

            if len(rows) < _MIN_HISTORY_DAYS:
                logger.debug(
                    "%s: only %d days of history — using default baseline (mean=%.1f, std=%.1f)",
                    ticker, len(rows), _DEFAULT_BASELINE_MEAN, _DEFAULT_BASELINE_STD,
                )
                return _DEFAULT_BASELINE_MEAN, _DEFAULT_BASELINE_STD

            counts = [r.cnt for r in rows]
            n = len(counts)
            mean = sum(counts) / n
            variance = sum((c - mean) ** 2 for c in counts) / n
            std = variance ** 0.5

            # Avoid division by zero — if all days have the same count, std is 0
            if std == 0:
                std = 1.0

            logger.debug("%s baseline: mean=%.2f, std=%.2f over %d days", ticker, mean, std, n)
            return mean, std

        if session is not None:
            return _query(session)
        with get_session() as s:
            return _query(s)

    def get_today_count(self, ticker: str, session: Session | None = None) -> int:
        """Count articles ingested today for this ticker."""
        def _query(s: Session) -> int:
            today_start = datetime.now(timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            count = (
                s.query(func.count(Article.id))
                .filter(
                    Article.ticker == ticker,
                    Article.ingested_at >= today_start,
                )
                .scalar()
            )
            return count or 0

        if session is not None:
            return _query(session)
        with get_session() as s:
            return _query(s)

    def detect_spike(self, ticker: str, session: Session | None = None) -> dict | None:
        """Check if today's article volume is a statistical outlier.

        Returns a result dict if z_score >= threshold, else None.
        """
        mean, std = self.compute_baseline(ticker, session=session)
        today_count = self.get_today_count(ticker, session=session)

        z_score = (today_count - mean) / std

        logger.info(
            "%s volume: today=%d, baseline=%.1f±%.1f, z=%.2f (threshold=%.1f)",
            ticker, today_count, mean, std, z_score, self.threshold,
        )

        if z_score >= self.threshold:
            logger.info("SPIKE DETECTED for %s — z-score %.2f exceeds threshold %.1f",
                        ticker, z_score, self.threshold)
            return {
                "ticker": ticker,
                "z_score": z_score,
                "today_count": today_count,
                "baseline_mean": mean,
                "baseline_std": std,
            }
        return None

    def scan_all(self, tickers: list[str], session: Session | None = None) -> list[dict]:
        """Run detect_spike on all tickers, returning only those that spiked."""
        spikes: list[dict] = []
        for ticker in tickers:
            result = self.detect_spike(ticker, session=session)
            if result is not None:
                spikes.append(result)
        logger.info("Volume scan complete: %d/%d tickers spiked", len(spikes), len(tickers))
        return spikes

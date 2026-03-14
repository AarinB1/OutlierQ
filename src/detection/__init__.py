"""Anomaly detection pipeline — ties volume, sentiment, and cross-source validation together.

An article/ticker must pass ALL three filters to be flagged as an outlier event:
  1. VolumeDetector — is the ticker getting abnormally high news coverage?
  2. SentimentFilter — do the articles contain extreme sentiment language?
  3. CrossSourceValidator — are multiple independent sources reporting this?
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT
from src.db.database import get_session
from src.db.tables import Article, Event
from src.detection.cross_source import CrossSourceValidator
from src.detection.sentiment_filter import SentimentFilter
from src.detection.volume_detector import VolumeDetector

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class AnomalyPipeline:
    """Orchestrates the three-stage anomaly detection pipeline."""

    def __init__(
        self,
        volume_threshold: float = 3.0,
        sentiment_threshold: float = 0.6,
        extreme_ratio: float = 0.5,
        min_sources: int = 2,
    ) -> None:
        self.volume_detector = VolumeDetector(threshold=volume_threshold)
        self.sentiment_filter = SentimentFilter(
            extreme_threshold=sentiment_threshold,
            extreme_ratio_threshold=extreme_ratio,
        )
        self.cross_source = CrossSourceValidator(min_sources=min_sources)

    def _get_recent_articles(self, ticker: str, session: Session) -> list:
        """Fetch articles ingested in the last 6 hours for a ticker."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=6)
        return (
            session.query(Article)
            .filter(Article.ticker == ticker, Article.ingested_at >= cutoff)
            .all()
        )

    def scan(self, tickers: list[str], session: Session | None = None) -> list[dict]:
        """Run the full three-stage detection pipeline.

        1. Volume spike detection
        2. Sentiment magnitude filtering (on spiked tickers)
        3. Cross-source validation (on sentiment-passing tickers)

        Returns list of fully validated outlier events.
        """
        def _run(s: Session) -> list[dict]:
            # Stage 1: Volume spikes
            spikes = self.volume_detector.scan_all(tickers, session=s)
            spiked_tickers = [sp["ticker"] for sp in spikes]
            spike_map = {sp["ticker"]: sp for sp in spikes}

            # Stage 2: Sentiment filter on spiked tickers
            sentiment_passed: list[str] = []
            sentiment_map: dict[str, dict] = {}

            for ticker in spiked_tickers:
                articles = self._get_recent_articles(ticker, s)
                if not articles:
                    continue

                sentiment_result = self.sentiment_filter.score_batch(articles)
                if sentiment_result["passes_filter"]:
                    sentiment_passed.append(ticker)
                    sentiment_map[ticker] = sentiment_result

                    # Write sentiment scores back to DB
                    self.sentiment_filter.update_article_scores(articles, session=s)

            # Stage 3: Cross-source validation
            outliers: list[dict] = []

            for ticker in sentiment_passed:
                articles = self._get_recent_articles(ticker, s)
                cross_result = self.cross_source.validate(
                    ticker, articles=articles, session=s
                )
                if cross_result is None:
                    continue

                spike_data = spike_map[ticker]
                sent_data = sentiment_map[ticker]

                # Compute combined confidence score
                normalized_z = min(spike_data["z_score"] / 5.0, 1.0)
                normalized_sources = min(cross_result["distinct_sources"] / 5.0, 1.0)
                confidence = (
                    normalized_z + sent_data["extreme_ratio"] + normalized_sources
                ) / 3.0

                article_ids = [a.id for a in articles]

                outlier = {
                    "ticker": ticker,
                    "z_score": spike_data["z_score"],
                    "today_count": spike_data["today_count"],
                    "baseline_mean": spike_data["baseline_mean"],
                    "baseline_std": spike_data["baseline_std"],
                    "mean_sentiment": sent_data["mean_sentiment"],
                    "max_magnitude": sent_data["max_magnitude"],
                    "extreme_ratio": sent_data["extreme_ratio"],
                    "direction": sent_data["direction"],
                    "distinct_sources": cross_result["distinct_sources"],
                    "sources": cross_result["sources"],
                    "common_themes": cross_result["common_themes"],
                    "article_count": cross_result["article_count"],
                    "article_ids": article_ids,
                    "confidence_score": confidence,
                }
                outliers.append(outlier)

                logger.info(
                    "OUTLIER CONFIRMED: %s — z=%.2f, sentiment=%s (%.3f), "
                    "sources=%s, themes=%s, confidence=%.3f",
                    ticker, spike_data["z_score"], sent_data["direction"],
                    sent_data["mean_sentiment"], cross_result["sources"],
                    cross_result["common_themes"], confidence,
                )

            logger.info(
                "Scanned %d tickers: %d volume spikes -> %d passed sentiment -> %d confirmed outliers",
                len(tickers), len(spiked_tickers), len(sentiment_passed), len(outliers),
            )
            return outliers

        if session is not None:
            return _run(session)
        with get_session() as s:
            return _run(s)

    def scan_and_store(
        self, tickers: list[str], session: Session | None = None
    ) -> list[Event]:
        """Run scan() and store confirmed outliers as Event records.

        Sets event_type to "other" (Phase 3 will classify properly).
        Direction comes from sentiment analysis.
        """
        def _run(s: Session) -> list[Event]:
            outliers = self.scan(tickers, session=s)
            events: list[Event] = []

            for outlier in outliers:
                event = Event(
                    ticker=outlier["ticker"],
                    event_type="other",
                    direction=outlier["direction"],
                    confidence=outlier["confidence_score"],
                    article_ids=outlier["article_ids"],
                    metadata_json={
                        "z_score": outlier["z_score"],
                        "mean_sentiment": outlier["mean_sentiment"],
                        "extreme_ratio": outlier["extreme_ratio"],
                        "distinct_sources": outlier["distinct_sources"],
                        "sources": outlier["sources"],
                        "common_themes": outlier["common_themes"],
                    },
                )
                s.add(event)
                events.append(event)

            s.flush()
            logger.info("Stored %d outlier events in the database", len(events))
            return events

        if session is not None:
            return _run(session)
        with get_session() as s:
            return _run(s)

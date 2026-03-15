"""Anomaly detection pipeline — ties volume, sentiment, and cross-source validation together.

An article/ticker must pass ALL three filters to be flagged as an outlier event:
  1. VolumeDetector — is the ticker getting abnormally high news coverage?
  2. SentimentFilter — do the articles contain extreme sentiment language?
  3. CrossSourceValidator — are multiple independent sources reporting this?
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from config.settings import FINBERT_BATCH_SIZE, LOG_FORMAT
from src.classification.event_classifier import EventClassifier
from src.db.database import get_session
from src.db.tables import Article, Event, Signal
from src.detection.cross_source import CrossSourceValidator
from src.detection.sentiment_filter import SentimentFilter
from src.detection.volume_detector import VolumeDetector

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class AnomalyPipeline:
    """Orchestrates the three-stage anomaly detection pipeline."""

    # Production thresholds
    _PROD_SENTIMENT_THRESHOLD = 0.6
    _PROD_EXTREME_RATIO = 0.5
    _PROD_MIN_SOURCES = 2

    # Demo thresholds — lower so signals generate on normal market days
    _DEMO_SENTIMENT_THRESHOLD = 0.3
    _DEMO_EXTREME_RATIO = 0.05
    _DEMO_MIN_SOURCES = 1

    def __init__(
        self,
        volume_threshold: float = 3.0,
        sentiment_threshold: float = 0.6,
        extreme_ratio: float = 0.5,
        min_sources: int = 2,
        demo: bool = False,
    ) -> None:
        self.demo = demo

        if demo:
            sentiment_threshold = self._DEMO_SENTIMENT_THRESHOLD
            extreme_ratio = self._DEMO_EXTREME_RATIO
            min_sources = self._DEMO_MIN_SOURCES
            logger.info("AnomalyPipeline initialized in DEMO mode")
        else:
            logger.info("AnomalyPipeline initialized in PRODUCTION mode")

        self.volume_detector = VolumeDetector(threshold=volume_threshold)
        self.sentiment_filter = SentimentFilter(
            extreme_threshold=sentiment_threshold,
            extreme_ratio_threshold=extreme_ratio,
            batch_size=FINBERT_BATCH_SIZE,
        )
        self.cross_source = CrossSourceValidator(min_sources=min_sources)
        self.classifier = EventClassifier()

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
        """Run scan(), classify each outlier, and store as Event records.

        Uses EventClassifier to determine event_type and direction.
        Blends classifier confidence with detection confidence.
        """
        def _run(s: Session) -> list[Event]:
            outliers = self.scan(tickers, session=s)
            events: list[Event] = []

            for outlier in outliers:
                # Fetch article objects for classification
                articles = (
                    s.query(Article)
                    .filter(Article.id.in_(outlier["article_ids"]))
                    .all()
                )

                # Classify the event
                cls_result = self.classifier.classify_event(
                    articles,
                    common_themes=outlier.get("common_themes", []),
                )

                # Blend detection confidence with classifier confidence
                blended_confidence = (
                    outlier["confidence_score"] + cls_result["confidence"]
                ) / 2.0

                event = Event(
                    ticker=outlier["ticker"],
                    event_type=cls_result["event_type"],
                    direction=cls_result["direction"],
                    confidence=blended_confidence,
                    article_ids=outlier["article_ids"],
                    metadata_json={
                        "z_score": outlier["z_score"],
                        "mean_sentiment": outlier["mean_sentiment"],
                        "extreme_ratio": outlier["extreme_ratio"],
                        "distinct_sources": outlier["distinct_sources"],
                        "sources": outlier["sources"],
                        "common_themes": outlier["common_themes"],
                        "classified_type": cls_result["event_type"],
                        "vote_distribution": cls_result["vote_distribution"],
                        "top_keywords": cls_result["top_keywords"],
                    },
                )
                s.add(event)
                events.append(event)

                logger.info(
                    "OUTLIER: %s — %s (%s) confidence=%.2f",
                    outlier["ticker"], cls_result["event_type"],
                    cls_result["direction"], blended_confidence,
                )

            s.flush()
            logger.info("Stored %d outlier events in the database", len(events))
            return events

        if session is not None:
            return _run(session)
        with get_session() as s:
            return _run(s)

    def full_pipeline(
        self, tickers: list[str], session: Session | None = None
    ) -> list[Signal]:
        """Run the complete end-to-end pipeline: detect, classify, and generate signals.

        1. scan_and_store — detection + classification
        2. SignalEngine.generate_and_store — signal generation
        Returns the list of created Signal objects.
        """
        from src.ingestion.market_fetcher import MarketFetcher
        from src.signals.signal_engine import SignalEngine

        def _run(s: Session) -> list[Signal]:
            events = self.scan_and_store(tickers, session=s)

            if not events:
                logger.info(
                    "Pipeline complete: %d tickers scanned -> 0 outliers detected -> 0 signals generated",
                    len(tickers),
                )
                return []

            # Build event dicts for the signal engine (include metadata for exploratory signals)
            event_dicts = []
            for event in events:
                event_dicts.append({
                    "ticker": event.ticker,
                    "event_type": event.event_type,
                    "event_id": event.id,
                    "direction": event.direction,
                    "confidence": event.confidence,
                    "id": event.id,
                    "metadata": event.metadata_json or {},
                })

            engine = SignalEngine(market_fetcher=MarketFetcher(), demo=self.demo)
            signals = engine.generate_and_store(event_dicts, session=s)

            logger.info(
                "Pipeline complete: %d tickers scanned -> %d outliers detected -> %d signals generated",
                len(tickers), len(events), len(signals),
            )

            for sig in signals:
                logger.info(
                    "SIGNAL: %s %s @ $%.0f exp %s (confidence=%.2f) — %s",
                    sig.direction, sig.ticker, sig.suggested_strike or 0,
                    sig.suggested_expiry or "N/A", sig.confidence,
                    next(
                        (e.event_type for e in events if e.id == sig.event_id),
                        "unknown",
                    ),
                )

            return signals

        if session is not None:
            return _run(session)
        with get_session() as s:
            return _run(s)

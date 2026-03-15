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
from src.detection.edgar_monitor import EdgarMonitor
from src.detection.options_flow import OptionsFlowDetector
from src.detection.sentiment_filter import SentimentFilter
from src.detection.volume_detector import VolumeDetector
from src.ingestion.market_fetcher import MarketFetcher

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
        use_ml: bool = False,
    ) -> None:
        self.demo = demo
        self.use_ml = use_ml

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
        self.options_flow = OptionsFlowDetector(market_fetcher=MarketFetcher())
        self.edgar = EdgarMonitor()
        if use_ml:
            try:
                from src.ml.ensemble import EnsembleClassifier

                self.classifier = EnsembleClassifier()
                logger.info("ML-enhanced ensemble classifier enabled")
            except Exception as exc:
                logger.warning(
                    "Failed to initialize ensemble classifier (%s). Falling back to keyword classifier.",
                    exc,
                )
                self.classifier = EventClassifier()
        else:
            self.classifier = EventClassifier()

    def _get_recent_articles(self, ticker: str, session: Session) -> list:
        """Fetch articles ingested in the last 6 hours for a ticker."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=6)
        return (
            session.query(Article)
            .filter(Article.ticker == ticker, Article.ingested_at >= cutoff)
            .all()
        )

    def _check_options_flow(self, ticker: str) -> dict | None:
        """Run unusual options activity scan for a single ticker."""
        return self.options_flow.scan_ticker(ticker)

    def _check_edgar(self, ticker: str) -> dict | None:
        """Run SEC EDGAR monitor for a single ticker."""
        return self.edgar.scan_ticker(ticker)

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
                    "source": "news_pipeline",
                }
                outliers.append(outlier)

                logger.info(
                    "OUTLIER CONFIRMED: %s — z=%.2f, sentiment=%s (%.3f), "
                    "sources=%s, themes=%s, confidence=%.3f",
                    ticker, spike_data["z_score"], sent_data["direction"],
                    sent_data["mean_sentiment"], cross_result["sources"],
                    cross_result["common_themes"], confidence,
                )

            # Stage 4: Options flow cross-validation and options-only detections
            options_results = self.options_flow.scan_batch(tickers)
            options_map = {row["ticker"]: row for row in options_results}
            existing_tickers = {o["ticker"] for o in outliers}

            for outlier in outliers:
                ticker = outlier["ticker"]
                options_data = options_map.get(ticker)
                if not options_data:
                    continue

                outlier["options_flow"] = {
                    "direction": options_data["direction"],
                    "unusual_contract_count": options_data["unusual_contract_count"],
                    "max_conviction": options_data["max_conviction"],
                    "dominant_expiry": options_data["dominant_expiry"],
                    "dominant_strike": options_data["dominant_strike"],
                    "top_contracts": options_data["top_contracts"],
                    "put_call_ratio": options_data["put_call_ratio"],
                }

                confidence = float(outlier["confidence_score"]) + 0.1
                sentiment_dir = outlier.get("direction", "neutral")
                flow_dir = options_data.get("direction", "neutral")
                if (
                    flow_dir in {"bullish", "bearish"}
                    and sentiment_dir in {"bullish", "bearish"}
                ):
                    if flow_dir == sentiment_dir:
                        confidence += 0.05
                    else:
                        confidence -= 0.1
                outlier["confidence_score"] = max(0.0, min(1.0, confidence))

            for ticker, options_data in options_map.items():
                if ticker in existing_tickers:
                    continue
                if (
                    options_data.get("max_conviction", 0.0) >= 0.7
                    and options_data.get("unusual_contract_count", 0) >= 3
                ):
                    confidence = float(options_data["max_conviction"]) * 0.8
                    outlier = {
                        "ticker": ticker,
                        "z_score": 0.0,
                        "today_count": 0,
                        "baseline_mean": 0.0,
                        "baseline_std": 0.0,
                        "mean_sentiment": 0.0,
                        "max_magnitude": options_data["max_conviction"],
                        "extreme_ratio": 0.0,
                        "direction": options_data["direction"],
                        "distinct_sources": 0,
                        "sources": [],
                        "common_themes": [],
                        "article_count": 0,
                        "article_ids": [],
                        "confidence_score": confidence,
                        "source": "options_flow",
                        "options_flow": {
                            "direction": options_data["direction"],
                            "unusual_contract_count": options_data["unusual_contract_count"],
                            "max_conviction": options_data["max_conviction"],
                            "dominant_expiry": options_data["dominant_expiry"],
                            "dominant_strike": options_data["dominant_strike"],
                            "top_contracts": options_data["top_contracts"],
                            "put_call_ratio": options_data["put_call_ratio"],
                        },
                    }
                    outliers.append(outlier)
                    logger.info(
                        "OPTIONS-ONLY OUTLIER: %s — %s, %d unusual contracts, conviction=%.2f",
                        ticker,
                        options_data["direction"],
                        options_data["unusual_contract_count"],
                        options_data["max_conviction"],
                    )

            # Stage 5: SEC EDGAR filing cross-validation and EDGAR-only detections
            edgar_results = self.edgar.scan_batch(tickers)
            edgar_map = {row["ticker"]: row for row in edgar_results}
            existing_tickers = {o["ticker"] for o in outliers}

            for outlier in outliers:
                ticker = outlier["ticker"]
                edgar_data = edgar_map.get(ticker)
                if not edgar_data:
                    continue

                outlier["edgar_data"] = edgar_data
                confidence = float(outlier["confidence_score"]) + 0.08
                edgar_direction = edgar_data.get("combined_direction", "neutral")
                if (
                    edgar_direction in {"bullish", "bearish"}
                    and outlier.get("direction") == edgar_direction
                ):
                    confidence += 0.05
                outlier["confidence_score"] = max(0.0, min(1.0, confidence))

            for ticker, edgar_data in edgar_map.items():
                if ticker in existing_tickers:
                    continue
                if (
                    edgar_data.get("has_significant_filing")
                    and float(edgar_data.get("combined_severity", 0.0)) >= 0.6
                ):
                    confidence = float(edgar_data["combined_severity"]) * 0.85
                    outliers.append(
                        {
                            "ticker": ticker,
                            "z_score": 0.0,
                            "today_count": 0,
                            "baseline_mean": 0.0,
                            "baseline_std": 0.0,
                            "mean_sentiment": 0.0,
                            "max_magnitude": float(edgar_data["combined_severity"]),
                            "extreme_ratio": 0.0,
                            "direction": edgar_data.get("combined_direction", "neutral"),
                            "distinct_sources": 0,
                            "sources": [],
                            "common_themes": [],
                            "article_count": 0,
                            "article_ids": [],
                            "confidence_score": confidence,
                            "source": "edgar",
                            "edgar_data": edgar_data,
                        }
                    )
                    logger.info(
                        "EDGAR-ONLY OUTLIER: %s — %s",
                        ticker,
                        edgar_data.get("summary", "significant filing"),
                    )
                elif (
                    edgar_data.get("has_unusual_insider_activity")
                    and not edgar_data.get("has_significant_filing")
                ):
                    logger.info(
                        "EDGAR info only for %s: unusual Form 4 activity without significant 8-K items",
                        ticker,
                    )

            logger.info(
                "Scanned %d tickers: %d volume spikes -> %d passed sentiment -> %d confirmed outliers (%d options-flow, %d edgar)",
                len(tickers),
                len(spiked_tickers),
                len(sentiment_passed),
                len(outliers),
                len(options_results),
                len(edgar_results),
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
                if hasattr(self.classifier, "classify"):
                    cls_result = self.classifier.classify(
                        articles,
                        event_data=outlier,
                        common_themes=outlier.get("common_themes", []),
                    )
                else:
                    cls_result = self.classifier.classify_event(
                        articles,
                        common_themes=outlier.get("common_themes", []),
                        event_hint=outlier.get("source"),
                        options_flow=outlier.get("options_flow"),
                        edgar_data=outlier.get("edgar_data"),
                        fallback_direction=outlier.get("direction"),
                        fallback_confidence=outlier.get("confidence_score"),
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
                        "source": outlier.get("source", "news_pipeline"),
                        "options_flow": outlier.get("options_flow"),
                        "edgar_data": outlier.get("edgar_data"),
                        "classified_type": cls_result["event_type"],
                        "vote_distribution": cls_result["vote_distribution"],
                        "top_keywords": cls_result["top_keywords"],
                        "ml_prediction": cls_result.get("ml_prediction"),
                        "ensemble_method": cls_result.get("ensemble_method"),
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

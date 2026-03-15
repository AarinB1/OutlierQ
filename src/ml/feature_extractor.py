"""Feature extraction for OutlierQ ML classification."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT
from src.db.tables import Article, Event, Signal

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_EVENT_TYPE_ENCODING: dict[str, int] = {
    "scandal": 0,
    "legal": 1,
    "earnings_miss": 2,
    "recall": 3,
    "fda_approval": 4,
    "breakthrough": 5,
    "major_contract": 6,
    "earnings_beat": 7,
    "other": 8,
}


@dataclass(frozen=True)
class FeatureSpec:
    name: str
    dtype: type
    default: float


class FeatureExtractor:
    """Converts raw event/signal context into fixed-length numeric features."""

    def __init__(self) -> None:
        self.feature_schema: list[FeatureSpec] = [
            # Sentiment features
            FeatureSpec("sentiment_compound", float, 0.0),
            FeatureSpec("sentiment_max_magnitude", float, 0.0),
            FeatureSpec("sentiment_extreme_ratio", float, 0.0),
            FeatureSpec("sentiment_positive_ratio", float, 0.0),
            FeatureSpec("sentiment_negative_ratio", float, 0.0),
            FeatureSpec("sentiment_neutral_ratio", float, 1.0),
            # Volume features
            FeatureSpec("news_volume_zscore", float, 0.0),
            FeatureSpec("news_article_count", float, 0.0),
            FeatureSpec("source_count", float, 0.0),
            # Options flow features
            FeatureSpec("has_unusual_options", float, 0.0),
            FeatureSpec("options_max_conviction", float, 0.0),
            FeatureSpec("options_call_volume", float, 0.0),
            FeatureSpec("options_put_volume", float, 0.0),
            FeatureSpec("options_put_call_ratio", float, 0.0),
            FeatureSpec("options_direction_agrees", float, 0.0),
            # Technical indicator features
            FeatureSpec("rsi_14", float, 0.0),
            FeatureSpec("bollinger_pct_b", float, 0.0),
            FeatureSpec("bollinger_bandwidth", float, 0.0),
            FeatureSpec("atr_pct", float, 0.0),
            FeatureSpec("macd_histogram", float, 0.0),
            FeatureSpec("relative_volume", float, 0.0),
            FeatureSpec("trend_20d", float, -1.0),
            # EDGAR features
            FeatureSpec("has_8k_filing", float, 0.0),
            FeatureSpec("filing_severity", float, 0.0),
            FeatureSpec("has_unusual_insider_activity", float, 0.0),
            FeatureSpec("insider_filing_count", float, 0.0),
            # Keyword classifier features
            FeatureSpec("keyword_top_score", float, 0.0),
            FeatureSpec("keyword_confidence", float, 0.0),
            FeatureSpec("keyword_event_type_encoded", float, -1.0),
            # Meta features
            FeatureSpec("market_cap_log", float, -1.0),
            FeatureSpec("is_sp500", float, 0.0),
            FeatureSpec("day_of_week", float, -1.0),
            FeatureSpec("hour_of_day", float, -1.0),
        ]

    def extract_from_event(self, event_data: dict[str, Any]) -> dict[str, float]:
        """Extract a normalized flat feature dict from combined event data."""
        features = {spec.name: float(spec.default) for spec in self.feature_schema}
        metadata = self._metadata_from_event(event_data)
        ticker = str(event_data.get("ticker", "UNKNOWN"))

        articles = self._normalize_articles(event_data.get("articles"))
        sentiments = [
            self._to_float(a.get("sentiment_score"), 0.0)
            for a in articles
            if a.get("sentiment_score") is not None
        ]
        magnitudes = [
            abs(self._to_float(a.get("sentiment_magnitude"), 0.0))
            for a in articles
            if a.get("sentiment_magnitude") is not None
        ]

        if sentiments:
            features["sentiment_compound"] = self._clip(
                sum(sentiments) / len(sentiments),
                -1.0,
                1.0,
            )
            positives = sum(1 for s in sentiments if s > 0.1)
            negatives = sum(1 for s in sentiments if s < -0.1)
            neutrals = len(sentiments) - positives - negatives
            total = max(len(sentiments), 1)
            features["sentiment_positive_ratio"] = positives / total
            features["sentiment_negative_ratio"] = negatives / total
            features["sentiment_neutral_ratio"] = neutrals / total
            extreme = sum(1 for s in sentiments if abs(s) >= 0.6)
            features["sentiment_extreme_ratio"] = extreme / total
        else:
            features["sentiment_compound"] = self._clip(
                self._to_float(
                    event_data.get("mean_sentiment", metadata.get("mean_sentiment", 0.0)),
                    0.0,
                ),
                -1.0,
                1.0,
            )
            features["sentiment_extreme_ratio"] = self._clip(
                self._to_float(
                    event_data.get("extreme_ratio", metadata.get("extreme_ratio", 0.0)),
                    0.0,
                ),
                0.0,
                1.0,
            )
        if magnitudes:
            features["sentiment_max_magnitude"] = self._clip(max(magnitudes), 0.0, 1.0)
        else:
            features["sentiment_max_magnitude"] = self._clip(
                self._to_float(
                    event_data.get("max_magnitude", metadata.get("max_magnitude", 0.0)),
                    0.0,
                ),
                0.0,
                1.0,
            )

        # Volume
        features["news_volume_zscore"] = self._to_float(
            event_data.get("z_score", metadata.get("z_score", 0.0)),
            0.0,
        )
        features["news_article_count"] = self._to_float(
            event_data.get(
                "today_count",
                event_data.get(
                    "article_count",
                    metadata.get("article_count", len(articles)),
                ),
            ),
            float(len(articles)),
        )
        source_count = event_data.get("distinct_sources", metadata.get("distinct_sources"))
        if source_count is None:
            source_count = len(event_data.get("sources", metadata.get("sources", [])) or [])
        features["source_count"] = self._to_float(source_count, 0.0)

        # Options flow
        options = (
            event_data.get("options_flow")
            or metadata.get("options_flow")
            or {}
        )
        has_unusual_options = bool(options) or self._to_int(options.get("unusual_contract_count"), 0) > 0
        features["has_unusual_options"] = 1.0 if has_unusual_options else 0.0
        features["options_max_conviction"] = self._clip(
            self._to_float(options.get("max_conviction"), 0.0),
            0.0,
            1.0,
        )
        call_vol = self._to_int(options.get("total_unusual_call_volume"), 0)
        put_vol = self._to_int(options.get("total_unusual_put_volume"), 0)
        if call_vol == 0 and put_vol == 0:
            top_contracts = options.get("top_contracts", []) or []
            call_vol = sum(
                self._to_int(c.get("volume"), 0)
                for c in top_contracts
                if str(c.get("type", "")).lower() == "call"
            )
            put_vol = sum(
                self._to_int(c.get("volume"), 0)
                for c in top_contracts
                if str(c.get("type", "")).lower() == "put"
            )
        features["options_call_volume"] = float(call_vol)
        features["options_put_volume"] = float(put_vol)
        if call_vol > 0:
            features["options_put_call_ratio"] = put_vol / call_vol
        else:
            features["options_put_call_ratio"] = self._to_float(options.get("put_call_ratio"), 0.0)
        sentiment_direction = self._sentiment_direction(features["sentiment_compound"])
        options_direction = str(options.get("direction", "neutral")).lower()
        direction_agrees = (
            options_direction in {"bullish", "bearish"}
            and sentiment_direction in {"bullish", "bearish"}
            and options_direction == sentiment_direction
        )
        features["options_direction_agrees"] = 1.0 if direction_agrees else 0.0

        # Technicals
        technicals = (
            metadata.get("technical_context")
            or event_data.get("technicals")
            or event_data.get("technical_indicators")
            or {}
        )
        features["rsi_14"] = self._to_float(technicals.get("rsi_14", technicals.get("rsi")), 0.0)
        features["bollinger_pct_b"] = self._to_float(technicals.get("bollinger_pct_b"), 0.0)
        features["bollinger_bandwidth"] = self._to_float(technicals.get("bollinger_bandwidth"), 0.0)
        features["atr_pct"] = self._to_float(technicals.get("atr_pct"), 0.0)
        features["macd_histogram"] = self._to_float(technicals.get("macd_histogram"), 0.0)
        features["relative_volume"] = self._to_float(technicals.get("relative_volume"), 0.0)
        features["trend_20d"] = self._to_float(technicals.get("trend_20d"), -1.0)

        # EDGAR
        edgar = event_data.get("edgar_data") or metadata.get("edgar_data") or {}
        has_8k = bool(edgar.get("has_significant_filing")) or self._to_int(
            edgar.get("8k_analysis", {}).get("recent_8k_count"),
            0,
        ) > 0
        features["has_8k_filing"] = 1.0 if has_8k else 0.0
        features["filing_severity"] = self._clip(
            self._to_float(edgar.get("combined_severity"), 0.0),
            0.0,
            1.0,
        )
        has_unusual_insider = bool(edgar.get("has_unusual_insider_activity"))
        features["has_unusual_insider_activity"] = 1.0 if has_unusual_insider else 0.0
        features["insider_filing_count"] = self._to_float(
            edgar.get("insider_analysis", {}).get("total_form4s"),
            0.0,
        )

        # Keyword classifier
        vote_distribution = metadata.get("vote_distribution", {}) or {}
        top_score = 0.0
        if isinstance(vote_distribution, dict) and vote_distribution:
            top_score = max(self._to_float(v, 0.0) for v in vote_distribution.values())
        features["keyword_top_score"] = top_score
        features["keyword_confidence"] = self._to_float(
            event_data.get("confidence", metadata.get("keyword_confidence", 0.0)),
            0.0,
        )
        raw_event_type = event_data.get("event_type") or metadata.get("classified_type")
        if raw_event_type is None:
            features["keyword_event_type_encoded"] = -1.0
        else:
            event_type = str(raw_event_type)
            features["keyword_event_type_encoded"] = float(_EVENT_TYPE_ENCODING.get(event_type, -1))

        # Meta
        company_info = event_data.get("company_info") or {}
        market_cap = (
            company_info.get("market_cap")
            if isinstance(company_info, dict)
            else event_data.get("market_cap")
        )
        market_cap_val = self._to_float(market_cap, -1.0)
        if market_cap_val > 0:
            features["market_cap_log"] = math.log10(market_cap_val)
        features["is_sp500"] = 1.0 if bool(event_data.get("is_sp500", company_info.get("is_sp500", False))) else 0.0

        ts = (
            event_data.get("detected_at")
            or event_data.get("created_at")
            or event_data.get("timestamp")
        )
        dt_obj = self._parse_datetime(ts)
        if dt_obj is not None:
            features["day_of_week"] = float(dt_obj.weekday())
            features["hour_of_day"] = float(dt_obj.hour)

        logger.info("Extracted %d features for %s", len(features), ticker)
        return features

    def extract_from_signal_record(self, signal: Signal, session: Session) -> dict[str, float]:
        """Extract feature dict from a persisted Signal record."""
        event = session.query(Event).filter(Event.id == signal.event_id).first()
        if event is None:
            logger.warning("Signal %s has no linked event %s", signal.id, signal.event_id)
            return {spec.name: float(spec.default) for spec in self.feature_schema}

        article_records: list[Article] = []
        article_ids = event.article_ids or []
        if article_ids:
            article_records = session.query(Article).filter(Article.id.in_(article_ids)).all()

        event_payload: dict[str, Any] = {
            "ticker": event.ticker,
            "event_type": event.event_type,
            "direction": event.direction,
            "confidence": event.confidence,
            "detected_at": event.detected_at,
            "metadata": event.metadata_json or {},
            "articles": article_records,
        }
        return self.extract_from_event(event_payload)

    def to_vector(self, features: dict[str, float]) -> list[float]:
        """Return a fixed-order feature vector aligned to schema."""
        return [float(features.get(spec.name, spec.default)) for spec in self.feature_schema]

    def get_feature_names(self) -> list[str]:
        return [spec.name for spec in self.feature_schema]

    def build_training_dataset(self, session: Session) -> tuple[list[list[float]], list[int], list[str]]:
        """Build (X, y, signal_ids) from signals with known outcomes."""
        labeled = (
            session.query(Signal)
            .filter(Signal.outcome.in_(["profit", "loss", "expired"]))
            .order_by(Signal.created_at.asc())
            .all()
        )

        X: list[list[float]] = []
        y: list[int] = []
        signal_ids: list[str] = []
        for signal in labeled:
            features = self.extract_from_signal_record(signal, session)
            X.append(self.to_vector(features))
            y.append(1 if signal.outcome == "profit" else 0)
            signal_ids.append(signal.id)

        pos = sum(y)
        neg = len(y) - pos
        logger.info(
            "Built training dataset: %d samples, %d positive, %d negative",
            len(y),
            pos,
            neg,
        )
        if len(y) < 20:
            logger.warning(
                "Insufficient data for training (%d samples, need at least 50)",
                len(y),
            )
        return X, y, signal_ids

    @staticmethod
    def _to_float(value: Any, default: float = 0.0) -> float:
        try:
            if value is None:
                return default
            return float(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _to_int(value: Any, default: int = 0) -> int:
        try:
            if value is None:
                return default
            return int(float(value))
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _clip(value: float, low: float, high: float) -> float:
        return max(low, min(high, value))

    @staticmethod
    def _sentiment_direction(compound: float) -> str:
        if compound > 0.1:
            return "bullish"
        if compound < -0.1:
            return "bearish"
        return "neutral"

    @staticmethod
    def _metadata_from_event(event_data: dict[str, Any]) -> dict[str, Any]:
        raw = event_data.get("metadata") or event_data.get("metadata_json") or {}
        return raw if isinstance(raw, dict) else {}

    @staticmethod
    def _parse_datetime(value: Any) -> datetime | None:
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None
        return None

    @staticmethod
    def _normalize_articles(articles: Any) -> list[dict[str, Any]]:
        if not isinstance(articles, list):
            return []
        normalized: list[dict[str, Any]] = []
        for a in articles:
            if isinstance(a, dict):
                normalized.append(a)
            else:
                normalized.append(
                    {
                        "sentiment_score": getattr(a, "sentiment_score", None),
                        "sentiment_magnitude": getattr(a, "sentiment_magnitude", None),
                    }
                )
        return normalized

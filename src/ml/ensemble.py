"""Ensemble classifier combining keyword and ML predictions."""

from __future__ import annotations

import logging
from typing import Any

from config.settings import LOG_FORMAT
from src.classification.event_classifier import EventClassifier
from src.ml.feature_extractor import FeatureExtractor
from src.ml.model import OutlierQModel

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class EnsembleClassifier:
    """Adjust keyword classifier confidence with the ML profit/loss signal.

    The ML model is trained on signal outcomes, so it predicts P(the signal
    generated from this event would have been profitable) — NOT a market
    direction. A profitable put is a bearish win, so mapping "profit" to
    "bullish" (the previous behavior) was wrong. Direction always comes from
    the event classifier; the ML probability only scales confidence.
    """

    def __init__(self, ml_weight: float = 0.5) -> None:
        self.ml_weight = ml_weight
        self.keyword_classifier = EventClassifier()
        self.extractor = FeatureExtractor()
        self.model = OutlierQModel()
        self.model.load()

    def classify(
        self,
        articles: list[Any],
        event_data: dict[str, Any],
        common_themes: list[str] | None = None,
    ) -> dict[str, Any]:
        """Return event classification in EventClassifier.classify_event format."""
        keyword_result = self.keyword_classifier.classify_event(
            articles,
            common_themes=common_themes,
            event_hint=event_data.get("source"),
            options_flow=event_data.get("options_flow"),
            edgar_data=event_data.get("edgar_data"),
            fallback_direction=event_data.get("direction"),
            fallback_confidence=event_data.get("confidence_score"),
        )

        if not self.model.is_trained:
            return keyword_result

        features = self.extractor.extract_from_event(
            {
                **event_data,
                "articles": articles,
                "metadata": event_data,
                "event_type": keyword_result.get("event_type"),
                "confidence": keyword_result.get("confidence"),
            }
        )
        ml_pred = self.model.predict(features)
        profit_prob = float(ml_pred["profit_probability"])
        keyword_conf = float(keyword_result.get("confidence", 0.0))

        # Shift confidence by how far the ML profit estimate sits from coin-flip.
        adjustment = (profit_prob - 0.5) * self.ml_weight
        confidence = max(0.0, min(1.0, keyword_conf + adjustment))
        ensemble_method = "ml_boost" if adjustment >= 0 else "ml_damp"

        result = dict(keyword_result)
        result["confidence"] = confidence
        result["ml_prediction"] = dict(ml_pred)
        result["ensemble_method"] = ensemble_method
        return result

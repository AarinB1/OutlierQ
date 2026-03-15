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
    """Blend keyword classifier output with ML profit/loss signal."""

    def __init__(self, keyword_weight: float = 0.5, ml_weight: float = 0.5) -> None:
        self.keyword_weight = keyword_weight
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
        ml_direction = "bullish" if int(ml_pred["prediction"]) == 1 else "bearish"
        ml_conf = float(ml_pred["confidence"])
        keyword_conf = float(keyword_result.get("confidence", 0.0))
        keyword_direction = str(keyword_result.get("direction", "neutral"))

        if ml_direction == keyword_direction:
            confidence = min(max(keyword_conf, ml_conf) + 0.05, 1.0)
            direction = keyword_direction
            ensemble_method = "agreement_boost"
        else:
            weighted_conf = (self.keyword_weight * keyword_conf) + (self.ml_weight * ml_conf)
            if ml_conf >= keyword_conf:
                direction = ml_direction
                ensemble_method = "ml_override"
            else:
                direction = keyword_direction
                ensemble_method = "keyword_override"
            confidence = max(0.0, min(1.0, weighted_conf))

        result = dict(keyword_result)
        result["direction"] = direction
        result["confidence"] = confidence
        result["ml_prediction"] = {
            "direction": ml_direction,
            **ml_pred,
        }
        result["ensemble_method"] = ensemble_method
        return result

"""Market regime detector using GradientBoosting/RandomForest classifier.

Classifies market conditions into: bull_trend, bear_trend, sideways, high_vol.
Determines which trading strategy should be active.
"""

from __future__ import annotations

import logging
import pickle
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.model_selection import cross_val_score

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

REGIME_LABELS = ["bull_trend", "bear_trend", "sideways", "high_vol"]
MODEL_PATH = Path(".cache/regime_detector.pkl")


class RegimeDetector:
    """Classifies market regime using VIX, breadth, and rotation features."""

    def __init__(self, model_type: str = "gradient_boosting") -> None:
        if model_type == "random_forest":
            self.model = RandomForestClassifier(
                n_estimators=100, max_depth=5, random_state=42,
            )
        else:
            self.model = GradientBoostingClassifier(
                n_estimators=100, max_depth=3, learning_rate=0.1, random_state=42,
            )
        self.is_trained = False
        self.feature_names: list[str] = []

    def get_regime_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract regime-relevant features from a feature DataFrame."""
        regime_cols = [
            c for c in df.columns
            if any(k in c for k in [
                "vix", "regime", "adx", "bb_bandwidth", "relative_volume",
                "return_20d", "atr_14", "rsi_14",
            ])
        ]
        return df[regime_cols] if regime_cols else pd.DataFrame()

    def train(self, features: pd.DataFrame, labels: pd.Series) -> dict[str, float]:
        """Train the regime classifier on labeled data."""
        self.feature_names = list(features.columns)

        X = features.values
        y = labels.values

        cv_scores = cross_val_score(self.model, X, y, cv=5, scoring="accuracy")
        self.model.fit(X, y)
        self.is_trained = True

        metrics = {
            "cv_accuracy_mean": float(cv_scores.mean()),
            "cv_accuracy_std": float(cv_scores.std()),
        }
        logger.info(
            "Regime detector trained: CV accuracy=%.3f +/- %.3f",
            metrics["cv_accuracy_mean"], metrics["cv_accuracy_std"],
        )
        return metrics

    def predict(self, features: pd.DataFrame) -> tuple[str, float]:
        """Predict the current market regime and confidence.

        Returns (regime_label, confidence).
        """
        if not self.is_trained:
            return self._rule_based_predict(features)

        X = features[self.feature_names].values if self.feature_names else features.values
        if X.ndim == 1:
            X = X.reshape(1, -1)

        proba = self.model.predict_proba(X)
        predicted_idx = int(np.argmax(proba[-1]))
        confidence = float(proba[-1][predicted_idx])
        label = self.model.classes_[predicted_idx]

        return str(label), confidence

    def predict_series(self, features: pd.DataFrame) -> pd.DataFrame:
        """Predict regime for each row in the DataFrame."""
        if not self.is_trained:
            results = []
            for _, row in features.iterrows():
                label, conf = self._rule_based_predict(row.to_frame().T)
                results.append({"regime": label, "regime_confidence": conf})
            return pd.DataFrame(results, index=features.index)

        X = features[self.feature_names].values if self.feature_names else features.values
        proba = self.model.predict_proba(X)
        predictions = self.model.predict(X)
        confidences = proba.max(axis=1)

        return pd.DataFrame({
            "regime": predictions,
            "regime_confidence": confidences,
        }, index=features.index)

    def _rule_based_predict(self, features: pd.DataFrame) -> tuple[str, float]:
        """Fallback rule-based regime classification when no trained model exists."""
        row = features.iloc[-1] if len(features) > 0 else features

        vix = row.get("vix_level", 20.0)
        regime_bull = row.get("regime_bull", 0)
        regime_bear = row.get("regime_bear", 0)
        regime_high_vol = row.get("regime_high_vol", 0)

        if regime_high_vol or (isinstance(vix, (int, float)) and vix > 30):
            return "high_vol", 0.7
        if regime_bear:
            return "bear_trend", 0.6
        if regime_bull:
            return "bull_trend", 0.6
        return "sideways", 0.5

    def save(self, path: Path | None = None) -> None:
        path = path or MODEL_PATH
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump({
                "model": self.model,
                "feature_names": self.feature_names,
                "is_trained": self.is_trained,
            }, f)
        logger.info("Regime detector saved to %s", path)

    def load(self, path: Path | None = None) -> None:
        path = path or MODEL_PATH
        if not path.exists():
            logger.warning("No saved regime detector at %s", path)
            return
        with open(path, "rb") as f:
            data = pickle.load(f)
        self.model = data["model"]
        self.feature_names = data["feature_names"]
        self.is_trained = data["is_trained"]
        logger.info("Regime detector loaded from %s", path)

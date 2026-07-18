"""ML model wrapper for OutlierQ profit/loss classification."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
from joblib import dump, load
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

from config.settings import CACHE_DIR, LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class OutlierQModel:
    """Training, inference, and persistence for OutlierQ classifier."""

    def __init__(self, model_type: str = "gradient_boosting") -> None:
        self.model_type = model_type
        self.model: Any = None
        self.feature_names: list[str] = []
        self.is_trained: bool = False
        self.training_metrics: dict[str, Any] = {}
        self.model_path: Path = CACHE_DIR / "ml_model.pkl"

    def train(self, X: list[list[float]], y: list[int], feature_names: list[str]) -> dict[str, Any]:
        """Train and evaluate the selected model."""
        n = len(X)
        if n < 30:
            raise ValueError(f"Need at least 30 labeled samples to train. Currently have {n}.")
        if len(y) != n:
            raise ValueError("X and y must have the same length.")
        if not feature_names:
            raise ValueError("feature_names cannot be empty.")

        X_np = np.asarray(X, dtype=float)
        y_np = np.asarray(y, dtype=int)
        self.feature_names = list(feature_names)

        class_counts = np.bincount(y_np, minlength=2)
        can_stratify = class_counts.min() >= 2
        stratify = y_np if can_stratify else None

        X_train, X_test, y_train, y_test = train_test_split(
            X_np,
            y_np,
            test_size=0.2,
            random_state=42,
            stratify=stratify,
        )

        self.model = self._build_model()
        self.model.fit(X_train, y_train)

        y_pred = self.model.predict(X_test)
        accuracy = float(accuracy_score(y_test, y_pred))
        precision = float(precision_score(y_test, y_pred, zero_division=0))
        recall = float(recall_score(y_test, y_pred, zero_division=0))
        f1 = float(f1_score(y_test, y_pred, zero_division=0))
        matrix = confusion_matrix(y_test, y_pred, labels=[0, 1]).tolist()

        feature_importances = self.get_feature_importances()
        top_10 = feature_importances[:10]

        self.training_metrics = {
            "model_type": self.model_type,
            "n_samples": int(n),
            "n_features": int(len(feature_names)),
            "train_size": int(len(X_train)),
            "test_size": int(len(X_test)),
            "accuracy": accuracy,
            "precision": precision,
            "recall": recall,
            "f1_score": f1,
            "confusion_matrix": matrix,
            "feature_importances_top10": top_10,
            "class_distribution": {
                "profit": int(class_counts[1]),
                "loss_or_expired": int(class_counts[0]),
            },
        }
        self.is_trained = True
        self.save()
        logger.info(
            "Model trained: accuracy=%.3f, precision=%.3f, recall=%.3f, f1=%.3f",
            accuracy,
            precision,
            recall,
            f1,
        )
        return self.training_metrics

    def predict(self, features: dict[str, float]) -> dict[str, float | int]:
        """Predict profit/loss for a single feature dict."""
        if not self.is_trained or self.model is None:
            raise RuntimeError("Model not trained. Run train() first or load a saved model.")
        vector = np.asarray([[float(features.get(name, 0.0)) for name in self.feature_names]], dtype=float)
        probabilities = self.model.predict_proba(vector)[0]
        loss_prob = float(probabilities[0])
        profit_prob = float(probabilities[1]) if len(probabilities) > 1 else 0.0
        prediction = int(profit_prob >= 0.5)
        confidence = profit_prob if prediction == 1 else loss_prob
        return {
            "prediction": prediction,
            "confidence": float(confidence),
            "profit_probability": profit_prob,
            "loss_probability": loss_prob,
        }

    def predict_batch(self, feature_list: list[dict[str, float]]) -> list[dict[str, float | int]]:
        """Predict profit/loss for a batch of feature dicts."""
        return [self.predict(features) for features in feature_list]

    def get_feature_importances(self) -> list[tuple[str, float]]:
        """Return sorted feature importances."""
        if not self.is_trained or self.model is None:
            return []
        if not hasattr(self.model, "feature_importances_"):
            return []
        importances = list(getattr(self.model, "feature_importances_", []))
        pairs = list(zip(self.feature_names, (float(v) for v in importances)))
        pairs.sort(key=lambda x: x[1], reverse=True)
        return pairs

    def save(self, path: Path | None = None) -> None:
        """Persist model bundle to disk."""
        target = path or self.model_path
        target.parent.mkdir(parents=True, exist_ok=True)
        bundle = {
            "model_type": self.model_type,
            "model": self.model,
            "feature_names": self.feature_names,
            "training_metrics": self.training_metrics,
        }
        dump(bundle, target)

    def load(self, path: Path | None = None) -> bool:
        """Load model bundle from disk."""
        target = path or self.model_path
        if not target.exists():
            return False
        bundle = load(target)
        self.model_type = str(bundle.get("model_type", self.model_type))
        self.model = bundle.get("model")
        self.feature_names = list(bundle.get("feature_names", []))
        self.training_metrics = dict(bundle.get("training_metrics", {}))
        self.is_trained = self.model is not None and bool(self.feature_names)
        if self.is_trained:
            acc = float(self.training_metrics.get("accuracy", 0.0))
            logger.info("Loaded ML model from %s: accuracy=%.3f", target, acc)
        return self.is_trained

    def _build_model(self) -> Any:
        if self.model_type == "xgboost":
            try:
                from xgboost import XGBClassifier

                return XGBClassifier(
                    n_estimators=100,
                    max_depth=4,
                    learning_rate=0.1,
                    eval_metric="logloss",
                    random_state=42,
                )
            except ImportError:
                logger.warning("xgboost not installed. Falling back to gradient_boosting.")
                self.model_type = "gradient_boosting"

        return GradientBoostingClassifier(
            n_estimators=100,
            max_depth=4,
            learning_rate=0.1,
            random_state=42,
        )

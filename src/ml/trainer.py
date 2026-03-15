"""ML training orchestration for OutlierQ."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT
from src.db.database import get_session
from src.db.tables import Signal
from src.ml.feature_extractor import FeatureExtractor
from src.ml.model import OutlierQModel

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class ModelTrainer:
    """Coordinates readiness checks, training, and evaluation workflows."""

    def __init__(self, model_type: str = "gradient_boosting") -> None:
        self.extractor = FeatureExtractor()
        self.model = OutlierQModel(model_type=model_type)

    def check_readiness(self, session: Session | None = None) -> dict[str, Any]:
        """Return readiness status for ML model training."""
        def _run(s: Session) -> dict[str, Any]:
            total_signals = s.query(Signal).count()
            labeled = s.query(Signal).filter(Signal.outcome.in_(["profit", "loss", "expired"])).all()

            signals_with_outcomes = len(labeled)
            profit_count = sum(1 for sig in labeled if sig.outcome == "profit")
            loss_count = sum(1 for sig in labeled if sig.outcome == "loss")
            expired_count = sum(1 for sig in labeled if sig.outcome == "expired")
            negative_count = loss_count + expired_count
            ready = signals_with_outcomes >= 30 and profit_count > 0 and negative_count > 0

            if ready:
                message = (
                    f"Ready to train: {signals_with_outcomes} labeled signals "
                    f"({profit_count} profit, {negative_count} non-profit)."
                )
            else:
                needed = max(0, 30 - signals_with_outcomes)
                if signals_with_outcomes < 30:
                    message = (
                        f"Need {needed} more labeled signals before training "
                        f"({signals_with_outcomes}/30 available)."
                    )
                elif profit_count == 0:
                    message = "Need at least one profit outcome before training."
                else:
                    message = "Need at least one loss/expired outcome before training."

            return {
                "total_signals": total_signals,
                "signals_with_outcomes": signals_with_outcomes,
                "profit_count": profit_count,
                "loss_count": loss_count,
                "expired_count": expired_count,
                "ready_to_train": ready,
                "message": message,
            }

        if session is not None:
            return _run(session)
        with get_session() as s:
            return _run(s)

    def train(self, session: Session | None = None) -> dict[str, Any]:
        """Build training dataset and fit model when readiness criteria are met."""
        def _run(s: Session) -> dict[str, Any]:
            readiness = self.check_readiness(session=s)
            if not readiness["ready_to_train"]:
                return {"error": "Not enough labeled data", "details": readiness}

            X, y, signal_ids = self.extractor.build_training_dataset(s)
            metrics = self.model.train(X, y, self.extractor.get_feature_names())
            metrics["signal_ids"] = signal_ids
            return metrics

        if session is not None:
            return _run(session)
        with get_session() as s:
            return _run(s)

    def evaluate_on_recent(self, session: Session | None = None, n: int = 20) -> dict[str, Any]:
        """Evaluate trained model against most recent labeled signals."""
        def _run(s: Session) -> dict[str, Any]:
            if not self.model.is_trained and not self.model.load():
                return {"error": "Model not trained"}

            recent = (
                s.query(Signal)
                .filter(Signal.outcome.in_(["profit", "loss", "expired"]))
                .order_by(Signal.created_at.desc())
                .limit(max(1, n))
                .all()
            )
            if not recent:
                return {
                    "n_evaluated": 0,
                    "model_accuracy": 0.0,
                    "keyword_accuracy": 0.0,
                    "comparison": [],
                }

            comparison: list[dict[str, Any]] = []
            model_correct = 0
            keyword_correct = 0
            for signal in recent:
                actual_label = 1 if signal.outcome == "profit" else 0
                features = self.extractor.extract_from_signal_record(signal, s)
                prediction = self.model.predict(features)
                ml_label = int(prediction["prediction"])
                model_correct += 1 if ml_label == actual_label else 0
                # Keyword baseline created all signals expecting positive outcome.
                keyword_label = 1
                keyword_correct += 1 if keyword_label == actual_label else 0
                comparison.append(
                    {
                        "ticker": signal.ticker,
                        "keyword_prediction": "profit",
                        "ml_prediction": "profit" if ml_label == 1 else "loss",
                        "actual_outcome": signal.outcome,
                    }
                )

            total = len(recent)
            return {
                "n_evaluated": total,
                "model_accuracy": model_correct / total if total else 0.0,
                "keyword_accuracy": keyword_correct / total if total else 0.0,
                "comparison": comparison,
            }

        if session is not None:
            return _run(session)
        with get_session() as s:
            return _run(s)

    def retrain_scheduled(self) -> None:
        """Periodic retraining workflow (safe no-op when not ready)."""
        readiness = self.check_readiness()
        if not readiness["ready_to_train"]:
            logger.info("Scheduled retrain skipped: %s", readiness["message"])
            return
        result = self.train()
        if "error" in result:
            logger.warning("Scheduled retrain failed: %s", result)
            return
        logger.info(
            "Scheduled retrain complete: accuracy=%.3f f1=%.3f samples=%d",
            float(result.get("accuracy", 0.0)),
            float(result.get("f1_score", 0.0)),
            int(result.get("n_samples", 0)),
        )

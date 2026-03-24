"""Track prediction outcomes and compute accuracy statistics."""

import logging
from datetime import datetime
from sqlalchemy.orm import Session

from src.predictions.prediction_db import Prediction, PredictionMarket

logger = logging.getLogger(__name__)


class PredictionTracker:
    """Stores predictions and evaluates them against resolved markets."""

    def __init__(self, db_session: Session):
        self.db = db_session

    def store_prediction(self, pred: dict) -> Prediction:
        """Store a new prediction."""
        record = Prediction(
            market_id=pred["market_id"],
            platform=pred["platform"],
            question=pred["question"],
            predicted_outcome=pred["predicted_outcome"],
            predicted_probability=pred["predicted_probability"],
            market_probability=pred["market_probability"],
            edge=pred["edge"],
            confidence=pred["confidence"],
            matched_event_type=pred.get("matched_event_type"),
            matched_tickers=pred.get("matched_tickers"),
            match_method=pred.get("match_method"),
            # MiroFish simulation fields
            simulation_enhanced=pred.get("simulation_enhanced", False),
            sim_estimated_probability=pred.get("sim_estimated_probability"),
            sim_consensus_strength=pred.get("sim_consensus_strength"),
            sim_yes_pct=pred.get("sim_yes_pct"),
            sim_narrative=pred.get("sim_narrative"),
        )
        self.db.add(record)
        self.db.flush()
        return record

    def evaluate_resolved(self, resolved_markets: list[dict]) -> list[dict]:
        """Check pending predictions against resolved market outcomes.

        Args:
            resolved_markets: List of dicts with market_id and outcome ("yes"/"no").

        Returns:
            List of evaluation result dicts.
        """
        results = []
        for rm in resolved_markets:
            market_id = rm["market_id"]
            actual = rm["outcome"]

            preds = (
                self.db.query(Prediction)
                .filter(
                    Prediction.market_id == market_id,
                    Prediction.actual_outcome.is_(None),
                )
                .all()
            )

            for pred in preds:
                pred.actual_outcome = actual
                pred.is_correct = pred.predicted_outcome == actual
                pred.resolved_at = datetime.utcnow()

                # Hypothetical P&L on a $1 bet
                if pred.predicted_outcome == "yes":
                    entry_price = pred.market_probability or 0.5
                    pred.pnl_if_bet = (1.0 - entry_price) if actual == "yes" else -entry_price
                else:
                    entry_price = 1.0 - (pred.market_probability or 0.5)
                    pred.pnl_if_bet = (1.0 - entry_price) if actual == "no" else -entry_price

                results.append({
                    "market_id": market_id,
                    "question": pred.question,
                    "predicted": pred.predicted_outcome,
                    "actual": actual,
                    "correct": pred.is_correct,
                    "pnl": pred.pnl_if_bet,
                    "edge": pred.edge,
                })

        self.db.flush()
        logger.info("Evaluated %d predictions", len(results))
        return results

    def get_accuracy_stats(self) -> dict:
        """Compute accuracy statistics for all resolved predictions."""
        resolved = self.db.query(Prediction).filter(Prediction.actual_outcome.isnot(None)).all()
        if not resolved:
            return {
                "total": 0, "correct": 0, "accuracy": 0,
                "avg_edge": 0, "avg_pnl": 0,
                "by_platform": {}, "by_event_type": {},
            }

        correct = sum(1 for p in resolved if p.is_correct)
        total = len(resolved)

        # By platform
        by_platform = {}
        for p in resolved:
            plat = p.platform
            if plat not in by_platform:
                by_platform[plat] = {"total": 0, "correct": 0}
            by_platform[plat]["total"] += 1
            if p.is_correct:
                by_platform[plat]["correct"] += 1
        for v in by_platform.values():
            v["accuracy"] = v["correct"] / max(v["total"], 1)

        # By event type
        by_event = {}
        for p in resolved:
            et = p.matched_event_type or "unknown"
            if et not in by_event:
                by_event[et] = {"total": 0, "correct": 0}
            by_event[et]["total"] += 1
            if p.is_correct:
                by_event[et]["correct"] += 1
        for v in by_event.values():
            v["accuracy"] = v["correct"] / max(v["total"], 1)

        return {
            "total": total,
            "correct": correct,
            "accuracy": correct / total,
            "avg_edge": sum(p.edge or 0 for p in resolved) / total,
            "avg_pnl": sum(p.pnl_if_bet or 0 for p in resolved) / total,
            "by_platform": by_platform,
            "by_event_type": by_event,
        }

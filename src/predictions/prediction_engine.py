"""Generate YES/NO predictions with probability estimates for matched markets."""

import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class PredictionEngine:
    """Generates probability estimates for prediction markets using OutlierQ signals.

    Strategy:
    - Uses event classification direction + confidence as the base signal
    - Adjusts based on event type historical accuracy (from FeedbackTracker)
    - Compares bot's estimate to market price to find "edge"
    - Only recommends when edge exceeds threshold
    """

    def __init__(
        self,
        min_edge: float = 0.05,
        min_confidence: float = 0.4,
    ):
        self.min_edge = min_edge
        self.min_confidence = min_confidence

    def generate_predictions(
        self,
        matches: list[dict],
        accuracy_stats: dict | None = None,
    ) -> list[dict]:
        """Generate predictions for matched markets.

        Args:
            matches: Output of MarketMatcher.match_events_to_markets()
            accuracy_stats: Optional dict from FeedbackTracker.get_accuracy_stats()
                used to weight predictions by historical event-type accuracy.

        Returns:
            List of prediction dicts ready for storage:
            {
                "market_id", "platform", "question",
                "predicted_outcome", "predicted_probability",
                "market_probability", "edge", "confidence",
                "matched_event_type", "matched_tickers", "match_method",
            }
        """
        predictions = []

        for match in matches:
            market = match["market"]
            event = match["event"]
            match_score = match["match_score"]
            match_method = match["match_method"]

            # Base probability from event direction + confidence
            event_direction = event.get("direction", "neutral")
            event_confidence = event.get("confidence", 0.5)

            # Map OutlierQ direction to YES probability
            # "bullish" events -> higher YES probability (market goes up / event happens)
            # "bearish" events -> lower YES probability
            if event_direction == "bullish":
                base_prob = 0.5 + (event_confidence * 0.4)  # range: 0.5-0.9
            elif event_direction == "bearish":
                base_prob = 0.5 - (event_confidence * 0.4)  # range: 0.1-0.5
            else:
                base_prob = 0.5

            # Adjust by match quality
            adjusted_prob = base_prob * (0.7 + 0.3 * match_score)

            # Adjust by historical event-type accuracy if available
            if accuracy_stats and accuracy_stats.get("by_event_type"):
                et_stats = accuracy_stats["by_event_type"].get(event.get("event_type", ""))
                if et_stats and et_stats.get("count", 0) >= 5:
                    historical_wr = et_stats.get("win_rate", 0.5)
                    # Blend: 70% signal, 30% historical calibration
                    adjusted_prob = adjusted_prob * 0.7 + historical_wr * 0.3

            # Clamp
            adjusted_prob = max(0.05, min(0.95, adjusted_prob))

            # Compute edge vs market
            market_yes = market.get("yes_price", 0.5)
            edge = adjusted_prob - market_yes

            # Determine recommendation
            if abs(edge) < self.min_edge:
                continue  # No meaningful edge, skip

            predicted_outcome = "yes" if edge > 0 else "no"
            confidence = min(abs(edge) * 2, 1.0) * match_score  # scale by match quality

            if confidence < self.min_confidence:
                continue

            predictions.append({
                "market_id": market["market_id"],
                "platform": market["platform"],
                "question": market["question"],
                "predicted_outcome": predicted_outcome,
                "predicted_probability": round(adjusted_prob, 4),
                "market_probability": round(market_yes, 4),
                "edge": round(edge, 4),
                "confidence": round(confidence, 4),
                "matched_event_type": event.get("event_type", "unknown"),
                "matched_tickers": event.get("ticker", ""),
                "match_method": match_method,
            })

        # Sort by absolute edge (best opportunities first)
        predictions.sort(key=lambda p: abs(p["edge"]), reverse=True)
        logger.info("Generated %d predictions with edge >= %.2f", len(predictions), self.min_edge)
        return predictions

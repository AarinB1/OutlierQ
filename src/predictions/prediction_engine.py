"""Generate YES/NO predictions with probability estimates for matched markets."""

import logging
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.predictions.prediction_simulator import PredictionSimResult

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

    @staticmethod
    def apply_simulation_adjustment(
        prediction: dict,
        sim_result: "PredictionSimResult",
    ) -> dict:
        """Blend the bot's probability estimate with MiroFish simulation output.

        Unlike the options pipeline which just adjusts confidence, here we
        blend actual probability estimates because prediction markets care
        about calibrated probabilities, not just direction.

        Blending strategy:
        - Weight: 60% bot estimate, 40% simulation estimate
        - Scale simulation weight by consensus_strength (weak consensus -> less influence)
        - Recalculate edge and predicted_outcome after blending
        - Flag as simulation_enhanced
        """
        adjusted = dict(prediction)

        sim_prob = sim_result.estimated_probability
        consensus = sim_result.consensus_strength
        bot_prob = adjusted["predicted_probability"]
        market_prob = adjusted["market_probability"]

        # Scale simulation influence by consensus strength
        # High consensus (0.85) -> sim gets ~34% weight (0.4 * 0.85)
        # Low consensus (0.35) -> sim gets ~14% weight (0.4 * 0.35)
        sim_weight = 0.4 * consensus
        bot_weight = 1.0 - sim_weight

        blended_prob = bot_weight * bot_prob + sim_weight * sim_prob
        blended_prob = max(0.05, min(0.95, blended_prob))

        # Recalculate edge
        new_edge = blended_prob - market_prob

        # Recalculate outcome and confidence
        predicted_outcome = "yes" if new_edge > 0 else "no"
        new_confidence = min(abs(new_edge) * 2, 1.0)

        adjusted["predicted_probability"] = round(blended_prob, 4)
        adjusted["edge"] = round(new_edge, 4)
        adjusted["predicted_outcome"] = predicted_outcome
        adjusted["confidence"] = round(new_confidence, 4)

        # Simulation metadata
        adjusted["simulation_enhanced"] = True
        adjusted["sim_estimated_probability"] = round(sim_prob, 4)
        adjusted["sim_consensus_strength"] = round(consensus, 4)
        adjusted["sim_yes_pct"] = sim_result.yes_pct
        adjusted["sim_narrative"] = sim_result.key_factors[:500] if sim_result.key_factors else None

        return adjusted

    def generate_predictions(
        self,
        matches: list[dict],
        accuracy_stats: dict | None = None,
        simulation_results: dict[str, "PredictionSimResult"] | None = None,
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

            # Attenuate by match quality: a weak match carries less
            # information, so shrink the deviation from 0.5 toward 0.5.
            # (Scaling the raw probability instead pushed bearish estimates
            # FURTHER from 0.5 the weaker the match was.)
            match_factor = 0.7 + 0.3 * match_score
            adjusted_prob = 0.5 + (base_prob - 0.5) * match_factor

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

            prediction = {
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
            }

            # Apply MiroFish simulation adjustment if available
            sim_map = simulation_results or {}
            sim = sim_map.get(market["market_id"])
            if sim is not None:
                prediction = self.apply_simulation_adjustment(prediction, sim)
                # Re-check edge threshold after adjustment
                if abs(prediction["edge"]) < self.min_edge:
                    continue
                if prediction["confidence"] < self.min_confidence:
                    continue

            predictions.append(prediction)

        # Sort by absolute edge (best opportunities first)
        predictions.sort(key=lambda p: abs(p["edge"]), reverse=True)
        logger.info("Generated %d predictions with edge >= %.2f", len(predictions), self.min_edge)
        return predictions

"""Detect cross-platform arbitrage between Polymarket and Kalshi markets."""

import logging
import re
from difflib import SequenceMatcher
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# Normalized aliases to handle platform-specific phrasing
QUESTION_NORMALIZATIONS = [
    # Remove platform-specific prefixes/suffixes
    (r"^will\s+", ""),
    (r"\?$", ""),
    (r"\s+", " "),
    # Normalize common terms
    (r"federal reserve", "fed"),
    (r"interest rate", "rate"),
    (r"donald trump", "trump"),
    (r"joe biden", "biden"),
    (r"united states", "us"),
    (r"bitcoin", "btc"),
    (r"ethereum", "eth"),
    (r"s&p 500|s&p500", "sp500"),
    (r"year-over-year|yoy", "yoy"),
    (r"consumer price index", "cpi"),
    (r"gross domestic product", "gdp"),
    (r"by (end of |eoy )?(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}", r"by \2"),
    (r"in (january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}", r"in \1"),
    (r"\b20\d{2}\b", ""),  # Remove years (they often differ in phrasing but not meaning)
]


class ArbitrageDetector:
    """Find price discrepancies between Polymarket and Kalshi on matched events."""

    def __init__(
        self,
        min_spread: float = 0.03,
        min_match_score: float = 0.55,
        min_volume: float = 5000,
    ):
        """
        Args:
            min_spread: Minimum YES price difference to flag (0.03 = 3 cents / 3%).
            min_match_score: Minimum question similarity to consider a match.
            min_volume: Minimum volume on BOTH sides for the arb to be actionable.
        """
        self.min_spread = min_spread
        self.min_match_score = min_match_score
        self.min_volume = min_volume

    def detect(
        self,
        poly_markets: list[dict],
        kalshi_markets: list[dict],
    ) -> list[dict]:
        """Find arbitrage opportunities between two sets of markets.

        Args:
            poly_markets: Normalized markets from PolymarketFetcher.
            kalshi_markets: Normalized markets from KalshiFetcher.

        Returns:
            List of arbitrage opportunity dicts sorted by spread descending.
        """
        if not poly_markets or not kalshi_markets:
            logger.info("Arbitrage scan skipped: poly=%d, kalshi=%d", len(poly_markets), len(kalshi_markets))
            return []

        # Pre-normalize all questions for faster matching
        poly_normalized = [(m, self._normalize(m["question"])) for m in poly_markets]
        kalshi_normalized = [(m, self._normalize(m["question"])) for m in kalshi_markets]

        opportunities = []

        for poly_market, poly_q in poly_normalized:
            best_match = None
            best_score = 0.0
            best_method = "fuzzy"

            for kalshi_market, kalshi_q in kalshi_normalized:
                score, method = self._match_score(poly_q, kalshi_q, poly_market, kalshi_market)
                if score > best_score:
                    best_score = score
                    best_match = kalshi_market
                    best_method = method

            if best_match is None or best_score < self.min_match_score:
                continue

            # Check volume threshold on both sides
            poly_vol = poly_market.get("volume", 0)
            kalshi_vol = best_match.get("volume", 0)
            if poly_vol < self.min_volume or kalshi_vol < self.min_volume:
                continue

            # Reject arbs where one side has very thin volume (likely stale price)
            min_side_volume = min(poly_vol, kalshi_vol)
            if min_side_volume < self.min_volume * 0.5:
                continue

            # Compute spread
            poly_yes = poly_market.get("yes_price", 0.5)
            kalshi_yes = best_match.get("yes_price", 0.5)
            spread = abs(poly_yes - kalshi_yes)

            if spread < self.min_spread:
                continue

            # Skip if the spread is unusually large (likely stale/illiquid)
            if spread > 0.30:
                logger.debug(
                    "Skipping likely-stale arb: %s vs %s (spread=%.0f%%)",
                    poly_market["question"][:40], best_match["question"][:40], spread * 100,
                )
                continue

            # Direction: which side is cheaper to buy YES?
            midpoint = (poly_yes + kalshi_yes) / 2
            if poly_yes < kalshi_yes:
                direction = "buy_poly_yes"
                theoretical_profit = spread  # buy YES cheap on Poly, sell (buy NO) on Kalshi
            else:
                direction = "buy_kalshi_yes"
                theoretical_profit = spread

            spread_pct = spread / max(midpoint, 0.01)

            # Kalshi charges a trading fee of ~0.07 * P * (1-P) per contract
            # on the traded leg (Polymarket has no trading fee), so the raw
            # spread overstates the realizable edge. P*(1-P) is symmetric,
            # so the fee is the same whether the Kalshi leg is YES or NO.
            estimated_fees = 0.07 * kalshi_yes * (1.0 - kalshi_yes)
            profit_after_fees = theoretical_profit - estimated_fees

            opportunities.append({
                "poly_market_id": poly_market["market_id"],
                "poly_question": poly_market["question"],
                "poly_yes_price": poly_yes,
                "poly_volume": poly_vol,
                "kalshi_market_id": best_match["market_id"],
                "kalshi_question": best_match["question"],
                "kalshi_yes_price": kalshi_yes,
                "kalshi_volume": kalshi_vol,
                "spread": round(spread, 4),
                "spread_pct": round(spread_pct, 4),
                "direction": direction,
                "match_score": round(best_score, 4),
                "match_method": best_method,
                "theoretical_profit": round(theoretical_profit, 4),
                "estimated_fees": round(estimated_fees, 4),
                "profit_after_fees": round(profit_after_fees, 4),
                "status": "open",
            })

        # Sort by spread descending (juiciest arbs first)
        opportunities.sort(key=lambda o: o["spread"], reverse=True)
        logger.info(
            "Arbitrage scan: %d poly x %d kalshi -> %d opportunities (spread >= %.0f%%)",
            len(poly_markets), len(kalshi_markets), len(opportunities), self.min_spread * 100,
        )
        return opportunities

    def _normalize(self, question: str) -> str:
        """Normalize a market question for fuzzy matching."""
        q = question.lower().strip()
        for pattern, replacement in QUESTION_NORMALIZATIONS:
            q = re.sub(pattern, replacement, q)
        return q.strip()

    def _match_score(
        self,
        poly_q: str,
        kalshi_q: str,
        poly_market: dict,
        kalshi_market: dict,
    ) -> tuple[float, str]:
        """Score how likely two questions refer to the same event.

        Returns (score, method).
        """
        # 1. Near-exact match after normalization
        if poly_q == kalshi_q:
            return 1.0, "exact"

        # 2. One is a substring of the other (common for short Kalshi titles)
        if poly_q in kalshi_q or kalshi_q in poly_q:
            return 0.85, "substring"

        # 3. Category + key entity overlap
        # Extract potential entities (capitalized words, numbers, ticker-like strings)
        poly_entities = set(re.findall(r'\b[A-Z]{2,5}\b|\b\d+\.?\d*%?\b', poly_market["question"]))
        kalshi_entities = set(re.findall(r'\b[A-Z]{2,5}\b|\b\d+\.?\d*%?\b', kalshi_market["question"]))
        if poly_entities and kalshi_entities:
            entity_overlap = len(poly_entities & kalshi_entities) / max(len(poly_entities | kalshi_entities), 1)
            if entity_overlap >= 0.5:
                return min(0.6 + entity_overlap * 0.3, 0.9), "entity"

        # 4. Token Jaccard similarity
        poly_tokens = set(poly_q.split())
        kalshi_tokens = set(kalshi_q.split())
        if poly_tokens and kalshi_tokens:
            jaccard = len(poly_tokens & kalshi_tokens) / len(poly_tokens | kalshi_tokens)
            if jaccard >= 0.4:
                return min(0.5 + jaccard * 0.4, 0.85), "jaccard"

        # 5. SequenceMatcher fallback
        ratio = SequenceMatcher(None, poly_q, kalshi_q).ratio()
        return ratio * 0.8, "fuzzy"  # Discount fuzzy matches slightly

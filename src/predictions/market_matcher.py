"""Match OutlierQ events/signals to prediction market questions."""

import logging
import re
from difflib import SequenceMatcher
from typing import Optional

logger = logging.getLogger(__name__)

# Keywords that map OutlierQ event types to prediction market categories
EVENT_MARKET_KEYWORDS = {
    "earnings_beat": ["earnings", "revenue", "profit", "EPS", "quarterly"],
    "earnings_miss": ["earnings", "revenue", "profit", "EPS", "quarterly"],
    "fda_approval": ["FDA", "drug", "approval", "clinical trial", "pharma"],
    "fda_rejection": ["FDA", "drug", "rejection", "clinical trial"],
    "scandal": ["scandal", "investigation", "lawsuit", "fraud", "resign"],
    "merger_acquisition": ["merger", "acquisition", "acquire", "buyout", "takeover"],
    "product_launch": ["launch", "release", "unveil", "announce", "product"],
    "macro_event": ["fed", "rate", "inflation", "GDP", "employment", "tariff", "recession"],
}


class MarketMatcher:
    """Correlates OutlierQ events with prediction market questions."""

    def __init__(self, similarity_threshold: float = 0.35):
        self.similarity_threshold = similarity_threshold

    def match_events_to_markets(
        self,
        events: list[dict],
        markets: list[dict],
    ) -> list[dict]:
        """Match each event to relevant prediction markets.

        Args:
            events: List of OutlierQ event dicts with keys:
                ticker, event_type, direction, headlines, confidence
            markets: List of normalized market dicts from fetchers.

        Returns:
            List of match dicts:
            {
                "market": <market dict>,
                "event": <event dict>,
                "match_score": float,
                "match_method": "ticker" | "keyword" | "semantic",
            }
        """
        matches = []

        for event in events:
            ticker = event.get("ticker", "").upper()
            event_type = event.get("event_type", "")
            headlines = event.get("headlines", [])

            for market in markets:
                question = market.get("question", "")
                score, method = self._score_match(ticker, event_type, headlines, question)

                if score >= self.similarity_threshold:
                    matches.append({
                        "market": market,
                        "event": event,
                        "match_score": score,
                        "match_method": method,
                    })

        # Sort by match score descending, deduplicate by market_id (keep best)
        matches.sort(key=lambda m: m["match_score"], reverse=True)
        seen_markets = set()
        deduped = []
        for m in matches:
            mid = m["market"]["market_id"]
            if mid not in seen_markets:
                seen_markets.add(mid)
                deduped.append(m)

        logger.info("Matched %d events to %d unique markets", len(events), len(deduped))
        return deduped

    def _score_match(
        self,
        ticker: str,
        event_type: str,
        headlines: list[str],
        question: str,
    ) -> tuple[float, str]:
        """Score how well an event matches a market question.

        Returns (score, method) where score is 0.0-1.0.
        """
        q_upper = question.upper()
        best_score = 0.0
        best_method = "keyword"

        # 1. Direct ticker mention in question (strongest signal)
        if ticker and len(ticker) >= 2:
            # Match ticker as whole word to avoid false positives (e.g. "A" in "A recession")
            pattern = r'\b' + re.escape(ticker) + r'\b'
            if re.search(pattern, q_upper):
                best_score = 0.8
                best_method = "ticker"

        # 2. Event-type keyword overlap
        keywords = EVENT_MARKET_KEYWORDS.get(event_type, [])
        if keywords:
            q_lower = question.lower()
            keyword_hits = sum(1 for kw in keywords if kw.lower() in q_lower)
            keyword_score = min(keyword_hits / max(len(keywords), 1) * 0.6, 0.6)
            if keyword_score > best_score:
                best_score = keyword_score
                best_method = "keyword"

        # 3. Headline similarity (fuzzy)
        for headline in headlines[:5]:
            ratio = SequenceMatcher(None, headline.lower(), question.lower()).ratio()
            semantic_score = ratio * 0.7  # cap contribution
            if semantic_score > best_score:
                best_score = semantic_score
                best_method = "semantic"

        return best_score, best_method

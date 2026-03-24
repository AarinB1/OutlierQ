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

    def __init__(
        self,
        similarity_threshold: float = 0.35,
        method_thresholds: dict[str, float] | None = None,
    ):
        self.similarity_threshold = similarity_threshold
        self.method_thresholds = method_thresholds or {
            "ticker": 0.35,      # ticker mention is strong — low bar is fine
            "keyword": 0.40,     # need at least 2-3 keyword hits to be meaningful
            "semantic": 0.55,    # fuzzy matches must be substantially similar
        }

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

                method_floor = self.method_thresholds.get(method, self.similarity_threshold)
                if score >= method_floor:
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

        # 0. Ticker conflict check — if the question mentions a DIFFERENT
        #    ticker, this is almost certainly a wrong match.  Bail early.
        if ticker and len(ticker) >= 2:
            # Find all ticker-like tokens (2-5 uppercase letters) in the question
            mentioned_tickers = set(re.findall(r'\b[A-Z]{2,5}\b', q_upper))
            # Remove common English words that look like tickers
            noise = {
                "THE", "AND", "FOR", "ARE", "NOT", "BUT", "HAS", "HIS",
                "HER", "WAS", "ALL", "CAN", "HAD", "ONE", "OUR", "OUT",
                "DAY", "GET", "HIM", "HOW", "ITS", "MAY", "NEW", "NOW",
                "OLD", "SEE", "WAY", "WHO", "DID", "LET", "SAY", "SHE",
                "TOO", "USE", "YES", "NO", "WILL", "GDP", "EPS", "FDA",
                "FED", "CEO", "IPO", "SEC", "ETF", "API",
            }
            mentioned_tickers -= noise
            if mentioned_tickers and ticker not in mentioned_tickers:
                # Question explicitly mentions other tickers but NOT ours
                return 0.0, "conflict"

        # 1. Direct ticker mention in question (strongest signal)
        if ticker and len(ticker) >= 2:
            # Match ticker as whole word to avoid false positives (e.g. "A" in "A recession")
            pattern = r'\b' + re.escape(ticker) + r'\b'
            if re.search(pattern, q_upper):
                best_score = 0.8
                best_method = "ticker"

        # 2. Event-type keyword overlap (require >= 2 hits for a meaningful match)
        keywords = EVENT_MARKET_KEYWORDS.get(event_type, [])
        if keywords:
            q_lower = question.lower()
            keyword_hits = sum(1 for kw in keywords if kw.lower() in q_lower)
            if keyword_hits >= 2:
                keyword_score = min(keyword_hits / max(len(keywords), 1) * 0.6, 0.6)
                if keyword_score > best_score:
                    best_score = keyword_score
                    best_method = "keyword"

        # 3. Headline similarity (fuzzy) — limit to top 3 headlines,
        #    require ratio >= 0.5 before scoring to avoid noise matches
        for headline in headlines[:3]:
            ratio = SequenceMatcher(None, headline.lower(), question.lower()).ratio()
            if ratio < 0.5:
                continue  # below noise floor
            semantic_score = ratio * 0.7  # cap contribution
            if semantic_score > best_score:
                best_score = semantic_score
                best_method = "semantic"

        return best_score, best_method

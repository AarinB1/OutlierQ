"""Fetch active markets from Polymarket's Gamma API (public, no auth needed for reads)."""

import json
import logging
import requests
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

GAMMA_API = "https://gamma-api.polymarket.com"


class PolymarketFetcher:
    """Pulls active markets from Polymarket's public Gamma API."""

    def __init__(self, base_url: str = GAMMA_API):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json"})

    def fetch_active_markets(
        self,
        limit: int = 100,
        category: Optional[str] = None,
        min_volume: float = 10_000,
    ) -> list[dict]:
        """Fetch active markets sorted by volume.

        Returns list of normalized market dicts:
        {
            "platform": "polymarket",
            "market_id": <condition_id>,
            "slug": <slug>,
            "question": <question text>,
            "category": <category>,
            "yes_price": <float 0-1>,
            "no_price": <float 0-1>,
            "volume": <float>,
            "resolution_date": <datetime or None>,
            "status": "open",
        }
        """
        params = {
            "limit": limit,
            "active": True,
            "closed": False,
            "order": "volume",
            "ascending": False,
        }
        if category:
            params["tag"] = category

        try:
            resp = self.session.get(f"{self.base_url}/markets", params=params, timeout=15)
            resp.raise_for_status()
            raw_markets = resp.json()
        except Exception:
            logger.exception("Failed to fetch Polymarket markets")
            return []

        markets = []
        for m in raw_markets:
            vol = float(m.get("volume", 0) or 0)
            if vol < min_volume:
                continue

            # Polymarket returns outcomePrices as a JSON string like "[0.73, 0.27]"
            outcome_prices = m.get("outcomePrices")
            yes_price, no_price = 0.5, 0.5
            if outcome_prices:
                try:
                    prices = json.loads(outcome_prices) if isinstance(outcome_prices, str) else outcome_prices
                    yes_price = float(prices[0])
                    no_price = float(prices[1])
                except (ValueError, IndexError, TypeError):
                    pass

            end_date = None
            if m.get("endDate"):
                try:
                    end_date = datetime.fromisoformat(m["endDate"].replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass

            markets.append({
                "platform": "polymarket",
                "market_id": m.get("conditionId", m.get("id", "")),
                "slug": m.get("slug", ""),
                "question": m.get("question", ""),
                "category": m.get("groupItemTitle", m.get("category", "")),
                "yes_price": yes_price,
                "no_price": no_price,
                "volume": vol,
                "resolution_date": end_date,
                "status": "open",
            })

        logger.info("Fetched %d active Polymarket markets (min_volume=%.0f)", len(markets), min_volume)
        return markets

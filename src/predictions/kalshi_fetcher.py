"""Fetch active markets from Kalshi's public REST API v2."""

import logging
import requests
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2"
KALSHI_DEMO_API = "https://demo-api.kalshi.co/trade-api/v2"


class KalshiFetcher:
    """Pulls active markets from Kalshi's public market endpoints (no auth for reads)."""

    def __init__(self, base_url: str = KALSHI_API, demo: bool = False):
        self.base_url = KALSHI_DEMO_API if demo else base_url
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json"})

    def fetch_active_markets(
        self,
        limit: int = 100,
        status: str = "open",
        min_volume: int = 1000,
    ) -> list[dict]:
        """Fetch active Kalshi markets.

        Returns list of normalized market dicts (same shape as PolymarketFetcher).
        Note: Kalshi prices are in cents (0-100), we normalize to 0.0-1.0.
        """
        params = {
            "limit": min(limit, 200),
            "status": status,
        }

        try:
            resp = self.session.get(f"{self.base_url}/markets", params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            raw_markets = data.get("markets", [])
        except Exception:
            logger.exception("Failed to fetch Kalshi markets")
            return []

        markets = []
        for m in raw_markets:
            vol = int(m.get("volume", 0) or 0)
            if vol < min_volume:
                continue

            # Kalshi yes_price and no_price are in cents
            yes_price = (m.get("yes_ask", 50) or 50) / 100.0
            no_price = 1.0 - yes_price

            close_time = None
            if m.get("close_time"):
                try:
                    close_time = datetime.fromisoformat(m["close_time"].replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass

            markets.append({
                "platform": "kalshi",
                "market_id": m.get("ticker", ""),
                "slug": m.get("ticker", ""),
                "question": m.get("title", ""),
                "category": m.get("category", m.get("series_ticker", "")),
                "yes_price": yes_price,
                "no_price": no_price,
                "volume": float(vol),
                "resolution_date": close_time,
                "status": "open",
            })

        logger.info("Fetched %d active Kalshi markets (min_volume=%d)", len(markets), min_volume)
        return markets

"""Fetch active markets from Polymarket's Gamma API (public, no auth needed for reads)."""

import json
import logging
import time
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
        self.session.headers.update({
            "Accept": "application/json",
            "User-Agent": "OutlierQ/1.0 (prediction-market-bot)",
        })

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
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 429:
                logger.warning("Polymarket rate limited, backing off")
                time.sleep(2)
            logger.exception("Failed to fetch Polymarket markets")
            return []
        except Exception:
            logger.exception("Failed to fetch Polymarket markets")
            return []

        markets = []
        for m in raw_markets:
            # Volume: prefer volumeNum (float), fall back to parsing volume (string)
            vol = m.get("volumeNum")
            if vol is None:
                try:
                    vol = float(m.get("volume", 0) or 0)
                except (ValueError, TypeError):
                    vol = 0.0
            vol = float(vol)

            if vol < min_volume:
                continue

            # outcomePrices: JSON string of string numbers -> list of floats
            # e.g. '["0.65", "0.35"]' -> [0.65, 0.35]
            yes_price, no_price = 0.5, 0.5
            outcome_prices = m.get("outcomePrices")
            if outcome_prices:
                try:
                    prices = json.loads(outcome_prices) if isinstance(outcome_prices, str) else outcome_prices
                    # Each element may be a string ("0.65") or a float (0.65)
                    yes_price = float(prices[0]) if prices else 0.5
                    no_price = float(prices[1]) if len(prices) > 1 else (1.0 - yes_price)
                except (ValueError, IndexError, TypeError, json.JSONDecodeError):
                    # Fall back to bestBid/bestAsk or lastTradePrice
                    best_bid = m.get("bestBid")
                    best_ask = m.get("bestAsk")
                    last_trade = m.get("lastTradePrice")
                    if best_bid is not None and best_ask is not None:
                        yes_price = (float(best_bid) + float(best_ask)) / 2
                        no_price = 1.0 - yes_price
                    elif last_trade is not None:
                        yes_price = float(last_trade)
                        no_price = 1.0 - yes_price

            # Clamp prices to valid range
            yes_price = max(0.01, min(0.99, yes_price))
            no_price = max(0.01, min(0.99, no_price))

            # End date
            end_date = None
            end_date_raw = m.get("endDate")
            if end_date_raw and isinstance(end_date_raw, str):
                try:
                    end_date = datetime.fromisoformat(end_date_raw.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass

            # Extract CLOB token IDs for order placement
            clob_token_ids = m.get("clobTokenIds", [])
            if isinstance(clob_token_ids, str):
                try:
                    clob_token_ids = json.loads(clob_token_ids)
                except (json.JSONDecodeError, TypeError):
                    clob_token_ids = []

            market_dict = {
                "platform": "polymarket",
                "market_id": m.get("conditionId") or m.get("id", ""),
                "slug": m.get("slug", ""),
                "question": m.get("question", ""),
                "category": m.get("category", ""),
                "yes_price": yes_price,
                "no_price": no_price,
                "volume": vol,
                "resolution_date": end_date,
                "status": "open",
            }

            # Add token IDs if available (needed for order placement)
            if clob_token_ids:
                market_dict["token_ids"] = clob_token_ids
                # First token is YES, second is NO
                if len(clob_token_ids) >= 1:
                    market_dict["token_id"] = clob_token_ids[0]

            markets.append(market_dict)

        logger.info("Fetched %d active Polymarket markets (min_volume=%.0f)", len(markets), min_volume)
        return markets

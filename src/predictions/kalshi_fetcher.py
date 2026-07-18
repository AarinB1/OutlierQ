"""Fetch active markets from Kalshi's public REST API v2."""

import logging
import time
import requests
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2"
KALSHI_DEMO_API = "https://demo-api.kalshi.co/trade-api/v2"


def _safe_float(value) -> float | None:
    """Safely parse a value that may be a string, float, int, or None."""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


class KalshiFetcher:
    """Pulls active markets from Kalshi's public market endpoints (no auth for reads)."""

    def __init__(self, base_url: str = KALSHI_API, demo: bool = False):
        self.base_url = KALSHI_DEMO_API if demo else base_url
        self.session = requests.Session()
        self.session.headers.update({
            "Accept": "application/json",
            "User-Agent": "OutlierQ/1.0 (prediction-market-bot)",
        })

    def fetch_active_markets(
        self,
        limit: int = 100,
        status: str = "open",
        min_volume: int = 1000,
    ) -> list[dict]:
        """Fetch active Kalshi markets with cursor-based pagination.

        Returns list of normalized market dicts (same shape as PolymarketFetcher).
        Note: Kalshi prices (yes_bid_dollars, yes_ask_dollars, etc.) are already
        in dollars (e.g. "0.56" = 56 cents), NOT in cents.
        """
        all_markets: list[dict] = []
        cursor: str | None = None
        fetched = 0
        rate_limit_retries = 0
        max_per_page = min(limit, 200)  # Kalshi max is 200 per page

        while fetched < limit:
            params: dict = {
                "limit": max_per_page,
                "status": status,
            }
            if cursor:
                params["cursor"] = cursor

            try:
                resp = self.session.get(f"{self.base_url}/markets", params=params, timeout=15)
                resp.raise_for_status()
                data = resp.json()
            except requests.exceptions.HTTPError as e:
                if e.response is not None and e.response.status_code == 429:
                    rate_limit_retries += 1
                    if rate_limit_retries > 3:
                        logger.warning("Kalshi rate limit persisted after 3 retries — giving up")
                        break
                    logger.warning("Kalshi rate limited, backing off (retry %d/3)", rate_limit_retries)
                    time.sleep(rate_limit_retries)
                    continue
                logger.exception("Failed to fetch Kalshi markets")
                break
            except Exception:
                logger.exception("Failed to fetch Kalshi markets")
                break

            rate_limit_retries = 0
            raw_markets = data.get("markets", [])
            if not raw_markets:
                break

            for m in raw_markets:
                # Volume: volume_fp is a fixed-point STRING; older payloads
                # carry an integer contract count under "volume" instead.
                vol = _safe_float(m.get("volume_fp"))
                if vol is None:
                    vol = _safe_float(m.get("volume")) or 0.0

                if vol < min_volume:
                    continue

                # Prices: yes_bid_dollars / yes_ask_dollars are STRINGS in DOLLARS
                # e.g. "0.56" means 56 cents. NO division by 100 needed.
                yes_bid = _safe_float(m.get("yes_bid_dollars"))
                yes_ask = _safe_float(m.get("yes_ask_dollars"))
                last_price = _safe_float(m.get("last_price_dollars"))

                # Best estimate of YES price: midpoint of bid/ask, or last trade
                if yes_bid is not None and yes_ask is not None:
                    yes_price = (yes_bid + yes_ask) / 2
                elif last_price is not None:
                    yes_price = last_price
                elif yes_bid is not None:
                    yes_price = yes_bid
                elif yes_ask is not None:
                    yes_price = yes_ask
                else:
                    yes_price = 0.5

                # Clamp
                yes_price = max(0.01, min(0.99, yes_price))
                no_price = 1.0 - yes_price

                # Close time
                close_time = None
                close_raw = m.get("close_time")
                if close_raw and isinstance(close_raw, str):
                    try:
                        close_time = datetime.fromisoformat(close_raw.replace("Z", "+00:00"))
                    except (ValueError, TypeError):
                        pass

                all_markets.append({
                    "platform": "kalshi",
                    "market_id": m.get("ticker", ""),
                    "slug": m.get("ticker", ""),
                    "question": m.get("title", m.get("ticker", "")),
                    "category": m.get("category", m.get("series_ticker", "")),
                    "yes_price": yes_price,
                    "no_price": no_price,
                    "volume": vol,
                    "resolution_date": close_time,
                    "status": m.get("status", "open"),
                })

            fetched += len(raw_markets)

            # Pagination: check for cursor
            next_cursor = data.get("cursor", "")
            if not next_cursor or next_cursor == cursor:
                break
            cursor = next_cursor

            # Rate limit safety
            time.sleep(0.15)

        logger.info("Fetched %d active Kalshi markets (min_volume=%d)", len(all_markets), min_volume)
        return all_markets[:limit]

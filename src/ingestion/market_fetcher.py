"""Yahoo Finance market data ingestion with caching."""

import logging
import time
from datetime import date, datetime

import pandas as pd
import yfinance as yf

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

CACHE_TTL = 300  # 5 minutes


class MarketFetcher:
    """Fetches price history and options chain data via yfinance."""

    def __init__(self) -> None:
        self._price_cache: dict[str, tuple[float, float]] = {}  # ticker -> (price, ts)
        self._history_cache: dict[str, tuple[pd.DataFrame, float]] = {}
        self._options_cache: dict[str, tuple[dict, float]] = {}

    # ── Price history ─────────────────────────────────────────────────

    def fetch_price_history(
        self,
        ticker: str,
        period: str = "1mo",
        start: date | None = None,
        end: date | None = None,
    ) -> pd.DataFrame:
        """Return OHLCV price history for *ticker*.

        When *start* (and optionally *end*) is given, fetches that explicit
        date range instead of a trailing period — needed to evaluate signals
        older than any trailing window.
        """
        if start is not None:
            cache_key = f"{ticker}_{start.isoformat()}_{end.isoformat() if end else 'now'}"
        else:
            cache_key = f"{ticker}_{period}"
        cached = self._history_cache.get(cache_key)
        if cached and (time.time() - cached[1]) < CACHE_TTL:
            logger.debug("Cache hit for price history: %s", cache_key)
            return cached[0]

        stock = yf.Ticker(ticker)
        if start is not None:
            logger.info("Fetching price history for %s (%s to %s)", ticker, start, end or "now")
            df = stock.history(start=start.isoformat(), end=end.isoformat() if end else None)
        else:
            logger.info("Fetching price history for %s (period=%s)", ticker, period)
            df = stock.history(period=period)
        self._history_cache[cache_key] = (df, time.time())
        return df

    # ── Options chain ─────────────────────────────────────────────────

    def fetch_options_chain(self, ticker: str, target_expiry: str | None = None) -> dict:
        """Pull the options chain closest to *target_expiry* (YYYY-MM-DD).

        Defaults to the nearest expiration when no target is given.
        Returns dict with 'calls'/'puts' DataFrames and the resolved 'expiry'.
        """
        cache_key = f"{ticker}_{target_expiry or 'nearest'}"
        cached = self._options_cache.get(cache_key)
        if cached and (time.time() - cached[1]) < CACHE_TTL:
            logger.debug("Cache hit for options chain: %s", cache_key)
            return cached[0]

        logger.info("Fetching options chain for %s (target expiry=%s)", ticker, target_expiry)
        stock = yf.Ticker(ticker)
        expiration_dates = stock.options
        if not expiration_dates:
            logger.warning("No options data available for %s", ticker)
            return {"calls": pd.DataFrame(), "puts": pd.DataFrame(), "expiry": None}

        chosen = expiration_dates[0]
        if target_expiry:
            try:
                target = datetime.strptime(target_expiry, "%Y-%m-%d").date()
                chosen = min(
                    expiration_dates,
                    key=lambda e: abs((datetime.strptime(e, "%Y-%m-%d").date() - target).days),
                )
            except ValueError:
                pass  # unparsable target — keep nearest expiration

        chain = stock.option_chain(chosen)
        result = {"calls": chain.calls, "puts": chain.puts, "expiry": chosen}
        self._options_cache[cache_key] = (result, time.time())
        return result

    # ── Current price ─────────────────────────────────────────────────

    def get_current_price(self, ticker: str) -> float:
        """Return the latest market price for *ticker*."""
        cached = self._price_cache.get(ticker)
        if cached and (time.time() - cached[1]) < CACHE_TTL:
            logger.debug("Cache hit for price: %s", ticker)
            return cached[0]

        logger.info("Fetching current price for %s", ticker)
        stock = yf.Ticker(ticker)
        hist = stock.history(period="1d")
        if hist.empty:
            raise ValueError(f"No price data available for {ticker}")

        price = float(hist["Close"].iloc[-1])
        self._price_cache[ticker] = (price, time.time())
        return price

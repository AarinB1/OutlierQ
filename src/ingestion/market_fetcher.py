"""Yahoo Finance market data ingestion with caching."""

import logging
import time

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
        self, ticker: str, period: str = "1mo"
    ) -> pd.DataFrame:
        """Return OHLCV price history for *ticker*."""
        cache_key = f"{ticker}_{period}"
        cached = self._history_cache.get(cache_key)
        if cached and (time.time() - cached[1]) < CACHE_TTL:
            logger.debug("Cache hit for price history: %s", cache_key)
            return cached[0]

        logger.info("Fetching price history for %s (period=%s)", ticker, period)
        stock = yf.Ticker(ticker)
        df = stock.history(period=period)
        self._history_cache[cache_key] = (df, time.time())
        return df

    # ── Options chain ─────────────────────────────────────────────────

    def fetch_options_chain(self, ticker: str) -> dict:
        """Pull current options chain. Returns dict with 'calls' and 'puts' DataFrames."""
        cached = self._options_cache.get(ticker)
        if cached and (time.time() - cached[1]) < CACHE_TTL:
            logger.debug("Cache hit for options chain: %s", ticker)
            return cached[0]

        logger.info("Fetching options chain for %s", ticker)
        stock = yf.Ticker(ticker)
        expiration_dates = stock.options
        if not expiration_dates:
            logger.warning("No options data available for %s", ticker)
            return {"calls": pd.DataFrame(), "puts": pd.DataFrame()}

        # Use the nearest expiration date
        chain = stock.option_chain(expiration_dates[0])
        result = {"calls": chain.calls, "puts": chain.puts}
        self._options_cache[ticker] = (result, time.time())
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

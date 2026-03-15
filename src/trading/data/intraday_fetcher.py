"""Intraday (5-minute) data fetcher for day-trading features.

yfinance supports up to 60 days of 5-minute data. Polygon.io integration
is behind POLYGON_API_KEY feature flag for extended history.
"""

import logging
import os
import time

import pandas as pd
import yfinance as yf

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

CACHE_TTL = 300
POLYGON_API_KEY = os.getenv("POLYGON_API_KEY", "")


class IntradayFetcher:
    """Fetches 5-minute OHLCV bars for intraday trading."""

    def __init__(self) -> None:
        self._cache: dict[str, tuple[pd.DataFrame, float]] = {}

    def fetch(
        self,
        ticker: str,
        period: str = "60d",
        interval: str = "5m",
    ) -> pd.DataFrame:
        """Return intraday OHLCV DataFrame with standardized columns.

        Default: 5-minute bars for last 60 trading days.
        """
        cache_key = f"{ticker}_{period}_{interval}"
        cached = self._cache.get(cache_key)
        if cached and (time.time() - cached[1]) < CACHE_TTL:
            return cached[0]

        logger.info(
            "Fetching intraday data for %s (period=%s, interval=%s)",
            ticker, period, interval,
        )

        if POLYGON_API_KEY:
            df = self._fetch_polygon(ticker, period, interval)
        else:
            df = self._fetch_yfinance(ticker, period, interval)

        if df.empty:
            logger.warning("No intraday data returned for %s", ticker)
            return pd.DataFrame()

        self._cache[cache_key] = (df, time.time())
        logger.info("Fetched %d intraday bars for %s", len(df), ticker)
        return df

    def _fetch_yfinance(
        self, ticker: str, period: str, interval: str
    ) -> pd.DataFrame:
        stock = yf.Ticker(ticker)
        df = stock.history(period=period, interval=interval)
        if df.empty:
            return pd.DataFrame()

        df = df.rename(columns={
            "Open": "open",
            "High": "high",
            "Low": "low",
            "Close": "close",
            "Volume": "volume",
        })
        df = df[["open", "high", "low", "close", "volume"]]
        df.index.name = "datetime"
        return df

    def _fetch_polygon(
        self, ticker: str, period: str, interval: str
    ) -> pd.DataFrame:
        """Polygon.io fetch (stub — requires POLYGON_API_KEY)."""
        logger.info("Polygon.io fetch not yet implemented, falling back to yfinance")
        return self._fetch_yfinance(ticker, period, interval)

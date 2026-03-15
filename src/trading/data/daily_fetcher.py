"""Daily OHLCV data fetcher extending MarketFetcher for trading use."""

import logging
import time

import pandas as pd
import yfinance as yf

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

CACHE_TTL = 300


class DailyFetcher:
    """Fetches and caches daily OHLCV data for trading models."""

    def __init__(self) -> None:
        self._cache: dict[str, tuple[pd.DataFrame, float]] = {}

    def fetch(
        self,
        ticker: str,
        period: str = "1y",
    ) -> pd.DataFrame:
        """Return daily OHLCV DataFrame with standardized column names.

        Columns: date (index), open, high, low, close, volume, adj_close
        """
        cache_key = f"{ticker}_{period}"
        cached = self._cache.get(cache_key)
        if cached and (time.time() - cached[1]) < CACHE_TTL:
            return cached[0]

        logger.info("Fetching daily data for %s (period=%s)", ticker, period)
        stock = yf.Ticker(ticker)
        df = stock.history(period=period, interval="1d")

        if df.empty:
            logger.warning("No daily data returned for %s", ticker)
            return pd.DataFrame()

        df = df.rename(columns={
            "Open": "open",
            "High": "high",
            "Low": "low",
            "Close": "close",
            "Volume": "volume",
        })

        if "Adj Close" in df.columns:
            df = df.rename(columns={"Adj Close": "adj_close"})
        else:
            df["adj_close"] = df["close"]

        df = df[["open", "high", "low", "close", "volume", "adj_close"]]
        df.index.name = "date"

        self._cache[cache_key] = (df, time.time())
        logger.info("Fetched %d daily bars for %s", len(df), ticker)
        return df

    def fetch_multiple(
        self,
        tickers: list[str],
        period: str = "1y",
    ) -> dict[str, pd.DataFrame]:
        """Fetch daily data for multiple tickers."""
        return {t: self.fetch(t, period) for t in tickers}

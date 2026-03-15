"""Feature pipeline orchestrator that combines all feature modules into a single aligned DataFrame."""

from __future__ import annotations

import logging
import time

import pandas as pd

from config.settings import LOG_FORMAT
from src.trading.data.daily_fetcher import DailyFetcher
from src.trading.features.calendar_features import compute_calendar_features
from src.trading.features.regime_features import compute_regime_features
from src.trading.features.sentiment_features import compute_sentiment_features
from src.trading.features.technical_features import compute_technical_features
from src.trading.features.volume_features import compute_volume_features

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

CACHE_TTL = 300


class FeaturePipeline:
    """Orchestrates feature extraction across all modules.

    Calls each feature module, concatenates results into a single
    NaN-free DataFrame suitable for model input.
    """

    def __init__(self, daily_fetcher: DailyFetcher | None = None) -> None:
        self.daily_fetcher = daily_fetcher or DailyFetcher()
        self._cache: dict[str, tuple[pd.DataFrame, float]] = {}

    def build_features(
        self,
        ticker: str,
        period: str = "1y",
        include_sentiment: bool = True,
        include_regime: bool = True,
    ) -> pd.DataFrame:
        """Build a complete feature DataFrame for the given ticker.

        Returns a DataFrame with no NaN values, ready for model consumption.
        """
        cache_key = f"{ticker}_{period}_{include_sentiment}_{include_regime}"
        cached = self._cache.get(cache_key)
        if cached and (time.time() - cached[1]) < CACHE_TTL:
            return cached[0]

        start = time.perf_counter()
        logger.info("Building features for %s (period=%s)", ticker, period)

        # 1. Fetch raw OHLCV
        df = self.daily_fetcher.fetch(ticker, period=period)
        if df.empty:
            logger.warning("No data for %s, returning empty DataFrame", ticker)
            return pd.DataFrame()

        # 2. Technical indicators
        df = compute_technical_features(df)

        # 3. Volume features
        df = compute_volume_features(df)

        # 4. Calendar features
        df = compute_calendar_features(df)

        # 5. Market regime features
        if include_regime:
            df = compute_regime_features(df, period=period)

        # 6. Sentiment features
        if include_sentiment:
            try:
                sent_df = compute_sentiment_features(ticker, df.index)
                for col in sent_df.columns:
                    df[col] = sent_df[col].values
            except Exception as e:
                logger.warning("Sentiment features failed for %s: %s", ticker, e)
                df["sentiment_mean_24h"] = 0.0
                df["sentiment_std_24h"] = 0.0
                df["sentiment_velocity"] = 0.0
                df["sentiment_zscore"] = 0.0
                df["article_count_24h"] = 0
                df["extreme_sentiment_ratio"] = 0.0

        # 7. Clean up: forward-fill then drop remaining NaN rows
        df = df.ffill()
        initial_len = len(df)
        df = df.dropna()
        dropped = initial_len - len(df)
        if dropped > 0:
            logger.info("Dropped %d rows with NaN values (of %d)", dropped, initial_len)

        elapsed = time.perf_counter() - start
        logger.info(
            "Feature pipeline complete for %s: %d rows, %d features in %.2fs",
            ticker, len(df), len(df.columns), elapsed,
        )

        self._cache[cache_key] = (df, time.time())
        return df

    def build_features_from_df(
        self,
        df: pd.DataFrame,
        ticker: str = "",
        include_sentiment: bool = False,
        include_regime: bool = False,
    ) -> pd.DataFrame:
        """Build features from a pre-loaded DataFrame (useful for backtesting)."""
        df = compute_technical_features(df)
        df = compute_volume_features(df)
        df = compute_calendar_features(df)

        if include_regime:
            df = compute_regime_features(df)
        if include_sentiment and ticker:
            try:
                sent_df = compute_sentiment_features(ticker, df.index)
                for col in sent_df.columns:
                    df[col] = sent_df[col].values
            except Exception:
                pass

        df = df.ffill()
        df = df.dropna()
        return df

    def get_feature_names(self, ticker: str, period: str = "1y") -> list[str]:
        """Return the list of feature column names."""
        df = self.build_features(ticker, period)
        return list(df.columns)

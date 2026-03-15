"""Technical indicator computations for signal context and confidence calibration."""

from __future__ import annotations

import logging
import time
from typing import Any

import numpy as np
import pandas as pd

from config.settings import LOG_FORMAT
from src.ingestion.market_fetcher import MarketFetcher

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_CACHE_TTL_SECONDS = 300


class TechnicalAnalyzer:
    """Computes RSI, Bollinger Bands, ATR, MACD, and volume-based indicators."""

    def __init__(self, market_fetcher: MarketFetcher) -> None:
        self.market_fetcher = market_fetcher
        self._cache: dict[str, tuple[dict[str, Any] | None, float]] = {}

    def compute_rsi(self, prices: pd.Series, period: int = 14) -> pd.Series:
        """Compute RSI using exponential moving averages for gains/losses."""
        delta = prices.diff()
        gains = delta.clip(lower=0.0)
        losses = (-delta).clip(lower=0.0)

        avg_gain = gains.ewm(span=period, adjust=False).mean()
        avg_loss = losses.ewm(span=period, adjust=False).mean()

        rs = avg_gain / avg_loss.replace(0, np.nan)
        rsi = 100 - (100 / (1 + rs))

        # Explicit edge handling for all-up / all-down / flat sequences.
        rsi = rsi.mask((avg_loss == 0) & (avg_gain > 0), 100.0)
        rsi = rsi.mask((avg_gain == 0) & (avg_loss > 0), 0.0)
        rsi = rsi.mask((avg_gain == 0) & (avg_loss == 0), 50.0)
        return rsi.clip(lower=0.0, upper=100.0)

    def compute_bollinger_bands(
        self,
        prices: pd.Series,
        period: int = 20,
        num_std: float = 2.0,
    ) -> dict[str, pd.Series]:
        """Compute Bollinger middle/upper/lower bands plus %B and bandwidth."""
        middle = prices.rolling(period).mean()
        std = prices.rolling(period).std()
        upper = middle + (num_std * std)
        lower = middle - (num_std * std)
        bandwidth = (upper - lower) / middle.replace(0, np.nan)
        pct_b = (prices - lower) / (upper - lower).replace(0, np.nan)
        return {
            "middle": middle,
            "upper": upper,
            "lower": lower,
            "bandwidth": bandwidth,
            "pct_b": pct_b,
        }

    def compute_atr(
        self,
        high: pd.Series,
        low: pd.Series,
        close: pd.Series,
        period: int = 14,
    ) -> pd.Series:
        """Compute Average True Range from OHLC price series."""
        tr1 = high - low
        prev_close = close.shift(1)
        tr2 = (high - prev_close).abs()
        tr3 = (low - prev_close).abs()
        true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        return true_range.rolling(period).mean()

    def compute_macd(
        self,
        prices: pd.Series,
        fast: int = 12,
        slow: int = 26,
        signal: int = 9,
    ) -> dict[str, pd.Series]:
        """Compute MACD line, signal line, and histogram."""
        fast_ema = prices.ewm(span=fast, adjust=False).mean()
        slow_ema = prices.ewm(span=slow, adjust=False).mean()
        macd_line = fast_ema - slow_ema
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()
        histogram = macd_line - signal_line
        return {"macd": macd_line, "signal": signal_line, "histogram": histogram}

    def compute_volume_sma(self, volume: pd.Series, period: int = 20) -> pd.Series:
        """Compute rolling average volume."""
        return volume.rolling(period).mean()

    @staticmethod
    def _latest(series: pd.Series) -> float | None:
        valid = series.dropna()
        if valid.empty:
            return None
        return float(valid.iloc[-1])

    @staticmethod
    def _pct_change(prices: pd.Series, lookback_days: int) -> float | None:
        if len(prices) <= lookback_days:
            return None
        prev = float(prices.iloc[-lookback_days - 1])
        cur = float(prices.iloc[-1])
        if prev == 0:
            return None
        return (cur / prev - 1.0) * 100.0

    def get_ticker_indicators(self, ticker: str) -> dict[str, Any] | None:
        """Fetch historical data and return latest technical indicator snapshot."""
        cached = self._cache.get(ticker.upper())
        if cached and (time.time() - cached[1]) < _CACHE_TTL_SECONDS:
            return cached[0]

        try:
            df = self.market_fetcher.fetch_price_history(ticker.upper(), period="3mo")
            if df is None or df.empty or len(df) < 30:
                self._cache[ticker.upper()] = (None, time.time())
                return None

            close = df["Close"].astype(float)
            high = df["High"].astype(float)
            low = df["Low"].astype(float)
            volume = df["Volume"].astype(float)

            rsi = self.compute_rsi(close, period=14)
            bb = self.compute_bollinger_bands(close, period=20, num_std=2.0)
            atr = self.compute_atr(high, low, close, period=14)
            macd = self.compute_macd(close, fast=12, slow=26, signal=9)
            volume_sma = self.compute_volume_sma(volume, period=20)

            current_price = float(close.iloc[-1])
            rsi_latest = self._latest(rsi)
            pct_b_latest = self._latest(bb["pct_b"])
            bandwidth_latest = self._latest(bb["bandwidth"])
            atr_latest = self._latest(atr)
            macd_latest = self._latest(macd["macd"])
            macd_signal_latest = self._latest(macd["signal"])
            macd_hist_latest = self._latest(macd["histogram"])
            vol_sma_latest = self._latest(volume_sma)
            rel_vol = None
            if vol_sma_latest and vol_sma_latest > 0:
                rel_vol = float(volume.iloc[-1]) / vol_sma_latest

            if rsi_latest is None or pct_b_latest is None or bandwidth_latest is None:
                self._cache[ticker.upper()] = (None, time.time())
                return None

            if rsi_latest > 70:
                rsi_signal = "overbought"
            elif rsi_latest < 30:
                rsi_signal = "oversold"
            else:
                rsi_signal = "neutral"

            if pct_b_latest > 1.0:
                bb_signal = "above_upper"
            elif pct_b_latest < 0.0:
                bb_signal = "below_lower"
            elif pct_b_latest > 0.5:
                bb_signal = "upper_half"
            else:
                bb_signal = "lower_half"

            macd_signal = "neutral"
            if macd_latest is not None and macd_signal_latest is not None:
                if len(macd["macd"].dropna()) >= 2 and len(macd["signal"].dropna()) >= 2:
                    prev_macd = float(macd["macd"].dropna().iloc[-2])
                    prev_sig = float(macd["signal"].dropna().iloc[-2])
                    if prev_macd <= prev_sig and macd_latest > macd_signal_latest:
                        macd_signal = "bullish_cross"
                    elif prev_macd >= prev_sig and macd_latest < macd_signal_latest:
                        macd_signal = "bearish_cross"
                    elif macd_latest > macd_signal_latest:
                        macd_signal = "bullish"
                    else:
                        macd_signal = "bearish"

            atr_pct = (atr_latest / current_price * 100.0) if atr_latest else 0.0

            result: dict[str, Any] = {
                "ticker": ticker.upper(),
                "current_price": current_price,
                "rsi_14": rsi_latest,
                "rsi_signal": rsi_signal,
                "bollinger_pct_b": pct_b_latest,
                "bollinger_bandwidth": bandwidth_latest,
                "bollinger_signal": bb_signal,
                "atr_14": atr_latest if atr_latest is not None else 0.0,
                "atr_pct": atr_pct,
                "macd_signal": macd_signal,
                "macd_histogram": macd_hist_latest if macd_hist_latest is not None else 0.0,
                "relative_volume": rel_vol if rel_vol is not None else 0.0,
                "trend_20d": self._pct_change(close, 20),
                "trend_50d": self._pct_change(close, 50),
            }

            self._cache[ticker.upper()] = (result, time.time())
            logger.info(
                "%s indicators: RSI=%.1f (%s), BB%%B=%.2f, ATR=%.1f%%, MACD=%s",
                ticker.upper(),
                result["rsi_14"],
                result["rsi_signal"],
                result["bollinger_pct_b"],
                result["atr_pct"],
                result["macd_signal"],
            )
            return result
        except Exception as exc:
            logger.warning("Failed indicator computation for %s: %s", ticker.upper(), exc)
            self._cache[ticker.upper()] = (None, time.time())
            return None

"""Extended technical indicator features for trading models.

Computes a comprehensive set of indicators and returns them as DataFrame columns.
Reuses TechnicalAnalyzer computation methods where possible.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def compute_technical_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add all technical indicator columns to an OHLCV DataFrame.

    Expects columns: open, high, low, close, volume.
    Returns a copy with new columns appended.
    """
    out = df.copy()
    close = out["close"]
    high = out["high"]
    low = out["low"]

    # --- Returns ---
    out["return_1d"] = close.pct_change(1)
    out["return_5d"] = close.pct_change(5)
    out["return_10d"] = close.pct_change(10)
    out["return_20d"] = close.pct_change(20)
    out["log_return_1d"] = np.log(close / close.shift(1))
    out["price_ratio_hl"] = high / low.replace(0, np.nan)

    # --- RSI ---
    out["rsi_14"] = _rsi(close, 14)
    out["rsi_2"] = _rsi(close, 2)

    # --- MACD ---
    fast_ema = close.ewm(span=12, adjust=False).mean()
    slow_ema = close.ewm(span=26, adjust=False).mean()
    out["macd_line"] = fast_ema - slow_ema
    out["macd_signal"] = out["macd_line"].ewm(span=9, adjust=False).mean()
    out["macd_histogram"] = out["macd_line"] - out["macd_signal"]

    # --- Bollinger Bands ---
    bb_mid = close.rolling(20).mean()
    bb_std = close.rolling(20).std()
    out["bb_upper"] = bb_mid + 2 * bb_std
    out["bb_lower"] = bb_mid - 2 * bb_std
    out["bb_pct_b"] = (close - out["bb_lower"]) / (out["bb_upper"] - out["bb_lower"]).replace(0, np.nan)
    out["bb_bandwidth"] = (out["bb_upper"] - out["bb_lower"]) / bb_mid.replace(0, np.nan)

    # --- ATR ---
    out["atr_14"] = _atr(high, low, close, 14)

    # --- ADX ---
    out["adx_14"] = _adx(high, low, close, 14)

    # --- Stochastic Oscillator ---
    lowest_14 = low.rolling(14).min()
    highest_14 = high.rolling(14).max()
    out["stoch_k"] = 100 * (close - lowest_14) / (highest_14 - lowest_14).replace(0, np.nan)
    out["stoch_d"] = out["stoch_k"].rolling(3).mean()

    # --- CCI ---
    typical_price = (high + low + close) / 3
    tp_sma = typical_price.rolling(20).mean()
    tp_mad = typical_price.rolling(20).apply(lambda x: np.abs(x - x.mean()).mean(), raw=True)
    out["cci_20"] = (typical_price - tp_sma) / (0.015 * tp_mad).replace(0, np.nan)

    # --- OBV ---
    out["obv"] = _obv(close, out["volume"])

    # --- Williams %R ---
    highest_14_wr = high.rolling(14).max()
    lowest_14_wr = low.rolling(14).min()
    out["williams_r"] = -100 * (highest_14_wr - close) / (highest_14_wr - lowest_14_wr).replace(0, np.nan)

    # --- EMAs ---
    out["ema_9"] = close.ewm(span=9, adjust=False).mean()
    out["ema_21"] = close.ewm(span=21, adjust=False).mean()
    out["ema_50"] = close.ewm(span=50, adjust=False).mean()
    out["sma_200"] = close.rolling(200).mean()

    # --- EMA alignment flags ---
    out["ema_bullish_alignment"] = (
        (out["ema_9"] > out["ema_21"]) & (out["ema_21"] > out["ema_50"])
    ).astype(float)
    out["ema_bearish_alignment"] = (
        (out["ema_9"] < out["ema_21"]) & (out["ema_21"] < out["ema_50"])
    ).astype(float)

    return out


def _rsi(prices: pd.Series, period: int) -> pd.Series:
    delta = prices.diff()
    gains = delta.clip(lower=0.0)
    losses = (-delta).clip(lower=0.0)
    avg_gain = gains.ewm(span=period, adjust=False).mean()
    avg_loss = losses.ewm(span=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    rsi = rsi.mask((avg_loss == 0) & (avg_gain > 0), 100.0)
    rsi = rsi.mask((avg_gain == 0) & (avg_loss > 0), 0.0)
    rsi = rsi.mask((avg_gain == 0) & (avg_loss == 0), 50.0)
    return rsi.clip(lower=0.0, upper=100.0)


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int) -> pd.Series:
    tr1 = high - low
    prev_close = close.shift(1)
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return true_range.rolling(period).mean()


def _adx(high: pd.Series, low: pd.Series, close: pd.Series, period: int) -> pd.Series:
    """Compute ADX (Average Directional Index)."""
    plus_dm = high.diff()
    minus_dm = -low.diff()
    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0.0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0.0)

    atr = _atr(high, low, close, period)
    plus_di = 100 * (plus_dm.rolling(period).mean() / atr.replace(0, np.nan))
    minus_di = 100 * (minus_dm.rolling(period).mean() / atr.replace(0, np.nan))

    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return dx.rolling(period).mean()


def _obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    direction = np.sign(close.diff()).fillna(0)
    return (direction * volume).cumsum()

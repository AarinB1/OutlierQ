"""Volume-based features: VWAP, relative volume, OBV, MFI, A/D line."""

from __future__ import annotations

import numpy as np
import pandas as pd


def compute_volume_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add volume-based indicator columns to an OHLCV DataFrame.

    Expects columns: open, high, low, close, volume.
    """
    out = df.copy()
    close = out["close"]
    high = out["high"]
    low = out["low"]
    volume = out["volume"]

    # --- VWAP (cumulative daily reset — for daily bars, cumulative over rolling window) ---
    typical_price = (high + low + close) / 3
    out["vwap"] = (typical_price * volume).rolling(20).sum() / volume.rolling(20).sum().replace(0, np.nan)

    # --- VWAP deviation % ---
    out["vwap_deviation_pct"] = (close - out["vwap"]) / out["vwap"].replace(0, np.nan) * 100

    # --- Relative volume (vs 20-day SMA) ---
    vol_sma_20 = volume.rolling(20).mean()
    out["relative_volume"] = volume / vol_sma_20.replace(0, np.nan)

    # --- OBV ---
    direction = np.sign(close.diff()).fillna(0)
    out["obv"] = (direction * volume).cumsum()

    # --- OBV rate of change ---
    out["obv_roc"] = out["obv"].pct_change(5)

    # --- Accumulation/Distribution Line ---
    clv = ((close - low) - (high - close)) / (high - low).replace(0, np.nan)
    clv = clv.fillna(0)
    out["ad_line"] = (clv * volume).cumsum()

    # --- Volume-Price Trend ---
    out["vpt"] = (close.pct_change().fillna(0) * volume).cumsum()

    # --- Money Flow Index (14-period) ---
    out["mfi_14"] = _mfi(high, low, close, volume, 14)

    # --- Volume SMA ratio (current volume / 20-day average) ---
    out["volume_sma_ratio"] = volume / vol_sma_20.replace(0, np.nan)

    return out


def _mfi(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    volume: pd.Series,
    period: int,
) -> pd.Series:
    """Compute Money Flow Index."""
    typical_price = (high + low + close) / 3
    raw_money_flow = typical_price * volume
    tp_diff = typical_price.diff()

    positive_flow = raw_money_flow.where(tp_diff > 0, 0.0)
    negative_flow = raw_money_flow.where(tp_diff < 0, 0.0)

    positive_sum = positive_flow.rolling(period).sum()
    negative_sum = negative_flow.rolling(period).sum()

    mfr = positive_sum / negative_sum.replace(0, np.nan)
    return 100 - (100 / (1 + mfr))

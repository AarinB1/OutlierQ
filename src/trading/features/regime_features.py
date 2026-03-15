"""Market regime detection features using VIX, SPY, and breadth indicators."""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd
import yfinance as yf

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def compute_regime_features(df: pd.DataFrame, period: str = "1y") -> pd.DataFrame:
    """Compute market regime features and append to the DataFrame.

    Fetches VIX and SPY data to determine overall market conditions.
    """
    out = df.copy()
    n = len(out)

    vix_data = _fetch_vix(period)
    spy_data = _fetch_spy(period)

    if vix_data.empty or spy_data.empty:
        logger.warning("Could not fetch VIX/SPY data, using neutral regime features")
        out["vix_level"] = 20.0
        out["vix_percentile_30d"] = 50.0
        out["vix_roc"] = 0.0
        out["regime_bull"] = 0.0
        out["regime_bear"] = 0.0
        out["regime_high_vol"] = 0.0
        out["regime_sideways"] = 1.0
        return out

    # Align VIX to our DataFrame's date index
    vix_aligned = _align_series(vix_data["close"], out.index)
    spy_aligned = _align_series(spy_data["close"], out.index)

    out["vix_level"] = vix_aligned.values
    out["vix_percentile_30d"] = vix_aligned.rolling(30).apply(
        lambda x: (x.iloc[-1] <= x).sum() / len(x) * 100 if len(x) > 0 else 50.0,
        raw=False,
    ).values
    out["vix_roc"] = vix_aligned.pct_change(5).values

    spy_ema50 = spy_aligned.ewm(span=50, adjust=False).mean()

    # ADX proxy from the target dataframe
    adx = out.get("adx_14")
    if adx is None:
        adx = pd.Series(25.0, index=out.index)

    out["regime_bull"] = (
        (spy_aligned > spy_ema50) & (vix_aligned < 20)
    ).astype(float).values

    out["regime_bear"] = (
        (spy_aligned < spy_ema50) & (vix_aligned > 25)
    ).astype(float).values

    out["regime_high_vol"] = (vix_aligned > 30).astype(float).values

    out["regime_sideways"] = (
        (~(out["regime_bull"].astype(bool)))
        & (~(out["regime_bear"].astype(bool)))
        & (~(out["regime_high_vol"].astype(bool)))
    ).astype(float)

    return out


def classify_regime(row: pd.Series) -> str:
    """Classify a single row's regime label."""
    if row.get("regime_high_vol", 0) > 0:
        return "high_vol"
    if row.get("regime_bear", 0) > 0:
        return "bear_trend"
    if row.get("regime_bull", 0) > 0:
        return "bull_trend"
    return "sideways"


def _fetch_vix(period: str) -> pd.DataFrame:
    try:
        vix = yf.Ticker("^VIX")
        df = vix.history(period=period, interval="1d")
        if df.empty:
            return pd.DataFrame()
        df = df.rename(columns={"Close": "close"})
        df.index.name = "date"
        return df[["close"]]
    except Exception as e:
        logger.warning("Failed to fetch VIX: %s", e)
        return pd.DataFrame()


def _fetch_spy(period: str) -> pd.DataFrame:
    try:
        spy = yf.Ticker("SPY")
        df = spy.history(period=period, interval="1d")
        if df.empty:
            return pd.DataFrame()
        df = df.rename(columns={"Close": "close"})
        df.index.name = "date"
        return df[["close"]]
    except Exception as e:
        logger.warning("Failed to fetch SPY: %s", e)
        return pd.DataFrame()


def _align_series(series: pd.Series, target_index: pd.DatetimeIndex) -> pd.Series:
    """Align a series to a target index via reindex + forward-fill."""
    if hasattr(target_index, "tz") and target_index.tz is not None:
        if series.index.tz is None:
            series.index = series.index.tz_localize(target_index.tz)
        else:
            series.index = series.index.tz_convert(target_index.tz)
    elif hasattr(series.index, "tz") and series.index.tz is not None:
        series.index = series.index.tz_localize(None)

    combined = series.reindex(series.index.union(target_index))
    combined = combined.ffill()
    return combined.reindex(target_index).ffill().bfill()

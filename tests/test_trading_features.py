"""Tests for trading feature engineering modules."""

import numpy as np
import pandas as pd
import pytest

from src.trading.features.technical_features import compute_technical_features
from src.trading.features.volume_features import compute_volume_features
from src.trading.features.calendar_features import compute_calendar_features


@pytest.fixture
def sample_ohlcv():
    """Generate synthetic OHLCV DataFrame for testing."""
    np.random.seed(42)
    n = 300
    dates = pd.date_range("2024-01-01", periods=n, freq="B")
    close = 100 + np.cumsum(np.random.randn(n) * 0.5)
    high = close + np.abs(np.random.randn(n))
    low = close - np.abs(np.random.randn(n))
    open_ = close + np.random.randn(n) * 0.3
    volume = np.random.randint(1_000_000, 10_000_000, n).astype(float)

    return pd.DataFrame({
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
    }, index=dates)


def test_technical_features_columns(sample_ohlcv):
    result = compute_technical_features(sample_ohlcv)
    expected_cols = [
        "rsi_14", "rsi_2", "macd_line", "macd_signal", "macd_histogram",
        "bb_upper", "bb_lower", "bb_pct_b", "bb_bandwidth",
        "atr_14", "adx_14", "stoch_k", "stoch_d",
        "cci_20", "obv", "williams_r",
        "ema_9", "ema_21", "ema_50", "sma_200",
        "return_1d", "return_5d", "return_10d", "return_20d",
        "ema_bullish_alignment", "ema_bearish_alignment",
    ]
    for col in expected_cols:
        assert col in result.columns, f"Missing column: {col}"


def test_technical_features_no_all_nan(sample_ohlcv):
    result = compute_technical_features(sample_ohlcv)
    result_clean = result.iloc[200:]
    for col in result_clean.columns:
        assert not result_clean[col].isna().all(), f"Column {col} is all NaN"


def test_rsi_range(sample_ohlcv):
    result = compute_technical_features(sample_ohlcv)
    rsi = result["rsi_14"].dropna()
    assert rsi.min() >= 0, "RSI below 0"
    assert rsi.max() <= 100, "RSI above 100"


def test_volume_features_columns(sample_ohlcv):
    result = compute_volume_features(sample_ohlcv)
    expected = ["vwap", "vwap_deviation_pct", "relative_volume", "obv", "ad_line", "vpt", "mfi_14"]
    for col in expected:
        assert col in result.columns, f"Missing column: {col}"


def test_calendar_features_columns(sample_ohlcv):
    result = compute_calendar_features(sample_ohlcv)
    expected = [
        "is_monday", "is_friday", "is_month_end",
        "days_to_fomc", "is_fomc_week", "days_to_options_expiry",
    ]
    for col in expected:
        assert col in result.columns, f"Missing column: {col}"


def test_calendar_one_hot(sample_ohlcv):
    result = compute_calendar_features(sample_ohlcv)
    dow_cols = ["is_monday", "is_tuesday", "is_wednesday", "is_thursday", "is_friday"]
    for _, row in result[dow_cols].iterrows():
        assert row.sum() == 1.0, "Day-of-week should be exactly one-hot"


def test_volume_features_obv_monotone(sample_ohlcv):
    """OBV should be computed (not all zero or all NaN)."""
    result = compute_volume_features(sample_ohlcv)
    obv = result["obv"]
    assert not obv.isna().all()
    assert obv.std() > 0

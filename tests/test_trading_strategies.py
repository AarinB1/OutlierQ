"""Tests for trading strategy signal generation."""

import numpy as np
import pandas as pd
import pytest

from src.trading.strategies.base_strategy import TradeSignalData
from src.trading.strategies.momentum_strategy import MomentumStrategy
from src.trading.strategies.mean_reversion_strategy import MeanReversionStrategy
from src.trading.strategies.breakout_strategy import BreakoutStrategy


@pytest.fixture
def bullish_features():
    """Create a DataFrame that should trigger a bullish momentum signal."""
    np.random.seed(42)
    n = 100
    dates = pd.date_range("2024-01-01", periods=n, freq="B")
    df = pd.DataFrame({
        "open": np.linspace(100, 120, n),
        "high": np.linspace(101, 122, n),
        "low": np.linspace(99, 118, n),
        "close": np.linspace(100, 120, n),
        "volume": [5_000_000] * n,
        "rsi_14": [55.0] * n,
        "rsi_2": [65.0] * n,
        "macd_histogram": [0.5] * n,
        "adx_14": [30.0] * n,
        "relative_volume": [2.0] * n,
        "ema_bullish_alignment": [1.0] * n,
        "ema_bearish_alignment": [0.0] * n,
        "atr_14": [2.0] * n,
        "bb_pct_b": [0.7] * n,
        "bb_bandwidth": [0.05] * n,
        "vwap": [110.0] * n,
        "vwap_deviation_pct": [0.5] * n,
    }, index=dates)
    df.attrs["ticker"] = "TEST"
    return df


@pytest.fixture
def oversold_features():
    """Create a DataFrame that should trigger a mean-reversion buy signal."""
    n = 100
    dates = pd.date_range("2024-01-01", periods=n, freq="B")
    df = pd.DataFrame({
        "open": [100.0] * n,
        "high": [101.0] * n,
        "low": [99.0] * n,
        "close": [100.0] * n,
        "volume": [5_000_000] * n,
        "rsi_14": [25.0] * n,
        "rsi_2": [5.0] * n,
        "macd_histogram": [-0.5] * n,
        "adx_14": [15.0] * n,
        "relative_volume": [1.0] * n,
        "ema_bullish_alignment": [0.0] * n,
        "ema_bearish_alignment": [0.0] * n,
        "atr_14": [2.0] * n,
        "bb_pct_b": [-0.1] * n,
        "bb_bandwidth": [0.03] * n,
        "vwap": [102.0] * n,
        "vwap_deviation_pct": [-2.0] * n,
    }, index=dates)
    df.attrs["ticker"] = "TEST"
    return df


def test_momentum_buy_signal(bullish_features):
    strategy = MomentumStrategy(min_confidence=0.3)
    signals = strategy.generate_signals(bullish_features)
    buy_signals = [s for s in signals if s.direction == "BUY"]
    assert len(buy_signals) > 0, "Should generate a BUY signal on bullish data"
    assert buy_signals[0].strategy_name == "momentum"
    assert buy_signals[0].target_price > buy_signals[0].entry_price


def test_momentum_no_signal_on_oversold(oversold_features):
    strategy = MomentumStrategy(min_confidence=0.7)
    signals = strategy.generate_signals(oversold_features)
    buy_signals = [s for s in signals if s.direction == "BUY"]
    assert len(buy_signals) == 0, "Should not generate BUY on oversold non-trending data"


def test_mean_reversion_buy_on_oversold(oversold_features):
    strategy = MeanReversionStrategy(min_confidence=0.3)
    signals = strategy.generate_signals(oversold_features)
    buy_signals = [s for s in signals if s.direction == "BUY"]
    assert len(buy_signals) > 0, "Should generate BUY signal on oversold data"


def test_breakout_requires_data():
    strategy = BreakoutStrategy()
    short_df = pd.DataFrame({"close": [100], "high": [101], "low": [99]})
    signals = strategy.generate_signals(short_df)
    assert len(signals) == 0, "Should return no signals on insufficient data"


def test_strategy_parameters():
    strategy = MomentumStrategy(rsi_low=35, adx_threshold=20)
    params = strategy.get_parameters()
    assert params["rsi_low"] == 35
    assert params["adx_threshold"] == 20

    strategy.set_parameters({"rsi_low": 45})
    assert strategy.rsi_low == 45


def test_signal_data_fields():
    signal = TradeSignalData(
        ticker="AAPL",
        direction="BUY",
        strategy_name="test",
        entry_price=150.0,
        target_price=160.0,
        stop_loss=145.0,
        confidence=0.8,
    )
    assert signal.ticker == "AAPL"
    assert signal.direction == "BUY"
    assert signal.confidence == 0.8

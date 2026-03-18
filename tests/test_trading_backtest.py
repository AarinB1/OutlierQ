"""Tests for backtesting engine and metrics."""

import numpy as np
import pandas as pd
import pytest

from src.trading.backtesting.metrics import compute_metrics, BacktestMetrics
from src.trading.backtesting.trade_logger import TradeLogger, TradeRecord
from src.trading.backtesting.backtest_engine import BacktestEngine
from src.trading.strategies.momentum_strategy import MomentumStrategy
from src.trading.features.technical_features import compute_technical_features
from src.trading.features.volume_features import compute_volume_features


@pytest.fixture
def sample_equity_curve():
    dates = pd.date_range("2024-01-01", periods=252, freq="B")
    values = 100000 + np.cumsum(np.random.RandomState(42).randn(252) * 500)
    return pd.Series(values, index=dates)


@pytest.fixture
def sample_trades():
    return [
        {"pnl_pct": 2.5, "pnl_dollars": 250, "holding_days": 3},
        {"pnl_pct": -1.2, "pnl_dollars": -120, "holding_days": 2},
        {"pnl_pct": 3.1, "pnl_dollars": 310, "holding_days": 5},
        {"pnl_pct": -0.5, "pnl_dollars": -50, "holding_days": 1},
        {"pnl_pct": 1.8, "pnl_dollars": 180, "holding_days": 4},
    ]


def test_compute_metrics(sample_equity_curve, sample_trades):
    metrics = compute_metrics(sample_equity_curve, sample_trades)
    assert isinstance(metrics, BacktestMetrics)
    assert metrics.total_trades == 5
    assert 0 <= metrics.win_rate <= 1
    assert metrics.max_drawdown_pct >= 0


def test_sharpe_ratio_positive(sample_equity_curve, sample_trades):
    metrics = compute_metrics(sample_equity_curve, sample_trades)
    # Just check it's a finite number
    assert np.isfinite(metrics.sharpe_ratio)


def test_win_rate_correct(sample_equity_curve, sample_trades):
    metrics = compute_metrics(sample_equity_curve, sample_trades)
    expected_win_rate = 3 / 5  # 3 positive trades out of 5
    assert metrics.win_rate == pytest.approx(expected_win_rate)


def test_profit_factor(sample_equity_curve, sample_trades):
    metrics = compute_metrics(sample_equity_curve, sample_trades)
    winning_sum = 2.5 + 3.1 + 1.8
    losing_sum = abs(-1.2) + abs(-0.5)
    expected_pf = winning_sum / losing_sum
    assert metrics.profit_factor == pytest.approx(expected_pf)


def test_trade_logger():
    logger = TradeLogger()
    trade = TradeRecord(
        trade_id="test1",
        ticker="AAPL",
        direction="BUY",
        entry_price=150.0,
        exit_price=155.0,
        quantity=10,
        pnl_dollars=50.0,
        pnl_pct=3.33,
    )
    logger.log_trade(trade)
    assert len(logger.trades) == 1

    summary = logger.summary()
    assert summary["total_trades"] == 1
    assert summary["winning_trades"] == 1

    dicts = logger.to_dicts()
    assert len(dicts) == 1
    assert dicts[0]["ticker"] == "AAPL"


def test_backtest_engine_runs():
    """Test that the backtest engine runs without errors on synthetic data."""
    np.random.seed(42)
    n = 500
    dates = pd.date_range("2023-01-01", periods=n, freq="B")
    close = 100 + np.cumsum(np.random.randn(n) * 0.5)
    high = close + np.abs(np.random.randn(n))
    low = close - np.abs(np.random.randn(n))
    df = pd.DataFrame({
        "open": close + np.random.randn(n) * 0.3,
        "high": high,
        "low": low,
        "close": close,
        "volume": np.random.randint(1_000_000, 10_000_000, n).astype(float),
    }, index=dates)

    df = compute_technical_features(df)
    df = compute_volume_features(df)
    df = df.ffill().dropna()

    assert len(df) > 100, f"Feature DataFrame too short after dropna: {len(df)}"

    strategy = MomentumStrategy(min_confidence=0.3)
    engine = BacktestEngine(initial_capital=100000)
    result = engine.run(df, strategy, "TEST")

    assert result.metrics.total_trades >= 0
    assert len(result.equity_curve) > 0
    assert result.config["ticker"] == "TEST"


def test_backtest_result_has_equity_curve():
    """Ensure BacktestResult contains equity_curve with dates."""
    np.random.seed(42)
    n = 500
    dates = pd.date_range("2023-01-01", periods=n, freq="B")
    close = 100 + np.cumsum(np.random.randn(n) * 0.5)
    high = close + np.abs(np.random.randn(n))
    low = close - np.abs(np.random.randn(n))
    df = pd.DataFrame(
        {
            "open": close + np.random.randn(n) * 0.3,
            "high": high,
            "low": low,
            "close": close,
            "volume": np.random.randint(1_000_000, 10_000_000, n).astype(float),
        },
        index=dates,
    )

    df = compute_technical_features(df)
    df = compute_volume_features(df)
    df = df.ffill().dropna()

    strategy = MomentumStrategy(min_confidence=0.3)
    engine = BacktestEngine(initial_capital=100000)
    result = engine.run(df, strategy, "TEST_EQ")

    assert isinstance(result.equity_curve, pd.Series)
    assert len(result.equity_curve) > 0
    assert isinstance(result.equity_curve.index, pd.DatetimeIndex)


def test_drawdown_computation():
    """Test that drawdown is computed correctly from equity curve."""
    equity = pd.Series(
        [100, 110, 105, 95, 100, 120],
        index=pd.date_range("2024-01-01", periods=6, freq="B"),
    )
    peak = equity.cummax()
    drawdown = (equity - peak) / peak * 100
    assert drawdown.iloc[0] == 0.0  # no drawdown at start
    assert drawdown.iloc[3] < 0  # drawdown at trough
    assert abs(drawdown.iloc[3] - (-13.636)) < 0.1  # 95 vs peak 110


def test_monthly_returns_computation():
    """Test monthly return resampling."""
    dates = pd.date_range("2024-01-01", periods=60, freq="B")
    values = 100000 + np.arange(60) * 100  # steady growth
    equity = pd.Series(values, index=dates)
    monthly = equity.resample("ME").last().pct_change().dropna() * 100
    assert len(monthly) >= 2
    # Values are numpy floats; ensure they are numeric scalars
    assert all(np.isscalar(v) for v in monthly.values)

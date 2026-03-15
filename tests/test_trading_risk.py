"""Tests for risk management: position sizing, risk manager, portfolio."""

import pytest

from src.trading.risk.position_sizer import PositionSizer, SizingMethod
from src.trading.risk.risk_manager import RiskManager
from src.trading.risk.portfolio import Portfolio
from src.trading.strategies.base_strategy import TradeSignalData


def test_fixed_fractional_sizing():
    sizer = PositionSizer(method=SizingMethod.FIXED_FRACTIONAL, risk_per_trade_pct=0.01, max_position_pct=0.50)
    qty = sizer.calculate(
        portfolio_value=100_000,
        entry_price=150.0,
        stop_loss=145.0,
    )
    # risk_amount = 1000, risk_per_share = 5, expected 200 shares
    assert qty == 200


def test_atr_based_sizing():
    sizer = PositionSizer(method=SizingMethod.ATR_BASED, risk_per_trade_pct=0.01, max_position_pct=0.50)
    qty = sizer.calculate(
        portfolio_value=100_000,
        entry_price=150.0,
        stop_loss=145.0,
        atr=3.0,
        atr_multiplier=2.0,
    )
    # risk_amount = 1000, atr * mult = 6, expected 166
    assert qty == 166


def test_kelly_sizing():
    sizer = PositionSizer(method=SizingMethod.KELLY, kelly_fraction=0.25)
    qty = sizer.calculate(
        portfolio_value=100_000,
        entry_price=100.0,
        stop_loss=95.0,
        win_rate=0.6,
        avg_win_loss_ratio=1.5,
    )
    assert qty > 0


def test_max_position_cap():
    sizer = PositionSizer(max_position_pct=0.10)
    qty = sizer.calculate(
        portfolio_value=100_000,
        entry_price=10.0,
        stop_loss=9.0,
    )
    max_allowed = int(100_000 * 0.10 / 10.0)  # 1000 shares
    assert qty <= max_allowed


def test_risk_manager_validates_signal():
    # Disable the time-based check so tests pass regardless of when they run
    rm = RiskManager(no_entry_minutes_before_close=0)
    rm.update_equity(100_000)
    rm._peak_equity = 100_000

    signal = TradeSignalData(
        ticker="AAPL",
        direction="BUY",
        strategy_name="test",
        entry_price=150.0,
        target_price=160.0,
        stop_loss=145.0,
        confidence=0.7,
    )
    assert rm.validate_signal(signal) is True


def test_risk_manager_rejects_max_positions():
    rm = RiskManager(max_positions=2)
    rm.update_equity(100_000)
    rm.set_positions([
        {"ticker": "AAPL", "direction": "BUY"},
        {"ticker": "MSFT", "direction": "BUY"},
    ])

    signal = TradeSignalData(
        ticker="GOOGL",
        direction="BUY",
        strategy_name="test",
        entry_price=150.0,
        target_price=160.0,
        stop_loss=145.0,
        confidence=0.7,
    )
    assert rm.validate_signal(signal) is False


def test_risk_manager_circuit_breaker():
    rm = RiskManager(max_drawdown_pct=0.10)
    rm._peak_equity = 100_000
    rm.update_equity(89_000)  # 11% drawdown

    assert rm.circuit_breaker_active is True

    signal = TradeSignalData(
        ticker="AAPL",
        direction="BUY",
        strategy_name="test",
        entry_price=150.0,
        target_price=160.0,
        stop_loss=145.0,
        confidence=0.7,
    )
    assert rm.validate_signal(signal) is False


def test_risk_manager_reward_risk_ratio():
    rm = RiskManager(min_reward_risk_ratio=1.5)
    rm.update_equity(100_000)

    # Bad R/R ratio (1:1)
    signal = TradeSignalData(
        ticker="AAPL",
        direction="BUY",
        strategy_name="test",
        entry_price=150.0,
        target_price=155.0,
        stop_loss=145.0,
        confidence=0.7,
    )
    assert rm.validate_signal(signal) is False


def test_portfolio_open_close():
    portfolio = Portfolio(initial_cash=100_000)

    assert portfolio.open_position("AAPL", "BUY", 150.0, 100)
    assert portfolio.cash == pytest.approx(100_000 - 150 * 100)
    assert len(portfolio.positions) == 1

    pnl = portfolio.close_position("AAPL", "BUY", 160.0)
    assert pnl == pytest.approx(160 * 100 - 150 * 100)
    assert len(portfolio.positions) == 0


def test_portfolio_insufficient_cash():
    portfolio = Portfolio(initial_cash=1000)
    result = portfolio.open_position("AAPL", "BUY", 150.0, 100)
    assert result is False
    assert len(portfolio.positions) == 0


def test_portfolio_snapshot():
    portfolio = Portfolio(initial_cash=100_000)
    portfolio.open_position("AAPL", "BUY", 150.0, 10)
    portfolio.update_prices({"AAPL": 155.0})

    snap = portfolio.snapshot()
    assert snap.total_value > 0
    assert len(snap.positions) == 1
    assert snap.positions[0]["unrealized_pnl"] == pytest.approx(50.0)

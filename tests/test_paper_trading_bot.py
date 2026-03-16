"""Tests for the paper trading bot."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from src.trading.paper_trading_bot import PaperTradingBot
from src.trading.strategies.base_strategy import TradeSignalData


def _make_signal(
    ticker: str = "AAPL",
    direction: str = "BUY",
    entry: float = 150.0,
    target: float = 160.0,
    stop: float = 145.0,
    confidence: float = 0.8,
    strategy: str = "momentum",
) -> TradeSignalData:
    return TradeSignalData(
        ticker=ticker,
        direction=direction,
        strategy_name=strategy,
        entry_price=entry,
        target_price=target,
        stop_loss=stop,
        confidence=confidence,
    )


@pytest.fixture
def bot() -> PaperTradingBot:
    return PaperTradingBot(
        tickers=["AAPL", "TSLA"],
        initial_cash=100_000.0,
        min_confidence=0.6,
        max_positions=5,
        risk_per_trade_pct=0.01,
        max_holding_days=10,
    )


# ── Signal cycle tests ───────────────────────────────────────────────


@patch.object(PaperTradingBot, "_fetch_live_prices")
def test_signal_cycle_opens_position(mock_prices: MagicMock, bot: PaperTradingBot) -> None:
    signal = _make_signal(confidence=0.8)
    with patch.object(bot.engine, "generate_signals", return_value=[signal]):
        actions = bot.run_signal_cycle()

    assert len(actions) == 1
    assert actions[0]["action"] == "OPEN"
    assert actions[0]["ticker"] == "AAPL"
    assert actions[0]["direction"] == "BUY"
    assert len(bot.portfolio.positions) == 1


def test_signal_cycle_filters_low_confidence(bot: PaperTradingBot) -> None:
    signal = _make_signal(confidence=0.3)
    with patch.object(bot.engine, "generate_signals", return_value=[signal]):
        actions = bot.run_signal_cycle()

    assert len(actions) == 0
    assert len(bot.portfolio.positions) == 0


def test_signal_cycle_skips_duplicate_signals(bot: PaperTradingBot) -> None:
    signal = _make_signal(confidence=0.8)
    with patch.object(bot.engine, "generate_signals", return_value=[signal]):
        actions1 = bot.run_signal_cycle()
    # Close the position so pos_key check doesn't block; signal_key should still block.
    bot.portfolio.close_position("AAPL", "BUY", 155.0)
    del bot._position_targets["AAPL_BUY"]

    with patch.object(bot.engine, "generate_signals", return_value=[signal]):
        actions2 = bot.run_signal_cycle()

    assert len(actions1) == 1
    assert len(actions2) == 0


def test_signal_cycle_skips_existing_position(bot: PaperTradingBot) -> None:
    signal = _make_signal(confidence=0.8)
    with patch.object(bot.engine, "generate_signals", return_value=[signal]):
        bot.run_signal_cycle()
    # Same signal again — pos_key exists so it should be skipped.
    signal2 = _make_signal(confidence=0.9, strategy="breakout")
    with patch.object(bot.engine, "generate_signals", return_value=[signal2]):
        actions = bot.run_signal_cycle()

    assert len(actions) == 0


# ── Monitor cycle tests ──────────────────────────────────────────────


def _open_position(bot: PaperTradingBot, ticker: str = "AAPL", direction: str = "BUY",
                   entry: float = 150.0, target: float = 160.0, stop: float = 145.0,
                   days_ago: int = 0) -> None:
    """Manually open a position with target/stop metadata for monitor testing."""
    bot.portfolio.open_position(ticker, direction, entry, 10, "test_strategy")
    entry_time = datetime.now(timezone.utc) - timedelta(days=days_ago)
    bot._position_targets[f"{ticker}_{direction}"] = {
        "target": target,
        "stop": stop,
        "entry_price": entry,
        "entry_time": entry_time,
        "strategy": "test_strategy",
        "confidence": 0.8,
        "quantity": 10,
    }


def test_monitor_closes_on_target_hit(bot: PaperTradingBot) -> None:
    _open_position(bot, entry=150.0, target=160.0, stop=145.0)

    with patch.object(bot, "_fetch_live_prices", return_value={"AAPL": 162.0}):
        closes = bot.run_monitor_cycle()

    assert len(closes) == 1
    assert closes[0]["exit_reason"] == "target_hit"
    assert closes[0]["pnl_dollars"] > 0
    assert len(bot.portfolio.positions) == 0


def test_monitor_closes_on_stop_loss(bot: PaperTradingBot) -> None:
    _open_position(bot, entry=150.0, target=160.0, stop=145.0)

    with patch.object(bot, "_fetch_live_prices", return_value={"AAPL": 143.0}):
        closes = bot.run_monitor_cycle()

    assert len(closes) == 1
    assert closes[0]["exit_reason"] == "stop_loss"
    assert closes[0]["pnl_dollars"] < 0


def test_monitor_closes_short_on_target_hit(bot: PaperTradingBot) -> None:
    _open_position(bot, direction="SHORT", entry=150.0, target=140.0, stop=155.0)

    with patch.object(bot, "_fetch_live_prices", return_value={"AAPL": 138.0}):
        closes = bot.run_monitor_cycle()

    assert len(closes) == 1
    assert closes[0]["exit_reason"] == "target_hit"
    assert closes[0]["pnl_dollars"] > 0


def test_monitor_closes_short_on_stop_loss(bot: PaperTradingBot) -> None:
    _open_position(bot, direction="SHORT", entry=150.0, target=140.0, stop=155.0)

    with patch.object(bot, "_fetch_live_prices", return_value={"AAPL": 157.0}):
        closes = bot.run_monitor_cycle()

    assert len(closes) == 1
    assert closes[0]["exit_reason"] == "stop_loss"
    assert closes[0]["pnl_dollars"] < 0


def test_monitor_force_closes_stale_positions(bot: PaperTradingBot) -> None:
    _open_position(bot, entry=150.0, target=200.0, stop=100.0, days_ago=15)

    with patch.object(bot, "_fetch_live_prices", return_value={"AAPL": 152.0}):
        closes = bot.run_monitor_cycle()

    assert len(closes) == 1
    assert closes[0]["exit_reason"] == "time_exit"


def test_monitor_returns_empty_when_no_positions(bot: PaperTradingBot) -> None:
    closes = bot.run_monitor_cycle()
    assert closes == []


# ── End of day summary ───────────────────────────────────────────────


def test_end_of_day_summary_returns_valid_dict(bot: PaperTradingBot) -> None:
    summary = bot.end_of_day_summary()

    assert "portfolio_value" in summary
    assert "cash" in summary
    assert "open_positions" in summary
    assert "daily_pnl" in summary
    assert "cumulative_pnl" in summary
    assert "max_drawdown" in summary
    assert "trade_summary" in summary
    assert "timestamp" in summary


def test_end_of_day_clears_acted_signals(bot: PaperTradingBot) -> None:
    bot._acted_signal_keys.add("AAPL_BUY_momentum")
    bot.end_of_day_summary()
    assert len(bot._acted_signal_keys) == 0


# ── Trade logging ────────────────────────────────────────────────────


def test_trades_are_logged_on_close(bot: PaperTradingBot) -> None:
    _open_position(bot, entry=150.0, target=160.0, stop=145.0)

    with patch.object(bot, "_fetch_live_prices", return_value={"AAPL": 162.0}):
        bot.run_monitor_cycle()

    assert len(bot.trade_logger.trades) == 1
    record = bot.trade_logger.trades[0]
    assert record.ticker == "AAPL"
    assert record.exit_reason == "target_hit"
    assert record.pnl_dollars > 0


def test_export_trades(bot: PaperTradingBot, tmp_path) -> None:
    _open_position(bot, entry=150.0, target=160.0, stop=145.0)
    with patch.object(bot, "_fetch_live_prices", return_value={"AAPL": 162.0}):
        bot.run_monitor_cycle()

    csv_path = tmp_path / "trades.csv"
    bot.export_trades(str(csv_path))
    assert csv_path.exists()

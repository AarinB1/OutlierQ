"""Event-driven backtesting engine.

Iterates bar-by-bar, feeds features to strategy, executes through
risk manager, applies commission and slippage, tracks portfolio state,
generates equity curve and trade log.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd

from config.settings import LOG_FORMAT
from src.trading.backtesting.metrics import BacktestMetrics, compute_metrics
from src.trading.backtesting.trade_logger import TradeLogger, TradeRecord
from src.trading.strategies.base_strategy import BaseStrategy

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


@dataclass
class Position:
    ticker: str
    direction: str
    entry_price: float
    entry_time: datetime
    quantity: int
    stop_loss: float
    target_price: float
    strategy_name: str
    confidence: float


@dataclass
class BacktestResult:
    metrics: BacktestMetrics
    equity_curve: pd.Series
    trades: list[dict]
    config: dict[str, Any]


class BacktestEngine:
    """Core backtesting engine with event-driven bar-by-bar simulation."""

    def __init__(
        self,
        initial_capital: float = 100_000.0,
        commission_pct: float = 0.001,
        slippage_pct: float = 0.0005,
        max_positions: int = 5,
        risk_per_trade_pct: float = 0.01,
    ) -> None:
        self.initial_capital = initial_capital
        self.commission_pct = commission_pct
        self.slippage_pct = slippage_pct
        self.max_positions = max_positions
        self.risk_per_trade_pct = risk_per_trade_pct

    def run(
        self,
        features_df: pd.DataFrame,
        strategy: BaseStrategy,
        ticker: str = "UNKNOWN",
    ) -> BacktestResult:
        """Run a backtest on the given features DataFrame.

        The DataFrame must have 'close', 'high', 'low' columns and
        a DatetimeIndex.
        """
        logger.info(
            "Starting backtest: ticker=%s, strategy=%s, bars=%d, capital=%.0f",
            ticker, strategy.name, len(features_df), self.initial_capital,
        )

        features_df.attrs["ticker"] = ticker

        cash = self.initial_capital
        positions: list[Position] = []
        trade_logger = TradeLogger()
        equity_values = []
        equity_dates = []

        min_lookback = 60

        for i in range(min_lookback, len(features_df)):
            current_bar = features_df.iloc[i]
            current_time = features_df.index[i]
            price = current_bar["close"]
            high = current_bar.get("high", price)
            low = current_bar.get("low", price)

            # Check stops and targets on existing positions
            closed_positions = []
            for pos in positions:
                exit_reason = None
                exit_price = price

                if pos.direction == "BUY":
                    if low <= pos.stop_loss:
                        exit_reason = "stop_loss"
                        exit_price = pos.stop_loss
                    elif high >= pos.target_price:
                        exit_reason = "target"
                        exit_price = pos.target_price
                elif pos.direction == "SHORT":
                    if high >= pos.stop_loss:
                        exit_reason = "stop_loss"
                        exit_price = pos.stop_loss
                    elif low <= pos.target_price:
                        exit_reason = "target"
                        exit_price = pos.target_price

                if exit_reason:
                    trade = self._close_position(pos, exit_price, current_time, exit_reason)
                    cash += trade.pnl_dollars + (pos.entry_price * pos.quantity) - trade.fees
                    trade_logger.log_trade(trade)
                    closed_positions.append(pos)

            for cp in closed_positions:
                positions.remove(cp)

            # Generate signals from strategy
            if len(positions) < self.max_positions:
                window = features_df.iloc[max(0, i - min_lookback) : i + 1]
                try:
                    signals = strategy.generate_signals(window)
                except Exception as e:
                    logger.debug("Strategy error at bar %d: %s", i, e)
                    signals = []

                for signal in signals:
                    if len(positions) >= self.max_positions:
                        break

                    # Check if we already have a position in this direction
                    existing = [p for p in positions if p.ticker == ticker and p.direction == signal.direction]
                    if existing:
                        continue

                    # Calculate position size
                    risk_amount = cash * self.risk_per_trade_pct
                    atr = current_bar.get("atr_14", price * 0.02)
                    if atr <= 0:
                        atr = price * 0.02
                    quantity = max(1, int(risk_amount / (atr * 2)))
                    cost = quantity * price

                    if cost > cash * 0.95:
                        quantity = max(1, int(cash * 0.95 / price))
                        cost = quantity * price

                    if cost > cash:
                        continue

                    # Apply slippage
                    if signal.direction == "BUY":
                        entry_price = price * (1 + self.slippage_pct)
                    else:
                        entry_price = price * (1 - self.slippage_pct)

                    commission = cost * self.commission_pct
                    cash -= cost + commission

                    positions.append(Position(
                        ticker=ticker,
                        direction=signal.direction,
                        entry_price=entry_price,
                        entry_time=current_time,
                        quantity=quantity,
                        stop_loss=signal.stop_loss,
                        target_price=signal.target_price,
                        strategy_name=signal.strategy_name,
                        confidence=signal.confidence,
                    ))

            # Calculate portfolio value
            portfolio_value = cash
            for pos in positions:
                if pos.direction == "BUY":
                    portfolio_value += pos.quantity * price
                elif pos.direction == "SHORT":
                    unrealized = (pos.entry_price - price) * pos.quantity
                    portfolio_value += pos.entry_price * pos.quantity + unrealized

            equity_values.append(portfolio_value)
            equity_dates.append(current_time)

        # Close remaining positions at last price
        if positions:
            last_price = features_df.iloc[-1]["close"]
            last_time = features_df.index[-1]
            for pos in positions:
                trade = self._close_position(pos, last_price, last_time, "end_of_backtest")
                trade_logger.log_trade(trade)

        equity_curve = pd.Series(equity_values, index=equity_dates)
        trades = trade_logger.to_dicts()
        metrics = compute_metrics(equity_curve, trades)

        logger.info(
            "Backtest complete: %d trades, Sharpe=%.2f, Return=%.1f%%, MDD=%.1f%%",
            metrics.total_trades, metrics.sharpe_ratio,
            metrics.total_return_pct, metrics.max_drawdown_pct,
        )

        return BacktestResult(
            metrics=metrics,
            equity_curve=equity_curve,
            trades=trades,
            config={
                "ticker": ticker,
                "strategy": strategy.name,
                "initial_capital": self.initial_capital,
                "commission_pct": self.commission_pct,
                "slippage_pct": self.slippage_pct,
                "bars": len(features_df),
            },
        )

    def _close_position(
        self, pos: Position, exit_price: float, exit_time: Any, exit_reason: str,
    ) -> TradeRecord:
        commission = pos.quantity * exit_price * self.commission_pct
        slippage = pos.quantity * exit_price * self.slippage_pct

        if pos.direction == "BUY":
            pnl_dollars = (exit_price - pos.entry_price) * pos.quantity - commission - slippage
        else:
            pnl_dollars = (pos.entry_price - exit_price) * pos.quantity - commission - slippage

        pnl_pct = pnl_dollars / (pos.entry_price * pos.quantity) * 100 if pos.entry_price > 0 else 0

        entry_dt = pos.entry_time if isinstance(pos.entry_time, datetime) else None
        exit_dt = exit_time if isinstance(exit_time, datetime) else None
        holding_days = 0.0
        if entry_dt and exit_dt:
            holding_days = (exit_dt - entry_dt).total_seconds() / 86400

        return TradeRecord(
            trade_id=str(uuid.uuid4()),
            ticker=pos.ticker,
            direction=pos.direction,
            entry_time=entry_dt,
            exit_time=exit_dt,
            entry_price=pos.entry_price,
            exit_price=exit_price,
            quantity=pos.quantity,
            pnl_dollars=pnl_dollars,
            pnl_pct=pnl_pct,
            fees=commission + slippage,
            slippage=slippage,
            exit_reason=exit_reason,
            strategy_name=pos.strategy_name,
            model_confidence=pos.confidence,
            holding_days=holding_days,
        )

"""Paper trading bot: wires signals, risk, sizing, portfolio, and monitoring into one loop."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import yfinance as yf

from config.settings import LOG_FORMAT
from src.trading.backtesting.trade_logger import TradeLogger, TradeRecord
from src.trading.risk.portfolio import Portfolio
from src.trading.risk.position_sizer import PositionSizer, SizingMethod
from src.trading.risk.risk_manager import RiskManager
from src.trading.signals.trade_signal_engine import TradeSignalEngine
from src.trading.strategies.breakout_strategy import BreakoutStrategy
from src.trading.strategies.mean_reversion_strategy import MeanReversionStrategy
from src.trading.strategies.momentum_strategy import MomentumStrategy

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class PaperTradingBot:
    """Automated paper-trading bot that closes the signal->trade->monitor->close loop.

    Orchestrates TradeSignalEngine, RiskManager, PositionSizer, Portfolio,
    and TradeLogger on a scheduler-driven cadence.
    """

    def __init__(
        self,
        tickers: list[str],
        initial_cash: float = 100_000.0,
        min_confidence: float = 0.6,
        max_positions: int = 5,
        risk_per_trade_pct: float = 0.01,
        max_holding_days: int = 10,
    ) -> None:
        self.tickers = tickers
        self.min_confidence = min_confidence
        self.max_holding_days = max_holding_days

        self.portfolio = Portfolio(initial_cash=initial_cash)
        self.risk_manager = RiskManager(max_positions=max_positions)
        self.position_sizer = PositionSizer(
            method=SizingMethod.FIXED_FRACTIONAL,
            risk_per_trade_pct=risk_per_trade_pct,
        )
        self.trade_logger = TradeLogger()

        self.engine = TradeSignalEngine(risk_manager=self.risk_manager)
        self.engine.register_strategy(MomentumStrategy())
        self.engine.register_strategy(MeanReversionStrategy())
        self.engine.register_strategy(BreakoutStrategy())

        self._acted_signal_keys: set[str] = set()
        self._position_targets: dict[str, dict[str, Any]] = {}

    # ── Signal cycle (every 15 min) ──────────────────────────────────

    def run_signal_cycle(self) -> list[dict]:
        """Generate signals, validate, size, and open positions.

        Returns a list of action dicts describing each opened position.
        """
        logger.info("Signal cycle started for %s", self.tickers)
        actions: list[dict] = []

        try:
            signals = self.engine.generate_signals(self.tickers, period="6mo")
        except Exception:
            logger.exception("Signal generation failed")
            return actions

        qualifying = [s for s in signals if s.confidence >= self.min_confidence]
        logger.info(
            "Signals: %d total, %d above confidence %.2f",
            len(signals), len(qualifying), self.min_confidence,
        )

        self.risk_manager.update_equity(self.portfolio.total_value)
        self.risk_manager.set_positions(self.portfolio.get_positions_as_dicts())

        for signal in qualifying:
            pos_key = f"{signal.ticker}_{signal.direction}"
            signal_key = f"{signal.ticker}_{signal.direction}_{signal.strategy_name}"

            if pos_key in self._position_targets:
                logger.debug("Already have position for %s, skipping", pos_key)
                continue
            if signal_key in self._acted_signal_keys:
                logger.debug("Already acted on signal %s, skipping", signal_key)
                continue

            if not self.risk_manager.validate_signal(signal):
                continue

            quantity = self.position_sizer.calculate(
                portfolio_value=self.portfolio.total_value,
                entry_price=signal.entry_price,
                stop_loss=signal.stop_loss,
            )
            if quantity <= 0:
                logger.debug("Position sizer returned 0 for %s", signal.ticker)
                continue

            opened = self.portfolio.open_position(
                ticker=signal.ticker,
                direction=signal.direction,
                price=signal.entry_price,
                quantity=quantity,
                strategy_name=signal.strategy_name,
            )
            if not opened:
                logger.warning("Could not open position for %s (insufficient cash?)", signal.ticker)
                continue

            self._position_targets[pos_key] = {
                "target": signal.target_price,
                "stop": signal.stop_loss,
                "entry_price": signal.entry_price,
                "entry_time": datetime.now(timezone.utc),
                "strategy": signal.strategy_name,
                "confidence": signal.confidence,
                "quantity": quantity,
            }
            self._acted_signal_keys.add(signal_key)

            action = {
                "action": "OPEN",
                "ticker": signal.ticker,
                "direction": signal.direction,
                "entry_price": signal.entry_price,
                "quantity": quantity,
                "target": signal.target_price,
                "stop": signal.stop_loss,
                "strategy": signal.strategy_name,
                "confidence": signal.confidence,
            }
            actions.append(action)
            logger.info(
                "OPENED %s %s: %d shares @ %.2f (target=%.2f, stop=%.2f, strategy=%s)",
                signal.direction, signal.ticker, quantity, signal.entry_price,
                signal.target_price, signal.stop_loss, signal.strategy_name,
            )

        logger.info("Signal cycle complete: %d positions opened", len(actions))
        return actions

    # ── Monitor cycle (every 1 min) ──────────────────────────────────

    def run_monitor_cycle(self) -> list[dict]:
        """Fetch live prices and close positions that hit target, stop, or time limit.

        Returns a list of close action dicts with PnL info.
        """
        if not self.portfolio.positions:
            return []

        prices = self._fetch_live_prices()
        if not prices:
            return []

        self.portfolio.update_prices(prices)
        self.risk_manager.update_equity(self.portfolio.total_value)
        self.risk_manager.update_daily_pnl(self.portfolio.daily_pnl)

        close_actions: list[dict] = []
        now = datetime.now(timezone.utc)

        for pos in list(self.portfolio.positions):
            pos_key = f"{pos.ticker}_{pos.direction}"
            targets = self._position_targets.get(pos_key)
            if targets is None:
                continue

            current_price = prices.get(pos.ticker)
            if current_price is None:
                continue

            exit_reason: str | None = None

            if pos.direction == "BUY":
                if current_price >= targets["target"]:
                    exit_reason = "target_hit"
                elif current_price <= targets["stop"]:
                    exit_reason = "stop_loss"
            else:  # SHORT
                if current_price <= targets["target"]:
                    exit_reason = "target_hit"
                elif current_price >= targets["stop"]:
                    exit_reason = "stop_loss"

            holding_days = (now - targets["entry_time"]).days
            if exit_reason is None and holding_days >= self.max_holding_days:
                exit_reason = "time_exit"

            if exit_reason is None:
                continue

            pnl = self.portfolio.close_position(
                ticker=pos.ticker,
                direction=pos.direction,
                exit_price=current_price,
            )

            pnl_pct = (pnl / (targets["entry_price"] * targets["quantity"]) * 100) if targets["entry_price"] * targets["quantity"] else 0.0

            record = TradeRecord(
                trade_id=str(uuid.uuid4()),
                ticker=pos.ticker,
                direction=pos.direction,
                entry_time=targets["entry_time"],
                exit_time=now,
                entry_price=targets["entry_price"],
                exit_price=current_price,
                quantity=targets["quantity"],
                pnl_dollars=pnl,
                pnl_pct=pnl_pct,
                exit_reason=exit_reason,
                strategy_name=targets["strategy"],
                model_confidence=targets["confidence"],
                holding_days=holding_days,
            )
            self.trade_logger.log_trade(record)
            del self._position_targets[pos_key]

            action = {
                "action": "CLOSE",
                "ticker": pos.ticker,
                "direction": pos.direction,
                "exit_price": current_price,
                "pnl_dollars": pnl,
                "pnl_pct": pnl_pct,
                "exit_reason": exit_reason,
                "holding_days": holding_days,
                "strategy": targets["strategy"],
            }
            close_actions.append(action)
            logger.info(
                "CLOSED %s %s @ %.2f — reason=%s, PnL=$%.2f (%.2f%%), held %d days",
                pos.direction, pos.ticker, current_price,
                exit_reason, pnl, pnl_pct, holding_days,
            )

        if close_actions:
            logger.info("Monitor cycle: %d positions closed", len(close_actions))
        return close_actions

    # ── End of day summary (4:05 PM ET) ──────────────────────────────

    def end_of_day_summary(self) -> dict[str, Any]:
        """Log end-of-day stats, reset daily counters, and return summary."""
        trade_summary = self.trade_logger.summary()
        snap = self.portfolio.snapshot()

        summary: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "portfolio_value": snap.total_value,
            "cash": snap.cash,
            "open_positions": len(snap.positions),
            "daily_pnl": snap.daily_pnl,
            "cumulative_pnl": snap.cumulative_pnl,
            "max_drawdown": snap.max_drawdown,
            "trade_summary": trade_summary,
        }

        logger.info(
            "EOD SUMMARY — Value=$%.2f, Cash=$%.2f, Positions=%d, "
            "Daily PnL=$%.2f, Cumulative PnL=$%.2f, Max DD=%.2f%%",
            snap.total_value, snap.cash, len(snap.positions),
            snap.daily_pnl, snap.cumulative_pnl, snap.max_drawdown * 100,
        )

        self.portfolio.new_day()
        self._acted_signal_keys.clear()
        self.risk_manager.reset_daily()

        return summary

    # ── Export trades ─────────────────────────────────────────────────

    def export_trades(self, path: str = "paper_trades.csv") -> None:
        """Write all logged trades to CSV."""
        self.trade_logger.export_csv(path)

    # ── Helpers ───────────────────────────────────────────────────────

    def _fetch_live_prices(self) -> dict[str, float]:
        """Fetch current prices for all tickers with open positions."""
        prices: dict[str, float] = {}
        tickers_needed = {pos.ticker for pos in self.portfolio.positions}
        for ticker in tickers_needed:
            try:
                hist = yf.Ticker(ticker).history(period="1d")
                if not hist.empty:
                    prices[ticker] = float(hist["Close"].iloc[-1])
            except Exception:
                logger.warning("Failed to fetch price for %s", ticker, exc_info=True)
        return prices

"""Virtual portfolio state management with position tracking and snapshots."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


@dataclass
class PortfolioPosition:
    """A single open position in the portfolio."""
    ticker: str
    direction: str  # BUY / SHORT
    entry_price: float
    quantity: int
    entry_time: datetime
    current_price: float = 0.0
    unrealized_pnl: float = 0.0
    strategy_name: str = ""


@dataclass
class PortfolioSnapshot:
    """Point-in-time portfolio state."""
    timestamp: datetime
    cash: float
    total_value: float
    positions: list[dict]
    daily_pnl: float
    cumulative_pnl: float
    max_drawdown: float


class Portfolio:
    """Virtual portfolio tracking cash, positions, and P&L."""

    def __init__(self, initial_cash: float = 100_000.0) -> None:
        self.initial_cash = initial_cash
        self.cash = initial_cash
        self.positions: list[PortfolioPosition] = []
        self.realized_pnl: float = 0.0
        self.peak_value: float = initial_cash
        self._snapshots: list[PortfolioSnapshot] = []
        self._daily_start_value: float = initial_cash

    def open_position(
        self,
        ticker: str,
        direction: str,
        price: float,
        quantity: int,
        strategy_name: str = "",
        commission: float = 0.0,
    ) -> bool:
        """Open a new position. Returns True if successful."""
        cost = price * quantity + commission
        if cost > self.cash:
            logger.warning("Insufficient cash: need %.2f, have %.2f", cost, self.cash)
            return False

        self.cash -= cost
        self.positions.append(PortfolioPosition(
            ticker=ticker,
            direction=direction,
            entry_price=price,
            quantity=quantity,
            entry_time=datetime.now(timezone.utc),
            current_price=price,
            strategy_name=strategy_name,
        ))

        logger.info(
            "Opened %s %s: %d shares @ %.2f (cash=%.2f)",
            direction, ticker, quantity, price, self.cash,
        )
        return True

    def close_position(
        self,
        ticker: str,
        direction: str,
        exit_price: float,
        commission: float = 0.0,
    ) -> float:
        """Close a position. Returns realized P&L."""
        pos = None
        for p in self.positions:
            if p.ticker == ticker and p.direction == direction:
                pos = p
                break

        if pos is None:
            logger.warning("No open %s position for %s", direction, ticker)
            return 0.0

        if direction == "BUY":
            pnl = (exit_price - pos.entry_price) * pos.quantity
        else:
            pnl = (pos.entry_price - exit_price) * pos.quantity

        pnl -= commission
        self.cash += exit_price * pos.quantity - commission
        self.realized_pnl += pnl
        self.positions.remove(pos)

        logger.info(
            "Closed %s %s: %d shares @ %.2f, PnL=%.2f (cash=%.2f)",
            direction, ticker, pos.quantity, exit_price, pnl, self.cash,
        )
        return pnl

    def update_prices(self, prices: dict[str, float]) -> None:
        """Update current prices for all positions."""
        for pos in self.positions:
            if pos.ticker in prices:
                pos.current_price = prices[pos.ticker]
                if pos.direction == "BUY":
                    pos.unrealized_pnl = (pos.current_price - pos.entry_price) * pos.quantity
                else:
                    pos.unrealized_pnl = (pos.entry_price - pos.current_price) * pos.quantity

    @property
    def total_value(self) -> float:
        """Total portfolio value including unrealized P&L."""
        value = self.cash
        for pos in self.positions:
            value += pos.current_price * pos.quantity
            if pos.direction == "SHORT":
                # Short position value adjustment
                value += pos.unrealized_pnl
        return value

    @property
    def unrealized_pnl(self) -> float:
        return sum(p.unrealized_pnl for p in self.positions)

    @property
    def current_drawdown(self) -> float:
        """Current drawdown from peak equity as a percentage."""
        current = self.total_value
        if current > self.peak_value:
            self.peak_value = current
        if self.peak_value <= 0:
            return 0.0
        return (self.peak_value - current) / self.peak_value

    @property
    def daily_pnl(self) -> float:
        return self.total_value - self._daily_start_value

    def new_day(self) -> None:
        self._daily_start_value = self.total_value

    def snapshot(self) -> PortfolioSnapshot:
        """Take a snapshot of current portfolio state."""
        snap = PortfolioSnapshot(
            timestamp=datetime.now(timezone.utc),
            cash=self.cash,
            total_value=self.total_value,
            positions=[
                {
                    "ticker": p.ticker,
                    "direction": p.direction,
                    "entry_price": p.entry_price,
                    "quantity": p.quantity,
                    "current_price": p.current_price,
                    "unrealized_pnl": p.unrealized_pnl,
                    "strategy": p.strategy_name,
                }
                for p in self.positions
            ],
            daily_pnl=self.daily_pnl,
            cumulative_pnl=self.realized_pnl + self.unrealized_pnl,
            max_drawdown=self.current_drawdown,
        )
        self._snapshots.append(snap)
        return snap

    def get_positions_as_dicts(self) -> list[dict]:
        return [
            {
                "ticker": p.ticker,
                "direction": p.direction,
                "entry_price": p.entry_price,
                "quantity": p.quantity,
                "current_price": p.current_price,
                "unrealized_pnl": p.unrealized_pnl,
            }
            for p in self.positions
        ]

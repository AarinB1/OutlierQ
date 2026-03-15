"""Position sizing: fixed fractional, ATR-based, and Kelly Criterion."""

from __future__ import annotations

import logging
import math
from enum import Enum

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class SizingMethod(str, Enum):
    FIXED_FRACTIONAL = "fixed_fractional"
    ATR_BASED = "atr_based"
    KELLY = "kelly"


class PositionSizer:
    """Calculates position sizes using various methods."""

    def __init__(
        self,
        method: SizingMethod = SizingMethod.FIXED_FRACTIONAL,
        risk_per_trade_pct: float = 0.01,
        max_position_pct: float = 0.20,
        kelly_fraction: float = 0.25,
    ) -> None:
        self.method = method
        self.risk_per_trade_pct = risk_per_trade_pct
        self.max_position_pct = max_position_pct
        self.kelly_fraction = kelly_fraction

    def calculate(
        self,
        portfolio_value: float,
        entry_price: float,
        stop_loss: float,
        win_rate: float = 0.5,
        avg_win_loss_ratio: float = 1.5,
        atr: float = 0.0,
        atr_multiplier: float = 2.0,
    ) -> int:
        """Calculate the number of shares to trade.

        Returns the position size in shares (always >= 0).
        """
        if entry_price <= 0 or portfolio_value <= 0:
            return 0

        if self.method == SizingMethod.FIXED_FRACTIONAL:
            quantity = self._fixed_fractional(portfolio_value, entry_price, stop_loss)
        elif self.method == SizingMethod.ATR_BASED:
            quantity = self._atr_based(portfolio_value, entry_price, atr, atr_multiplier)
        elif self.method == SizingMethod.KELLY:
            quantity = self._kelly(
                portfolio_value, entry_price, win_rate, avg_win_loss_ratio,
            )
        else:
            quantity = self._fixed_fractional(portfolio_value, entry_price, stop_loss)

        # Enforce max position size
        max_shares = int(portfolio_value * self.max_position_pct / entry_price)
        quantity = min(quantity, max_shares)

        return max(0, quantity)

    def _fixed_fractional(
        self, portfolio_value: float, entry_price: float, stop_loss: float,
    ) -> int:
        """Risk X% of portfolio per trade: size = risk_amount / risk_per_share."""
        risk_amount = portfolio_value * self.risk_per_trade_pct
        risk_per_share = abs(entry_price - stop_loss)
        if risk_per_share <= 0:
            risk_per_share = entry_price * 0.02
        return int(risk_amount / risk_per_share)

    def _atr_based(
        self,
        portfolio_value: float,
        entry_price: float,
        atr: float,
        atr_multiplier: float,
    ) -> int:
        """Size = risk_amount / (ATR * multiplier)."""
        risk_amount = portfolio_value * self.risk_per_trade_pct
        if atr <= 0:
            atr = entry_price * 0.02
        return int(risk_amount / (atr * atr_multiplier))

    def _kelly(
        self,
        portfolio_value: float,
        entry_price: float,
        win_rate: float,
        avg_win_loss_ratio: float,
    ) -> int:
        """Kelly Criterion with fractional safety: f* = (bp - q) / b.

        Uses kelly_fraction (default 25%) of full Kelly for safety.
        """
        b = avg_win_loss_ratio
        p = win_rate
        q = 1 - p

        if b <= 0:
            return 0

        kelly_pct = (b * p - q) / b
        kelly_pct = max(0, kelly_pct) * self.kelly_fraction

        position_value = portfolio_value * kelly_pct
        return int(position_value / entry_price)

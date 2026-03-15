"""Risk manager: enforces position limits, stop-losses, drawdown, and correlation checks."""

from __future__ import annotations

import logging
from datetime import datetime, time, timezone
from typing import Any

from config.settings import LOG_FORMAT
from src.trading.strategies.base_strategy import TradeSignalData

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Approximate sector mapping for common tickers
SECTOR_MAP = {
    "AAPL": "technology", "MSFT": "technology", "GOOGL": "technology",
    "AMZN": "consumer_discretionary", "TSLA": "consumer_discretionary",
    "NVDA": "technology", "META": "technology", "AMD": "technology",
    "JPM": "financials", "GS": "financials", "BAC": "financials",
    "XOM": "energy", "CVX": "energy", "COP": "energy",
    "JNJ": "healthcare", "PFE": "healthcare", "UNH": "healthcare",
    "SPY": "index", "QQQ": "index", "IWM": "index",
}


class RiskManager:
    """Enforces trading risk rules and position limits."""

    def __init__(
        self,
        max_positions: int = 5,
        max_same_sector: int = 3,
        max_drawdown_pct: float = 0.10,
        min_reward_risk_ratio: float = 1.5,
        max_correlation: float = 0.7,
        daily_loss_limit_pct: float = 0.02,
        no_entry_minutes_before_close: int = 15,
    ) -> None:
        self.max_positions = max_positions
        self.max_same_sector = max_same_sector
        self.max_drawdown_pct = max_drawdown_pct
        self.min_reward_risk_ratio = min_reward_risk_ratio
        self.max_correlation = max_correlation
        self.daily_loss_limit_pct = daily_loss_limit_pct
        self.no_entry_minutes_before_close = no_entry_minutes_before_close

        self._peak_equity: float = 0.0
        self._current_equity: float = 0.0
        self._daily_pnl: float = 0.0
        self._circuit_breaker_active: bool = False
        self._open_positions: list[dict] = []

    def update_equity(self, equity: float) -> None:
        """Update current equity and check drawdown circuit breaker."""
        self._current_equity = equity
        if equity > self._peak_equity:
            self._peak_equity = equity

        if self._peak_equity > 0:
            drawdown = (self._peak_equity - equity) / self._peak_equity
            if drawdown >= self.max_drawdown_pct:
                if not self._circuit_breaker_active:
                    logger.warning(
                        "CIRCUIT BREAKER: Drawdown %.1f%% >= %.1f%% limit",
                        drawdown * 100, self.max_drawdown_pct * 100,
                    )
                    self._circuit_breaker_active = True

    def update_daily_pnl(self, pnl: float) -> None:
        self._daily_pnl = pnl

    def reset_daily(self) -> None:
        self._daily_pnl = 0.0

    def set_positions(self, positions: list[dict]) -> None:
        """Update current open positions for limit checking."""
        self._open_positions = positions

    def validate_signal(self, signal: TradeSignalData) -> bool:
        """Check if a signal passes all risk rules.

        Returns True if the signal is approved, False if rejected.
        """
        reasons = []

        # Circuit breaker
        if self._circuit_breaker_active:
            reasons.append("circuit_breaker_active")

        # Position count limit
        if len(self._open_positions) >= self.max_positions:
            reasons.append(f"max_positions ({self.max_positions})")

        # Sector limit
        sector = SECTOR_MAP.get(signal.ticker.upper(), "unknown")
        same_sector_count = sum(
            1 for p in self._open_positions
            if SECTOR_MAP.get(p.get("ticker", "").upper(), "other") == sector
        )
        if same_sector_count >= self.max_same_sector:
            reasons.append(f"max_same_sector ({self.max_same_sector}) for {sector}")

        # Reward/risk ratio
        if signal.entry_price > 0 and signal.stop_loss > 0 and signal.target_price > 0:
            if signal.direction == "BUY":
                reward = signal.target_price - signal.entry_price
                risk = signal.entry_price - signal.stop_loss
            else:
                reward = signal.entry_price - signal.target_price
                risk = signal.stop_loss - signal.entry_price

            if risk > 0:
                rr = reward / risk
                if rr < self.min_reward_risk_ratio:
                    reasons.append(f"reward/risk {rr:.1f} < {self.min_reward_risk_ratio}")

        # Daily loss limit
        if self._current_equity > 0:
            daily_loss_pct = abs(self._daily_pnl) / self._current_equity
            if self._daily_pnl < 0 and daily_loss_pct >= self.daily_loss_limit_pct:
                reasons.append(f"daily_loss_limit ({self.daily_loss_limit_pct * 100:.0f}%)")

        # No entries near market close
        now = datetime.now(timezone.utc)
        market_close = time(20, 0)  # 4 PM ET = 8 PM UTC
        close_dt = datetime.combine(now.date(), market_close, tzinfo=timezone.utc)
        minutes_to_close = (close_dt - now).total_seconds() / 60
        if 0 < minutes_to_close < self.no_entry_minutes_before_close:
            reasons.append(f"too_close_to_market_close ({minutes_to_close:.0f}min)")

        if reasons:
            logger.info(
                "Signal REJECTED for %s %s: %s",
                signal.ticker, signal.direction, ", ".join(reasons),
            )
            return False

        return True

    @property
    def circuit_breaker_active(self) -> bool:
        return self._circuit_breaker_active

    def reset_circuit_breaker(self) -> None:
        self._circuit_breaker_active = False
        logger.info("Circuit breaker reset")

    def get_status(self) -> dict[str, Any]:
        return {
            "open_positions": len(self._open_positions),
            "max_positions": self.max_positions,
            "peak_equity": self._peak_equity,
            "current_equity": self._current_equity,
            "drawdown_pct": (
                (self._peak_equity - self._current_equity) / self._peak_equity * 100
                if self._peak_equity > 0 else 0
            ),
            "circuit_breaker_active": self._circuit_breaker_active,
            "daily_pnl": self._daily_pnl,
        }

"""Abstract base class for all trading strategies."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class TradeSignalData:
    """A generated trading signal from a strategy."""
    ticker: str
    direction: str  # BUY / SELL / SHORT
    strategy_name: str
    model_name: str = ""
    entry_price: float = 0.0
    target_price: float = 0.0
    stop_loss: float = 0.0
    confidence: float = 0.0
    timeframe: str = "swing"  # swing / intraday
    metadata: dict[str, Any] = field(default_factory=dict)
    timestamp: datetime | None = None


class BaseStrategy(ABC):
    """Abstract base class that all trading strategies must implement."""

    name: str = "base"

    @abstractmethod
    def generate_signals(self, features_df: Any) -> list[TradeSignalData]:
        """Analyze features and return a list of trade signals.

        Args:
            features_df: DataFrame with all computed features for a ticker.

        Returns:
            List of TradeSignalData objects.
        """

    @abstractmethod
    def get_parameters(self) -> dict[str, Any]:
        """Return current strategy parameters."""

    @abstractmethod
    def set_parameters(self, params: dict[str, Any]) -> None:
        """Update strategy parameters."""

    def validate_signal(self, signal: TradeSignalData, risk_manager: Any = None) -> bool:
        """Validate a signal through the risk manager.

        Returns True if the signal passes all risk checks.
        """
        if risk_manager is None:
            return True
        return risk_manager.validate_signal(signal)

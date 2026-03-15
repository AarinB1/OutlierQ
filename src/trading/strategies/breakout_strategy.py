"""Breakout strategy: enter on confirmed consolidation break with volume.

BUY: Price breaks 20-day high AND volume > 2x average AND BB bandwidth expanding.
SHORT: Price breaks 20-day low with same volume confirmation.
ATR trailing stop.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd

from src.trading.strategies.base_strategy import BaseStrategy, TradeSignalData


class BreakoutStrategy(BaseStrategy):
    """Breakout strategy for 1-5 day swing trades."""

    name = "breakout"

    def __init__(
        self,
        lookback: int = 20,
        volume_multiplier: float = 2.0,
        atr_stop_multiplier: float = 2.0,
        atr_target_multiplier: float = 3.0,
        min_confidence: float = 0.5,
    ) -> None:
        self.lookback = lookback
        self.volume_multiplier = volume_multiplier
        self.atr_stop_multiplier = atr_stop_multiplier
        self.atr_target_multiplier = atr_target_multiplier
        self.min_confidence = min_confidence

    def generate_signals(self, features_df: pd.DataFrame) -> list[TradeSignalData]:
        signals = []
        if len(features_df) < self.lookback + 1:
            return signals

        row = features_df.iloc[-1]
        ticker = row.get("ticker", features_df.attrs.get("ticker", "UNKNOWN"))
        price = row.get("close", 0)
        atr = row.get("atr_14", 0)

        lookback_data = features_df.iloc[-(self.lookback + 1) : -1]
        high_20d = lookback_data["high"].max() if "high" in lookback_data.columns else price
        low_20d = lookback_data["low"].min() if "low" in lookback_data.columns else price

        buy_score = self._score_breakout_up(row, price, high_20d)
        short_score = self._score_breakout_down(row, price, low_20d)

        if buy_score >= self.min_confidence:
            signals.append(TradeSignalData(
                ticker=ticker,
                direction="BUY",
                strategy_name=self.name,
                entry_price=price,
                target_price=price + atr * self.atr_target_multiplier,
                stop_loss=price - atr * self.atr_stop_multiplier,
                confidence=buy_score,
                timeframe="swing",
                timestamp=datetime.now(timezone.utc),
                metadata={"reason": "breakout_up", "high_20d": high_20d},
            ))

        if short_score >= self.min_confidence:
            signals.append(TradeSignalData(
                ticker=ticker,
                direction="SHORT",
                strategy_name=self.name,
                entry_price=price,
                target_price=price - atr * self.atr_target_multiplier,
                stop_loss=price + atr * self.atr_stop_multiplier,
                confidence=short_score,
                timeframe="swing",
                timestamp=datetime.now(timezone.utc),
                metadata={"reason": "breakout_down", "low_20d": low_20d},
            ))

        return signals

    def _score_breakout_up(self, row: pd.Series, price: float, high_20d: float) -> float:
        score = 0.0
        n = 0

        # Price breaks above 20-day high
        if price > high_20d:
            score += 0.40
        n += 0.40

        # Volume > 2x average
        if row.get("relative_volume", 0) > self.volume_multiplier:
            score += 0.35
        n += 0.35

        # BB bandwidth expanding (increasing volatility)
        bb_bw = row.get("bb_bandwidth", 0)
        if bb_bw > 0.04:
            score += 0.25
        n += 0.25

        return score / n if n > 0 else 0.0

    def _score_breakout_down(self, row: pd.Series, price: float, low_20d: float) -> float:
        score = 0.0
        n = 0

        if price < low_20d:
            score += 0.40
        n += 0.40

        if row.get("relative_volume", 0) > self.volume_multiplier:
            score += 0.35
        n += 0.35

        bb_bw = row.get("bb_bandwidth", 0)
        if bb_bw > 0.04:
            score += 0.25
        n += 0.25

        return score / n if n > 0 else 0.0

    def get_parameters(self) -> dict[str, Any]:
        return {
            "lookback": self.lookback,
            "volume_multiplier": self.volume_multiplier,
            "atr_stop_multiplier": self.atr_stop_multiplier,
            "atr_target_multiplier": self.atr_target_multiplier,
            "min_confidence": self.min_confidence,
        }

    def set_parameters(self, params: dict[str, Any]) -> None:
        for key, value in params.items():
            if hasattr(self, key):
                setattr(self, key, value)

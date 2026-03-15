"""Momentum / Trend-following strategy.

BUY: EMA(9) > EMA(21) > EMA(50) AND RSI 40-70 AND MACD histogram positive
     AND ADX > 25 AND volume > 1.5x average.
SHORT: Inverse conditions.
Stop: 2x ATR. Target: 3x ATR.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd

from src.trading.strategies.base_strategy import BaseStrategy, TradeSignalData


class MomentumStrategy(BaseStrategy):
    """Trend-following momentum strategy for swing trades."""

    name = "momentum"

    def __init__(
        self,
        rsi_low: float = 40.0,
        rsi_high: float = 70.0,
        adx_threshold: float = 25.0,
        volume_threshold: float = 1.5,
        atr_stop_multiplier: float = 2.0,
        atr_target_multiplier: float = 3.0,
        min_confidence: float = 0.5,
    ) -> None:
        self.rsi_low = rsi_low
        self.rsi_high = rsi_high
        self.adx_threshold = adx_threshold
        self.volume_threshold = volume_threshold
        self.atr_stop_multiplier = atr_stop_multiplier
        self.atr_target_multiplier = atr_target_multiplier
        self.min_confidence = min_confidence

    def generate_signals(self, features_df: pd.DataFrame) -> list[TradeSignalData]:
        signals = []
        if len(features_df) < 2:
            return signals

        row = features_df.iloc[-1]
        ticker = row.get("ticker", features_df.attrs.get("ticker", "UNKNOWN"))
        price = row.get("close", 0)
        atr = row.get("atr_14", 0)

        buy_score = self._score_buy(row)
        short_score = self._score_short(row)

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
                metadata={"reason": "momentum_buy", "adx": row.get("adx_14", 0)},
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
                metadata={"reason": "momentum_short", "adx": row.get("adx_14", 0)},
            ))

        return signals

    def _score_buy(self, row: pd.Series) -> float:
        """Score buy conditions from 0.0 to 1.0."""
        score = 0.0
        factors = 0

        # EMA alignment
        if row.get("ema_bullish_alignment", 0) > 0:
            score += 0.25
        factors += 0.25

        # RSI in range
        rsi = row.get("rsi_14", 50)
        if self.rsi_low <= rsi <= self.rsi_high:
            score += 0.20
        factors += 0.20

        # MACD positive
        if row.get("macd_histogram", 0) > 0:
            score += 0.20
        factors += 0.20

        # ADX > threshold (strong trend)
        if row.get("adx_14", 0) > self.adx_threshold:
            score += 0.20
        factors += 0.20

        # Volume confirmation
        if row.get("relative_volume", 0) > self.volume_threshold:
            score += 0.15
        factors += 0.15

        return score / factors if factors > 0 else 0.0

    def _score_short(self, row: pd.Series) -> float:
        """Score short conditions (inverse of buy)."""
        score = 0.0
        factors = 0

        if row.get("ema_bearish_alignment", 0) > 0:
            score += 0.25
        factors += 0.25

        rsi = row.get("rsi_14", 50)
        if 30 <= rsi <= 60:
            score += 0.20
        factors += 0.20

        if row.get("macd_histogram", 0) < 0:
            score += 0.20
        factors += 0.20

        if row.get("adx_14", 0) > self.adx_threshold:
            score += 0.20
        factors += 0.20

        if row.get("relative_volume", 0) > self.volume_threshold:
            score += 0.15
        factors += 0.15

        return score / factors if factors > 0 else 0.0

    def get_parameters(self) -> dict[str, Any]:
        return {
            "rsi_low": self.rsi_low,
            "rsi_high": self.rsi_high,
            "adx_threshold": self.adx_threshold,
            "volume_threshold": self.volume_threshold,
            "atr_stop_multiplier": self.atr_stop_multiplier,
            "atr_target_multiplier": self.atr_target_multiplier,
            "min_confidence": self.min_confidence,
        }

    def set_parameters(self, params: dict[str, Any]) -> None:
        for key, value in params.items():
            if hasattr(self, key):
                setattr(self, key, value)

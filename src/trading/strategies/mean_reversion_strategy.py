"""Mean reversion strategy: fade extreme moves expecting price reversion.

BUY: RSI(2) < 10 OR below lower BB OR VWAP deviation < -1.5%.
SHORT: RSI(2) > 90 OR above upper BB OR VWAP deviation > 1.5%.
Target: Mean/VWAP reversion. Stop: 1.5x ATR.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd

from src.trading.strategies.base_strategy import BaseStrategy, TradeSignalData


class MeanReversionStrategy(BaseStrategy):
    """Mean reversion strategy for intraday to 3-day trades."""

    name = "mean_reversion"

    def __init__(
        self,
        rsi2_buy_threshold: float = 10.0,
        rsi2_short_threshold: float = 90.0,
        vwap_deviation_threshold: float = 1.5,
        atr_stop_multiplier: float = 1.5,
        min_confidence: float = 0.5,
    ) -> None:
        self.rsi2_buy_threshold = rsi2_buy_threshold
        self.rsi2_short_threshold = rsi2_short_threshold
        self.vwap_deviation_threshold = vwap_deviation_threshold
        self.atr_stop_multiplier = atr_stop_multiplier
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
            vwap = row.get("vwap", price)
            target = vwap if vwap > price else price + atr
            signals.append(TradeSignalData(
                ticker=ticker,
                direction="BUY",
                strategy_name=self.name,
                entry_price=price,
                target_price=target,
                stop_loss=price - atr * self.atr_stop_multiplier,
                confidence=buy_score,
                timeframe="swing",
                timestamp=datetime.now(timezone.utc),
                metadata={"reason": "mean_reversion_buy", "rsi2": row.get("rsi_2", 50)},
            ))

        if short_score >= self.min_confidence:
            vwap = row.get("vwap", price)
            target = vwap if vwap < price else price - atr
            signals.append(TradeSignalData(
                ticker=ticker,
                direction="SHORT",
                strategy_name=self.name,
                entry_price=price,
                target_price=target,
                stop_loss=price + atr * self.atr_stop_multiplier,
                confidence=short_score,
                timeframe="swing",
                timestamp=datetime.now(timezone.utc),
                metadata={"reason": "mean_reversion_short", "rsi2": row.get("rsi_2", 50)},
            ))

        return signals

    def _score_buy(self, row: pd.Series) -> float:
        score = 0.0
        n = 0

        # RSI(2) oversold
        rsi2 = row.get("rsi_2", 50)
        if rsi2 < self.rsi2_buy_threshold:
            score += 0.35
        n += 0.35

        # Below lower Bollinger Band
        bb_pct_b = row.get("bb_pct_b", 0.5)
        if bb_pct_b < 0.0:
            score += 0.35
        n += 0.35

        # VWAP deviation negative
        vwap_dev = row.get("vwap_deviation_pct", 0)
        if vwap_dev < -self.vwap_deviation_threshold:
            score += 0.30
        n += 0.30

        return score / n if n > 0 else 0.0

    def _score_short(self, row: pd.Series) -> float:
        score = 0.0
        n = 0

        rsi2 = row.get("rsi_2", 50)
        if rsi2 > self.rsi2_short_threshold:
            score += 0.35
        n += 0.35

        bb_pct_b = row.get("bb_pct_b", 0.5)
        if bb_pct_b > 1.0:
            score += 0.35
        n += 0.35

        vwap_dev = row.get("vwap_deviation_pct", 0)
        if vwap_dev > self.vwap_deviation_threshold:
            score += 0.30
        n += 0.30

        return score / n if n > 0 else 0.0

    def get_parameters(self) -> dict[str, Any]:
        return {
            "rsi2_buy_threshold": self.rsi2_buy_threshold,
            "rsi2_short_threshold": self.rsi2_short_threshold,
            "vwap_deviation_threshold": self.vwap_deviation_threshold,
            "atr_stop_multiplier": self.atr_stop_multiplier,
            "min_confidence": self.min_confidence,
        }

    def set_parameters(self, params: dict[str, Any]) -> None:
        for key, value in params.items():
            if hasattr(self, key):
                setattr(self, key, value)

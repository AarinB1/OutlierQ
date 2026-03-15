"""Meta-strategy using regime detection to select and weight sub-strategies.

Bull -> momentum + ml. Bear -> mean_reversion + short bias.
Sideways -> mean_reversion only. High vol -> 50% position reduction.
Majority voting with confidence weighting.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from config.settings import LOG_FORMAT
from src.trading.models.regime_detector import RegimeDetector
from src.trading.strategies.base_strategy import BaseStrategy, TradeSignalData

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

REGIME_STRATEGY_MAP = {
    "bull_trend": ["momentum", "ml_ensemble"],
    "bear_trend": ["mean_reversion", "ml_ensemble"],
    "sideways": ["mean_reversion"],
    "high_vol": ["mean_reversion"],
}


class EnsembleStrategy(BaseStrategy):
    """Combines multiple strategies with regime-aware selection and weighting."""

    name = "ensemble"

    def __init__(
        self,
        strategies: dict[str, BaseStrategy] | None = None,
        regime_detector: RegimeDetector | None = None,
        min_agreement: int = 1,
        min_confidence: float = 0.5,
        high_vol_position_reduction: float = 0.5,
    ) -> None:
        self.strategies = strategies or {}
        self.regime_detector = regime_detector or RegimeDetector()
        self.min_agreement = min_agreement
        self.min_confidence = min_confidence
        self.high_vol_position_reduction = high_vol_position_reduction

    def register_strategy(self, strategy: BaseStrategy) -> None:
        self.strategies[strategy.name] = strategy

    def generate_signals(self, features_df: pd.DataFrame) -> list[TradeSignalData]:
        if not self.strategies or len(features_df) < 2:
            return []

        # Detect regime
        regime_features = self.regime_detector.get_regime_features(features_df)
        if regime_features.empty:
            regime, regime_conf = "sideways", 0.5
        else:
            regime, regime_conf = self.regime_detector.predict(regime_features)

        logger.info("Detected regime: %s (confidence=%.2f)", regime, regime_conf)

        # Select active strategies based on regime
        active_names = REGIME_STRATEGY_MAP.get(regime, list(self.strategies.keys()))
        active_strategies = {
            name: s for name, s in self.strategies.items() if name in active_names
        }

        if not active_strategies:
            active_strategies = self.strategies

        # Collect signals from all active strategies
        all_signals: list[TradeSignalData] = []
        for name, strategy in active_strategies.items():
            try:
                sigs = strategy.generate_signals(features_df)
                all_signals.extend(sigs)
            except Exception as e:
                logger.warning("Strategy %s failed: %s", name, e)

        if not all_signals:
            return []

        # Aggregate by direction using confidence-weighted voting
        buy_signals = [s for s in all_signals if s.direction == "BUY"]
        short_signals = [s for s in all_signals if s.direction == "SHORT"]

        final_signals = []

        if len(buy_signals) >= self.min_agreement:
            avg_conf = sum(s.confidence for s in buy_signals) / len(buy_signals)
            if avg_conf >= self.min_confidence:
                best = max(buy_signals, key=lambda s: s.confidence)
                best.confidence = avg_conf
                best.strategy_name = self.name
                best.metadata["regime"] = regime
                best.metadata["contributing_strategies"] = [s.strategy_name for s in buy_signals]
                if regime == "high_vol":
                    best.confidence *= self.high_vol_position_reduction
                final_signals.append(best)

        if len(short_signals) >= self.min_agreement:
            avg_conf = sum(s.confidence for s in short_signals) / len(short_signals)
            if avg_conf >= self.min_confidence:
                best = max(short_signals, key=lambda s: s.confidence)
                best.confidence = avg_conf
                best.strategy_name = self.name
                best.metadata["regime"] = regime
                best.metadata["contributing_strategies"] = [s.strategy_name for s in short_signals]
                if regime == "high_vol":
                    best.confidence *= self.high_vol_position_reduction
                final_signals.append(best)

        return final_signals

    def get_parameters(self) -> dict[str, Any]:
        return {
            "min_agreement": self.min_agreement,
            "min_confidence": self.min_confidence,
            "high_vol_position_reduction": self.high_vol_position_reduction,
            "active_strategies": list(self.strategies.keys()),
        }

    def set_parameters(self, params: dict[str, Any]) -> None:
        for key, value in params.items():
            if hasattr(self, key):
                setattr(self, key, value)

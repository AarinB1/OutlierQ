"""Pure ML signal strategy using the ensemble model.

BUY when ensemble predicts UP with confidence > 0.6.
SHORT when ensemble predicts DOWN with confidence > 0.6.
HOLD otherwise. Position size scales with confidence.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
import torch

from src.trading.models.ensemble import TradingEnsemble
from src.trading.strategies.base_strategy import BaseStrategy, TradeSignalData


class MLStrategy(BaseStrategy):
    """Pure ML-driven strategy using the ensemble model."""

    name = "ml_ensemble"

    def __init__(
        self,
        ensemble: TradingEnsemble | None = None,
        min_confidence: float = 0.6,
        window_size: int = 60,
        atr_stop_multiplier: float = 2.0,
        atr_target_multiplier: float = 3.0,
        device: str = "cpu",
    ) -> None:
        self.ensemble = ensemble
        self.min_confidence = min_confidence
        self.window_size = window_size
        self.atr_stop_multiplier = atr_stop_multiplier
        self.atr_target_multiplier = atr_target_multiplier
        self.device = device

    def generate_signals(self, features_df: pd.DataFrame) -> list[TradeSignalData]:
        signals = []
        if self.ensemble is None or len(features_df) < self.window_size:
            return signals

        row = features_df.iloc[-1]
        ticker = row.get("ticker", features_df.attrs.get("ticker", "UNKNOWN"))
        price = row.get("close", 0)
        atr = row.get("atr_14", 0)

        # Prepare input for neural models
        feature_cols = [c for c in features_df.columns if c not in ("ticker",)]
        window = features_df[feature_cols].iloc[-self.window_size:].values
        x = torch.tensor(window, dtype=torch.float32).unsqueeze(0)

        # Prepare GBM input (last row only)
        x_gbm = features_df[feature_cols].iloc[-1].values.astype(np.float32)

        # Get regime for weight adjustment
        regime = "sideways"
        if "regime_bull" in row and row["regime_bull"] > 0:
            regime = "bull_trend"
        elif "regime_bear" in row and row["regime_bear"] > 0:
            regime = "bear_trend"
        elif "regime_high_vol" in row and row.get("regime_high_vol", 0) > 0:
            regime = "high_vol"

        prediction = self.ensemble.predict(x, x_gbm, regime=regime, device=self.device)

        if prediction.direction == "BUY" and prediction.confidence >= self.min_confidence:
            signals.append(TradeSignalData(
                ticker=ticker,
                direction="BUY",
                strategy_name=self.name,
                model_name="ensemble",
                entry_price=price,
                target_price=price + atr * self.atr_target_multiplier,
                stop_loss=price - atr * self.atr_stop_multiplier,
                confidence=prediction.confidence,
                timeframe="swing",
                timestamp=datetime.now(timezone.utc),
                metadata={
                    "reason": "ml_buy",
                    "model_predictions": {
                        k: v["direction"] for k, v in prediction.model_predictions.items()
                    },
                    "class_probabilities": prediction.class_probabilities,
                },
            ))

        if prediction.direction == "SELL" and prediction.confidence >= self.min_confidence:
            signals.append(TradeSignalData(
                ticker=ticker,
                direction="SHORT",
                strategy_name=self.name,
                model_name="ensemble",
                entry_price=price,
                target_price=price - atr * self.atr_target_multiplier,
                stop_loss=price + atr * self.atr_stop_multiplier,
                confidence=prediction.confidence,
                timeframe="swing",
                timestamp=datetime.now(timezone.utc),
                metadata={
                    "reason": "ml_short",
                    "model_predictions": {
                        k: v["direction"] for k, v in prediction.model_predictions.items()
                    },
                    "class_probabilities": prediction.class_probabilities,
                },
            ))

        return signals

    def get_parameters(self) -> dict[str, Any]:
        return {
            "min_confidence": self.min_confidence,
            "window_size": self.window_size,
            "atr_stop_multiplier": self.atr_stop_multiplier,
            "atr_target_multiplier": self.atr_target_multiplier,
        }

    def set_parameters(self, params: dict[str, Any]) -> None:
        for key, value in params.items():
            if hasattr(self, key):
                setattr(self, key, value)

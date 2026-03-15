"""Weighted ensemble of LSTM, Transformer, Hybrid, and GBM models.

Default weights: LSTM(0.25) + Transformer(0.25) + Hybrid(0.35) + GBM(0.15).
Weights are configurable and regime-adjustable.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


@dataclass
class EnsemblePrediction:
    """Result of an ensemble prediction."""
    direction: str  # BUY / SELL / HOLD
    confidence: float
    class_probabilities: dict[str, float]
    model_predictions: dict[str, dict]


DEFAULT_WEIGHTS = {
    "lstm": 0.25,
    "transformer": 0.25,
    "hybrid": 0.35,
    "gbm": 0.15,
}

REGIME_WEIGHT_ADJUSTMENTS = {
    "bull_trend": {"lstm": 0.20, "transformer": 0.25, "hybrid": 0.40, "gbm": 0.15},
    "bear_trend": {"lstm": 0.30, "transformer": 0.20, "hybrid": 0.35, "gbm": 0.15},
    "sideways": {"lstm": 0.25, "transformer": 0.20, "hybrid": 0.30, "gbm": 0.25},
    "high_vol": {"lstm": 0.20, "transformer": 0.30, "hybrid": 0.35, "gbm": 0.15},
}

DIRECTION_MAP = {0: "SELL", 1: "HOLD", 2: "BUY"}


class TradingEnsemble:
    """Combines predictions from multiple models with configurable weights."""

    def __init__(
        self,
        weights: dict[str, float] | None = None,
        regime_adaptive: bool = True,
    ) -> None:
        self.base_weights = weights or DEFAULT_WEIGHTS.copy()
        self.regime_adaptive = regime_adaptive
        self.models: dict[str, nn.Module] = {}
        self.gbm_model = None

    def register_model(self, name: str, model: nn.Module) -> None:
        self.models[name] = model

    def register_gbm(self, model) -> None:
        self.gbm_model = model

    def predict(
        self,
        x: torch.Tensor,
        x_gbm: np.ndarray | None = None,
        regime: str = "sideways",
        device: str = "cpu",
    ) -> EnsemblePrediction:
        """Generate an ensemble prediction from all registered models.

        Args:
            x: Input tensor (batch=1, window, features) for neural models.
            x_gbm: Feature array for GBM model (1D or 2D).
            regime: Current market regime for weight adjustment.
            device: PyTorch device.

        Returns:
            EnsemblePrediction with direction, confidence, and per-model details.
        """
        weights = self._get_weights(regime)
        all_probs = {}
        model_preds = {}

        for name, model in self.models.items():
            if name not in weights:
                continue
            try:
                model.eval()
                with torch.no_grad():
                    logits = model(x.to(device))
                    probs = torch.softmax(logits, dim=-1).cpu().numpy()[0]
                all_probs[name] = probs
                pred_idx = int(np.argmax(probs))
                model_preds[name] = {
                    "direction": DIRECTION_MAP[pred_idx],
                    "confidence": float(probs[pred_idx]),
                    "probabilities": {DIRECTION_MAP[i]: float(p) for i, p in enumerate(probs)},
                }
            except Exception as e:
                logger.warning("Model %s prediction failed: %s", name, e)

        if self.gbm_model is not None and x_gbm is not None and "gbm" in weights:
            try:
                if x_gbm.ndim == 1:
                    x_gbm = x_gbm.reshape(1, -1)
                probs = self.gbm_model.predict_proba(x_gbm)[0]
                all_probs["gbm"] = probs
                pred_idx = int(np.argmax(probs))
                model_preds["gbm"] = {
                    "direction": DIRECTION_MAP[pred_idx],
                    "confidence": float(probs[pred_idx]),
                    "probabilities": {DIRECTION_MAP[i]: float(p) for i, p in enumerate(probs)},
                }
            except Exception as e:
                logger.warning("GBM prediction failed: %s", e)

        if not all_probs:
            return EnsemblePrediction(
                direction="HOLD", confidence=0.0,
                class_probabilities={"SELL": 0.33, "HOLD": 0.34, "BUY": 0.33},
                model_predictions={},
            )

        # Weighted average of probabilities
        total_weight = sum(weights.get(name, 0) for name in all_probs)
        if total_weight == 0:
            total_weight = 1.0

        ensemble_probs = np.zeros(3)
        for name, probs in all_probs.items():
            w = weights.get(name, 0) / total_weight
            ensemble_probs += w * probs

        pred_idx = int(np.argmax(ensemble_probs))
        direction = DIRECTION_MAP[pred_idx]
        confidence = float(ensemble_probs[pred_idx])

        return EnsemblePrediction(
            direction=direction,
            confidence=confidence,
            class_probabilities={DIRECTION_MAP[i]: float(p) for i, p in enumerate(ensemble_probs)},
            model_predictions=model_preds,
        )

    def _get_weights(self, regime: str) -> dict[str, float]:
        if self.regime_adaptive and regime in REGIME_WEIGHT_ADJUSTMENTS:
            return REGIME_WEIGHT_ADJUSTMENTS[regime]
        return self.base_weights

    def save_models(self, directory: Path) -> None:
        """Save all PyTorch models to disk."""
        directory.mkdir(parents=True, exist_ok=True)
        for name, model in self.models.items():
            path = directory / f"{name}_model.pt"
            torch.save(model.state_dict(), path)
            logger.info("Saved %s model to %s", name, path)

    def load_models(
        self,
        directory: Path,
        model_factories: dict[str, callable],
        device: str = "cpu",
    ) -> None:
        """Load PyTorch models from disk using factory functions."""
        for name, factory in model_factories.items():
            path = directory / f"{name}_model.pt"
            if path.exists():
                model = factory()
                model.load_state_dict(torch.load(path, map_location=device))
                model.to(device)
                self.models[name] = model
                logger.info("Loaded %s model from %s", name, path)

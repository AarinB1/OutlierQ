"""Evaluate saved trading model checkpoints."""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch

from config.settings import CACHE_DIR, LOG_FORMAT
from src.trading.data.data_preprocessor import DataPreprocessor
from src.trading.features.feature_pipeline import FeaturePipeline
from src.trading.models.hybrid_model import HybridLSTMTransformer
from src.trading.models.lstm_model import LSTMPredictor
from src.trading.models.transformer_model import TransformerPredictor

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

MODEL_DIR = CACHE_DIR / "trading_models"


@dataclass
class ModelEvaluation:
    model_name: str
    accuracy: float
    directional_accuracy: float
    confusion_matrix: list[list[int]]
    precision_per_class: dict[str, float]
    recall_per_class: dict[str, float]


class ModelEvaluator:
    """Loads saved checkpoints and compares test-set behavior."""

    def __init__(self, device: str = "cpu") -> None:
        self.device = device

    def evaluate_all(
        self,
        ticker: str = "SPY",
        period: str = "2y",
        window_size: int = 60,
    ) -> list[ModelEvaluation]:
        pipeline = FeaturePipeline()
        features_df = pipeline.build_features(ticker, period=period, include_sentiment=False)
        if features_df.empty:
            return []

        dataset = DataPreprocessor(window_size=window_size).create_sequences(
            features_df,
            target_col="close",
            exclude_cols=["open", "high", "low", "volume", "adj_close"],
        )
        if len(dataset.X_test) == 0:
            return []

        input_size = dataset.X_test.shape[2]
        test_X = torch.tensor(dataset.X_test, dtype=torch.float32).to(self.device)
        targets = dataset.y_test

        constructors = {
            "lstm": lambda: LSTMPredictor(input_size=input_size),
            "transformer": lambda: TransformerPredictor(input_size=input_size),
            "hybrid": lambda: HybridLSTMTransformer(input_size=input_size),
        }

        results: list[ModelEvaluation] = []
        for model_name, constructor in constructors.items():
            ckpt = MODEL_DIR / f"{model_name}_model.pt"
            if not ckpt.exists():
                continue
            model = constructor().to(self.device)
            model.load_state_dict(torch.load(ckpt, map_location=self.device))
            model.eval()
            with torch.no_grad():
                preds = model(test_X).argmax(dim=-1).cpu().numpy()
            results.append(self._compute_metrics(model_name, preds, targets))
        return results

    def compare(self, ticker: str = "SPY", period: str = "2y", window_size: int = 60) -> list[dict[str, Any]]:
        return [asdict(row) for row in self.evaluate_all(ticker=ticker, period=period, window_size=window_size)]

    @staticmethod
    def _compute_metrics(model_name: str, predictions: np.ndarray, targets: np.ndarray) -> ModelEvaluation:
        accuracy = float(np.mean(predictions == targets))
        cm = np.zeros((3, 3), dtype=int)
        for p, t in zip(predictions, targets):
            cm[int(t), int(p)] += 1

        labels = {0: "SELL", 1: "HOLD", 2: "BUY"}
        precision = {}
        recall = {}
        for i, label in labels.items():
            tp = float(cm[i, i])
            fp = float(cm[:, i].sum() - tp)
            fn = float(cm[i, :].sum() - tp)
            precision[label] = tp / (tp + fp) if (tp + fp) else 0.0
            recall[label] = tp / (tp + fn) if (tp + fn) else 0.0

        directional_mask = (targets != 1) | (predictions != 1)
        if directional_mask.sum() > 0:
            directional_acc = float(np.mean(predictions[directional_mask] == targets[directional_mask]))
        else:
            directional_acc = 0.0

        return ModelEvaluation(
            model_name=model_name,
            accuracy=accuracy,
            directional_accuracy=directional_acc,
            confusion_matrix=cm.tolist(),
            precision_per_class=precision,
            recall_per_class=recall,
        )

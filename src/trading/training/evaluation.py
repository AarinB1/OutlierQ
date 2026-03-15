"""Model evaluation and comparison across checkpoints."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from config.settings import LOG_FORMAT
from src.trading.data.data_preprocessor import DataPreprocessor, WindowedDataset
from src.trading.features.feature_pipeline import FeaturePipeline
from src.trading.models.lstm_model import LSTMPredictor
from src.trading.models.transformer_model import TransformerPredictor
from src.trading.models.hybrid_model import HybridLSTMTransformer

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

MODEL_DIR = Path(".cache/trading_models")


@dataclass
class ModelEvaluation:
    model_name: str
    accuracy: float
    precision_per_class: dict[str, float]
    recall_per_class: dict[str, float]
    confusion_matrix: list[list[int]]
    directional_accuracy: float


class ModelEvaluator:
    """Evaluates and compares trained trading models."""

    def __init__(self, device: str = "cpu") -> None:
        self.device = device

    def evaluate_all(
        self,
        ticker: str = "SPY",
        period: str = "2y",
        window_size: int = 60,
    ) -> list[ModelEvaluation]:
        """Evaluate all saved model checkpoints on test data."""
        pipeline = FeaturePipeline()
        features_df = pipeline.build_features(ticker, period=period, include_sentiment=False)
        if features_df.empty:
            return []

        preprocessor = DataPreprocessor(window_size=window_size)
        dataset = preprocessor.create_sequences(
            features_df,
            target_col="close",
            exclude_cols=["open", "high", "low", "volume", "adj_close"],
        )

        input_size = dataset.X_test.shape[2]
        test_X = torch.tensor(dataset.X_test, dtype=torch.float32).to(self.device)
        test_y = dataset.y_test

        results = []
        model_configs = {
            "lstm": lambda: LSTMPredictor(input_size=input_size),
            "transformer": lambda: TransformerPredictor(input_size=input_size),
            "hybrid": lambda: HybridLSTMTransformer(input_size=input_size),
        }

        for name, factory in model_configs.items():
            path = MODEL_DIR / f"{name}_model.pt"
            if not path.exists():
                continue

            model = factory()
            model.load_state_dict(torch.load(path, map_location=self.device))
            model.to(self.device)
            model.eval()

            with torch.no_grad():
                output = model(test_X)
                preds = output.argmax(dim=-1).cpu().numpy()

            evaluation = self._compute_evaluation(name, preds, test_y)
            results.append(evaluation)
            logger.info(
                "%s: accuracy=%.3f, directional_acc=%.3f",
                name, evaluation.accuracy, evaluation.directional_accuracy,
            )

        return results

    def _compute_evaluation(
        self, model_name: str, predictions: np.ndarray, targets: np.ndarray,
    ) -> ModelEvaluation:
        accuracy = float(np.mean(predictions == targets))

        # Confusion matrix (3x3: DOWN, HOLD, UP)
        n_classes = 3
        cm = np.zeros((n_classes, n_classes), dtype=int)
        for pred, true in zip(predictions, targets):
            cm[true][pred] += 1

        # Per-class precision and recall
        labels = {0: "SELL", 1: "HOLD", 2: "BUY"}
        precision = {}
        recall = {}
        for i, label in labels.items():
            tp = cm[i][i]
            fp = sum(cm[j][i] for j in range(n_classes)) - tp
            fn = sum(cm[i]) - tp
            precision[label] = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            recall[label] = tp / (tp + fn) if (tp + fn) > 0 else 0.0

        # Directional accuracy (ignoring HOLD)
        mask = (targets != 1) | (predictions != 1)
        directional_acc = float(np.mean(predictions[mask] == targets[mask])) if mask.sum() > 0 else 0.0

        return ModelEvaluation(
            model_name=model_name,
            accuracy=accuracy,
            precision_per_class=precision,
            recall_per_class=recall,
            confusion_matrix=cm.tolist(),
            directional_accuracy=directional_acc,
        )

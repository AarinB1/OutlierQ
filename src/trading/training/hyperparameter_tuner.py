"""Optuna-based hyperparameter optimization for trading models."""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from config.settings import LOG_FORMAT
from src.trading.data.data_preprocessor import DataPreprocessor, WindowedDataset
from src.trading.features.feature_pipeline import FeaturePipeline
from src.trading.models.hybrid_model import HybridLSTMTransformer

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class HyperparameterTuner:
    """Optuna-based hyperparameter search for trading models."""

    def __init__(
        self,
        n_trials: int = 50,
        ticker: str = "SPY",
        period: str = "2y",
        device: str = "cpu",
    ) -> None:
        self.n_trials = n_trials
        self.ticker = ticker
        self.period = period
        self.device = device
        self._dataset: WindowedDataset | None = None

    def _prepare_data(self, window_size: int) -> WindowedDataset:
        pipeline = FeaturePipeline()
        features_df = pipeline.build_features(self.ticker, period=self.period, include_sentiment=False)
        preprocessor = DataPreprocessor(window_size=window_size)
        return preprocessor.create_sequences(
            features_df,
            target_col="close",
            exclude_cols=["open", "high", "low", "volume", "adj_close"],
        )

    def run(self) -> dict[str, Any]:
        """Run hyperparameter optimization. Returns best params and score."""
        try:
            import optuna
        except ImportError:
            logger.error("optuna not installed. Run: pip install optuna")
            return {"error": "optuna not installed"}

        def objective(trial: optuna.Trial) -> float:
            lr = trial.suggest_float("learning_rate", 1e-4, 1e-2, log=True)
            hidden_size = trial.suggest_categorical("hidden_size", [32, 64, 128])
            num_layers = trial.suggest_int("num_layers", 1, 3)
            dropout = trial.suggest_float("dropout", 0.1, 0.4)
            window_size = trial.suggest_categorical("window_size", [20, 40, 60, 120])
            batch_size = trial.suggest_categorical("batch_size", [32, 64, 128])

            dataset = self._prepare_data(window_size)
            input_size = dataset.X_train.shape[2]

            model = HybridLSTMTransformer(
                input_size=input_size,
                lstm_hidden=hidden_size,
                d_model=hidden_size,
                num_transformer_layers=num_layers,
                dropout=dropout,
            ).to(self.device)

            optimizer = torch.optim.Adam(model.parameters(), lr=lr)
            criterion = nn.CrossEntropyLoss()

            train_loader = DataLoader(
                TensorDataset(
                    torch.tensor(dataset.X_train, dtype=torch.float32),
                    torch.tensor(dataset.y_train, dtype=torch.long),
                ),
                batch_size=batch_size,
                shuffle=True,
            )
            val_X = torch.tensor(dataset.X_val, dtype=torch.float32).to(self.device)
            val_y = torch.tensor(dataset.y_val, dtype=torch.long).to(self.device)

            best_val_loss = float("inf")
            for epoch in range(30):
                model.train()
                for X_batch, y_batch in train_loader:
                    X_batch = X_batch.to(self.device)
                    y_batch = y_batch.to(self.device)
                    optimizer.zero_grad()
                    output = model(X_batch)
                    loss = criterion(output, y_batch)
                    loss.backward()
                    optimizer.step()

                model.eval()
                with torch.no_grad():
                    val_output = model(val_X)
                    val_loss = criterion(val_output, val_y).item()

                best_val_loss = min(best_val_loss, val_loss)

                trial.report(val_loss, epoch)
                if trial.should_prune():
                    raise optuna.TrialPruned()

            return best_val_loss

        study = optuna.create_study(
            direction="minimize",
            pruner=optuna.pruners.MedianPruner(),
        )
        study.optimize(objective, n_trials=self.n_trials, show_progress_bar=True)

        best = study.best_trial
        logger.info("Best trial: val_loss=%.4f, params=%s", best.value, best.params)

        return {
            "best_val_loss": best.value,
            "best_params": best.params,
            "n_trials": len(study.trials),
        }

    def get_search_space(self) -> dict:
        """Return the hyperparameter search space definition."""
        return {
            "learning_rate": {"type": "float", "range": [1e-4, 1e-2], "log": True},
            "hidden_size": {"type": "categorical", "values": [32, 64, 128]},
            "num_layers": {"type": "int", "range": [1, 3]},
            "dropout": {"type": "float", "range": [0.1, 0.4]},
            "window_size": {"type": "categorical", "values": [20, 40, 60, 120]},
            "batch_size": {"type": "categorical", "values": [32, 64, 128]},
        }

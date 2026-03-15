"""Optuna tuner for trading model hyperparameters."""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from config.settings import LOG_FORMAT
from src.trading.data.data_preprocessor import DataPreprocessor
from src.trading.features.feature_pipeline import FeaturePipeline
from src.trading.models.hybrid_model import HybridLSTMTransformer

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class HyperparameterTuner:
    """Runs Optuna search targeting validation Sharpe proxy."""

    def __init__(
        self,
        n_trials: int = 20,
        ticker: str = "SPY",
        period: str = "2y",
        device: str = "cpu",
        max_epochs_per_trial: int = 15,
    ) -> None:
        self.n_trials = n_trials
        self.ticker = ticker
        self.period = period
        self.device = device
        self.max_epochs_per_trial = max_epochs_per_trial

    def _prepare_data(self, window_size: int):
        pipeline = FeaturePipeline()
        features_df = pipeline.build_features(self.ticker, period=self.period, include_sentiment=False)
        if features_df.empty:
            return None
        prep = DataPreprocessor(window_size=window_size, prediction_horizon=5)
        return prep.create_sequences(
            features_df,
            target_col="close",
            exclude_cols=["open", "high", "low", "volume", "adj_close"],
        )

    @staticmethod
    def _sharpe_proxy(preds: np.ndarray, y_true: np.ndarray) -> float:
        # Map classes 0,1,2 to directional returns -1,0,1 for a coarse Sharpe proxy.
        mapping = {0: -1.0, 1: 0.0, 2: 1.0}
        pred_dir = np.vectorize(mapping.get)(preds)
        true_dir = np.vectorize(mapping.get)(y_true)
        pnl = pred_dir * true_dir
        if pnl.size < 2:
            return 0.0
        std = float(np.std(pnl, ddof=1))
        if std == 0:
            return 0.0
        return float(np.mean(pnl) / std * np.sqrt(252))

    def run(self) -> dict[str, Any]:
        try:
            import optuna
        except ImportError:
            return {"error": "optuna not installed"}

        def objective(trial):
            lr = trial.suggest_float("learning_rate", 1e-4, 1e-2, log=True)
            hidden_size = trial.suggest_categorical("hidden_size", [32, 64, 128])
            num_layers = trial.suggest_int("num_layers", 1, 3)
            dropout = trial.suggest_float("dropout", 0.1, 0.4)
            window_size = trial.suggest_categorical("window_size", [20, 40, 60, 120])
            batch_size = trial.suggest_categorical("batch_size", [32, 64, 128])

            dataset = self._prepare_data(window_size=window_size)
            if dataset is None or len(dataset.X_train) == 0 or len(dataset.X_val) == 0:
                raise optuna.TrialPruned()

            model = HybridLSTMTransformer(
                input_size=dataset.X_train.shape[2],
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

            best_sharpe = -999.0
            for epoch in range(self.max_epochs_per_trial):
                model.train()
                for X_batch, y_batch in train_loader:
                    X_batch = X_batch.to(self.device)
                    y_batch = y_batch.to(self.device)
                    optimizer.zero_grad()
                    logits = model(X_batch)
                    loss = criterion(logits, y_batch)
                    loss.backward()
                    optimizer.step()

                model.eval()
                with torch.no_grad():
                    val_logits = model(val_X)
                    val_preds = val_logits.argmax(dim=-1).cpu().numpy()
                sharpe = self._sharpe_proxy(val_preds, dataset.y_val)
                best_sharpe = max(best_sharpe, sharpe)
                trial.report(best_sharpe, step=epoch)
                if trial.should_prune():
                    raise optuna.TrialPruned()
            return best_sharpe

        study = optuna.create_study(direction="maximize", pruner=optuna.pruners.MedianPruner())
        study.optimize(objective, n_trials=self.n_trials, show_progress_bar=False)
        best = study.best_trial
        logger.info("Best trial Sharpe proxy=%.3f params=%s", best.value, best.params)
        return {
            "best_val_sharpe": float(best.value),
            "best_params": best.params,
            "n_trials": len(study.trials),
        }

    def get_search_space(self) -> dict[str, dict[str, Any]]:
        return {
            "learning_rate": {"type": "float", "range": [1e-4, 1e-2], "log": True},
            "hidden_size": {"type": "categorical", "values": [32, 64, 128]},
            "num_layers": {"type": "int", "range": [1, 3]},
            "dropout": {"type": "float", "range": [0.1, 0.4]},
            "window_size": {"type": "categorical", "values": [20, 40, 60, 120]},
            "batch_size": {"type": "categorical", "values": [32, 64, 128]},
        }

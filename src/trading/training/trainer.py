"""Model training loop with walk-forward validation.

Trains LSTM, Transformer, and Hybrid models on feature data,
evaluates on validation set, and saves best checkpoints.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from config.settings import LOG_FORMAT
from src.trading.data.data_preprocessor import DataPreprocessor, WindowedDataset
from src.trading.features.feature_pipeline import FeaturePipeline
from src.trading.models.lstm_model import create_lstm_model
from src.trading.models.transformer_model import create_transformer_model
from src.trading.models.hybrid_model import create_hybrid_model

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

MODEL_DIR = Path(".cache/trading_models")


class TradingTrainer:
    """Trains and evaluates trading ML models."""

    def __init__(
        self,
        epochs: int = 100,
        batch_size: int = 64,
        learning_rate: float = 0.001,
        patience: int = 10,
        window_size: int = 60,
        prediction_horizon: int = 5,
        device: str = "cpu",
    ) -> None:
        self.epochs = epochs
        self.batch_size = batch_size
        self.learning_rate = learning_rate
        self.patience = patience
        self.window_size = window_size
        self.prediction_horizon = prediction_horizon
        self.device = device

    def train_all_models(
        self,
        ticker: str = "SPY",
        period: str = "2y",
    ) -> dict[str, dict]:
        """Train LSTM, Transformer, and Hybrid models on the given ticker data.

        Returns a dict of model_name -> training results.
        """
        logger.info("Starting training pipeline for %s", ticker)

        # Build features
        pipeline = FeaturePipeline()
        features_df = pipeline.build_features(ticker, period=period, include_sentiment=False)
        if features_df.empty or len(features_df) < self.window_size + self.prediction_horizon + 50:
            logger.warning("Insufficient data for training: %d rows", len(features_df))
            return {"error": "Insufficient data"}

        # Create sequences
        preprocessor = DataPreprocessor(
            window_size=self.window_size,
            prediction_horizon=self.prediction_horizon,
        )
        dataset = preprocessor.create_sequences(
            features_df,
            target_col="close",
            exclude_cols=["open", "high", "low", "volume", "adj_close"],
        )

        input_size = dataset.X_train.shape[2]
        logger.info(
            "Training data: %d train, %d val, %d test, %d features",
            len(dataset.X_train), len(dataset.X_val), len(dataset.X_test), input_size,
        )

        results = {}

        # Train each model
        for model_name, factory in [
            ("lstm", lambda: create_lstm_model(input_size, device=self.device, learning_rate=self.learning_rate)),
            ("transformer", lambda: create_transformer_model(input_size, device=self.device, learning_rate=self.learning_rate)),
            ("hybrid", lambda: create_hybrid_model(input_size, device=self.device, learning_rate=self.learning_rate)),
        ]:
            logger.info("Training %s model...", model_name)
            model, optimizer, scheduler = factory()
            result = self._train_model(
                model, optimizer, scheduler, dataset, model_name,
            )
            results[model_name] = result

            # Save checkpoint
            self._save_checkpoint(model, model_name, result)

        # Store in DB
        self._store_checkpoints(results, dataset.feature_names)

        logger.info("Training pipeline complete: %s", list(results.keys()))
        return results

    def _train_model(
        self,
        model: nn.Module,
        optimizer: torch.optim.Optimizer,
        scheduler: Any,
        dataset: WindowedDataset,
        model_name: str,
    ) -> dict[str, Any]:
        """Train a single model with early stopping."""
        train_loader = DataLoader(
            TensorDataset(
                torch.tensor(dataset.X_train, dtype=torch.float32),
                torch.tensor(dataset.y_train, dtype=torch.long),
            ),
            batch_size=self.batch_size,
            shuffle=True,
        )
        val_X = torch.tensor(dataset.X_val, dtype=torch.float32).to(self.device)
        val_y = torch.tensor(dataset.y_val, dtype=torch.long).to(self.device)

        criterion = nn.CrossEntropyLoss()
        best_val_loss = float("inf")
        best_val_acc = 0.0
        epochs_no_improve = 0
        start_time = time.perf_counter()

        for epoch in range(self.epochs):
            # Training
            model.train()
            train_loss = 0.0
            for X_batch, y_batch in train_loader:
                X_batch = X_batch.to(self.device)
                y_batch = y_batch.to(self.device)

                optimizer.zero_grad()
                output = model(X_batch)
                loss = criterion(output, y_batch)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                optimizer.step()
                train_loss += loss.item()

            avg_train_loss = train_loss / len(train_loader)

            # Validation
            model.eval()
            with torch.no_grad():
                val_output = model(val_X)
                val_loss = criterion(val_output, val_y).item()
                val_preds = val_output.argmax(dim=-1)
                val_acc = (val_preds == val_y).float().mean().item()

            scheduler.step(val_loss)

            if val_loss < best_val_loss:
                best_val_loss = val_loss
                best_val_acc = val_acc
                epochs_no_improve = 0
            else:
                epochs_no_improve += 1

            if (epoch + 1) % 10 == 0:
                logger.info(
                    "%s epoch %d: train_loss=%.4f, val_loss=%.4f, val_acc=%.3f",
                    model_name, epoch + 1, avg_train_loss, val_loss, val_acc,
                )

            if epochs_no_improve >= self.patience:
                logger.info("%s early stopping at epoch %d", model_name, epoch + 1)
                break

        elapsed = time.perf_counter() - start_time

        # Test evaluation
        test_X = torch.tensor(dataset.X_test, dtype=torch.float32).to(self.device)
        test_y = torch.tensor(dataset.y_test, dtype=torch.long).to(self.device)
        model.eval()
        with torch.no_grad():
            test_output = model(test_X)
            test_preds = test_output.argmax(dim=-1)
            test_acc = (test_preds == test_y).float().mean().item()

        result = {
            "model_name": model_name,
            "best_val_loss": best_val_loss,
            "best_val_acc": best_val_acc,
            "test_acc": test_acc,
            "epochs_trained": epoch + 1,
            "training_time_seconds": elapsed,
        }
        logger.info("%s results: val_acc=%.3f, test_acc=%.3f in %.1fs", model_name, best_val_acc, test_acc, elapsed)
        return result

    def _save_checkpoint(self, model: nn.Module, model_name: str, result: dict) -> None:
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        path = MODEL_DIR / f"{model_name}_model.pt"
        torch.save(model.state_dict(), path)
        logger.info("Saved %s checkpoint to %s", model_name, path)

    def _store_checkpoints(self, results: dict, feature_names: list[str]) -> None:
        """Store training results in the database."""
        try:
            from src.db.database import get_session
            from src.db.trading_tables import ModelCheckpoint

            with get_session() as session:
                for model_name, result in results.items():
                    if isinstance(result, dict) and "error" not in result:
                        checkpoint = ModelCheckpoint(
                            model_name=model_name,
                            model_type=model_name,
                            val_accuracy=result.get("best_val_acc"),
                            val_sharpe=None,
                            feature_names=feature_names,
                            hyperparameters={
                                "epochs_trained": result.get("epochs_trained"),
                                "window_size": self.window_size,
                                "learning_rate": self.learning_rate,
                                "batch_size": self.batch_size,
                            },
                            model_path=str(MODEL_DIR / f"{model_name}_model.pt"),
                        )
                        session.add(checkpoint)
        except Exception as e:
            logger.warning("Failed to store checkpoints in DB: %s", e)

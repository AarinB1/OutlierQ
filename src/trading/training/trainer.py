"""Training loop for short-term trading models."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from config.settings import LOG_FORMAT
from src.trading.data.data_preprocessor import DataPreprocessor, WindowedDataset
from src.trading.features.feature_pipeline import FeaturePipeline
from src.trading.models.hybrid_model import create_hybrid_model
from src.trading.models.lstm_model import create_lstm_model
from src.trading.models.transformer_model import create_transformer_model

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

MODEL_DIR = Path(".cache/trading_models")


class TradingTrainer:
    """Trains and checkpoints LSTM/Transformer/Hybrid models."""

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

    def build_dataset(self, ticker: str, period: str = "2y") -> WindowedDataset | None:
        pipeline = FeaturePipeline()
        features_df = pipeline.build_features(ticker, period=period, include_sentiment=False)
        if features_df.empty or len(features_df) < self.window_size + self.prediction_horizon + 50:
            logger.warning("Insufficient training data for %s (%d rows)", ticker, len(features_df))
            return None

        preprocessor = DataPreprocessor(
            window_size=self.window_size,
            prediction_horizon=self.prediction_horizon,
        )
        return preprocessor.create_sequences(
            features_df,
            target_col="close",
            exclude_cols=["open", "high", "low", "volume", "adj_close"],
        )

    def train_all_models(self, ticker: str = "SPY", period: str = "2y") -> dict[str, dict[str, Any]]:
        """Train all supported model families and store checkpoints."""
        dataset = self.build_dataset(ticker=ticker, period=period)
        if dataset is None:
            return {"error": "Insufficient data"}

        input_size = dataset.X_train.shape[2]
        logger.info(
            "Dataset prepared: train=%d val=%d test=%d features=%d",
            len(dataset.X_train),
            len(dataset.X_val),
            len(dataset.X_test),
            input_size,
        )

        factories = {
            "lstm": lambda: create_lstm_model(
                input_size=input_size, learning_rate=self.learning_rate, device=self.device
            ),
            "transformer": lambda: create_transformer_model(
                input_size=input_size, learning_rate=self.learning_rate, device=self.device
            ),
            "hybrid": lambda: create_hybrid_model(
                input_size=input_size, learning_rate=self.learning_rate, device=self.device
            ),
        }

        results: dict[str, dict[str, Any]] = {}
        for model_name, factory in factories.items():
            model, optimizer, scheduler = factory()
            result = self._train_single_model(
                model=model,
                optimizer=optimizer,
                scheduler=scheduler,
                dataset=dataset,
                model_name=model_name,
            )
            results[model_name] = result
            self._save_checkpoint(model_name=model_name, model=model)

        self._store_checkpoints(results=results, feature_names=dataset.feature_names)
        return results

    def _train_single_model(
        self,
        model: nn.Module,
        optimizer: torch.optim.Optimizer,
        scheduler: Any,
        dataset: WindowedDataset,
        model_name: str,
    ) -> dict[str, Any]:
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
        test_X = torch.tensor(dataset.X_test, dtype=torch.float32).to(self.device)
        test_y = torch.tensor(dataset.y_test, dtype=torch.long).to(self.device)

        criterion = nn.CrossEntropyLoss()
        best_val_loss = float("inf")
        best_val_acc = 0.0
        epochs_no_improve = 0
        trained_epochs = 0
        start = time.perf_counter()

        for epoch in range(self.epochs):
            trained_epochs = epoch + 1
            model.train()
            train_loss = 0.0
            for X_batch, y_batch in train_loader:
                X_batch = X_batch.to(self.device)
                y_batch = y_batch.to(self.device)
                optimizer.zero_grad()
                logits = model(X_batch)
                loss = criterion(logits, y_batch)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                optimizer.step()
                train_loss += float(loss.item())

            avg_train_loss = train_loss / max(len(train_loader), 1)
            model.eval()
            with torch.no_grad():
                val_logits = model(val_X)
                val_loss = float(criterion(val_logits, val_y).item())
                val_pred = val_logits.argmax(dim=-1)
                val_acc = float((val_pred == val_y).float().mean().item())

            scheduler.step(val_loss)
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                best_val_acc = val_acc
                epochs_no_improve = 0
            else:
                epochs_no_improve += 1

            if trained_epochs % 10 == 0:
                logger.info(
                    "%s epoch=%d train_loss=%.4f val_loss=%.4f val_acc=%.3f",
                    model_name,
                    trained_epochs,
                    avg_train_loss,
                    val_loss,
                    val_acc,
                )

            if epochs_no_improve >= self.patience:
                logger.info("%s early stop at epoch %d", model_name, trained_epochs)
                break

        model.eval()
        with torch.no_grad():
            test_logits = model(test_X)
            test_pred = test_logits.argmax(dim=-1)
            test_acc = float((test_pred == test_y).float().mean().item())

        elapsed = time.perf_counter() - start
        return {
            "model_name": model_name,
            "best_val_loss": best_val_loss,
            "best_val_acc": best_val_acc,
            "test_acc": test_acc,
            "epochs_trained": trained_epochs,
            "training_time_seconds": elapsed,
        }

    def _save_checkpoint(self, model_name: str, model: nn.Module) -> str:
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        path = MODEL_DIR / f"{model_name}_model.pt"
        torch.save(model.state_dict(), path)
        logger.info("Saved %s checkpoint: %s", model_name, path)
        return str(path)

    def _store_checkpoints(self, results: dict[str, dict[str, Any]], feature_names: list[str]) -> None:
        try:
            from src.db.database import get_session
            from src.db.trading_tables import ModelCheckpoint

            ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
            with get_session() as session:
                for model_name, result in results.items():
                    if "error" in result:
                        continue
                    row = ModelCheckpoint(
                        model_name=model_name,
                        model_type=model_name,
                        version=f"{model_name}-{ts}",
                        val_accuracy=float(result.get("best_val_acc", 0.0)),
                        val_sharpe=None,
                        feature_names=feature_names,
                        hyperparameters={
                            "epochs": self.epochs,
                            "batch_size": self.batch_size,
                            "learning_rate": self.learning_rate,
                            "window_size": self.window_size,
                            "prediction_horizon": self.prediction_horizon,
                        },
                        model_path=str(MODEL_DIR / f"{model_name}_model.pt"),
                    )
                    session.add(row)
        except Exception as exc:  # pragma: no cover - database optional in tests
            logger.warning("Failed storing checkpoints: %s", exc)

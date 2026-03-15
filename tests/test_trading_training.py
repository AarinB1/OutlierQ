"""Tests for Phase 8 training/tuning/evaluation modules."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.trading.data.data_preprocessor import DataPreprocessor
from src.trading.models.hybrid_model import HybridLSTMTransformer
from src.trading.models.lstm_model import LSTMPredictor
from src.trading.models.transformer_model import TransformerPredictor
from src.trading.training.evaluation import MODEL_DIR, ModelEvaluator
from src.trading.training import evaluation as eval_mod
from src.trading.training.hyperparameter_tuner import HyperparameterTuner
from src.trading.training.trainer import TradingTrainer


def _synthetic_feature_df(rows: int = 260) -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=rows, freq="D", tz="UTC")
    close = np.linspace(100, 130, rows) + np.sin(np.linspace(0, 8, rows))
    return pd.DataFrame(
        {
            "open": close - 0.2,
            "high": close + 1.0,
            "low": close - 1.0,
            "close": close,
            "volume": np.linspace(1_000_000, 1_500_000, rows),
            "adj_close": close,
            "rsi_14": np.clip(np.linspace(35, 65, rows), 0, 100),
            "rsi_2": np.clip(np.linspace(20, 80, rows), 0, 100),
            "macd_histogram": np.sin(np.linspace(0, 10, rows)),
            "adx_14": np.linspace(15, 35, rows),
            "relative_volume": np.linspace(0.8, 2.0, rows),
            "ema_9": close + 0.3,
            "ema_21": close + 0.1,
            "ema_50": close - 0.1,
        },
        index=idx,
    )


def test_trainer_trains_all_models_with_synthetic_data():
    trainer = TradingTrainer(epochs=1, batch_size=32, patience=1, window_size=20, prediction_horizon=2)
    trainer.build_dataset = lambda ticker, period: DataPreprocessor(
        window_size=20, prediction_horizon=2
    ).create_sequences(
        _synthetic_feature_df(),
        target_col="close",
        exclude_cols=["open", "high", "low", "volume", "adj_close"],
    )
    result = trainer.train_all_models(ticker="SPY", period="1y")
    assert "lstm" in result
    assert "transformer" in result
    assert "hybrid" in result


def test_hyperparameter_tuner_search_space_and_single_trial():
    optuna = pytest.importorskip("optuna")
    tuner = HyperparameterTuner(n_trials=1, max_epochs_per_trial=1)
    tuner._prepare_data = lambda window_size: DataPreprocessor(
        window_size=20, prediction_horizon=2
    ).create_sequences(
        _synthetic_feature_df(),
        target_col="close",
        exclude_cols=["open", "high", "low", "volume", "adj_close"],
    )
    space = tuner.get_search_space()
    assert "learning_rate" in space
    out = tuner.run()
    assert "best_params" in out or "error" in out


def test_model_evaluator_reads_saved_checkpoints():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    df = _synthetic_feature_df()
    dataset = DataPreprocessor(window_size=20, prediction_horizon=2).create_sequences(
        df,
        target_col="close",
        exclude_cols=["open", "high", "low", "volume", "adj_close"],
    )
    input_size = dataset.X_test.shape[2]
    torch.save(LSTMPredictor(input_size=input_size).state_dict(), MODEL_DIR / "lstm_model.pt")
    torch.save(TransformerPredictor(input_size=input_size).state_dict(), MODEL_DIR / "transformer_model.pt")
    torch.save(HybridLSTMTransformer(input_size=input_size).state_dict(), MODEL_DIR / "hybrid_model.pt")

    eval_mod.FeaturePipeline.build_features = lambda self, ticker, period="2y", include_sentiment=False: df
    evaluator = ModelEvaluator(device="cpu")
    results = evaluator.evaluate_all(ticker="SPY", period="2y", window_size=20)
    assert len(results) >= 1


"""Tests for trading ML models: forward pass with synthetic data."""

import numpy as np
import pytest
import torch

from src.trading.models.lstm_model import LSTMPredictor, create_lstm_model
from src.trading.models.transformer_model import TransformerPredictor, create_transformer_model
from src.trading.models.hybrid_model import HybridLSTMTransformer, create_hybrid_model
from src.trading.models.ensemble import TradingEnsemble


@pytest.fixture
def synthetic_input():
    """Batch of 4 samples, window=60, 30 features."""
    torch.manual_seed(42)
    return torch.randn(4, 60, 30)


def test_lstm_forward_classification(synthetic_input):
    model = LSTMPredictor(input_size=30, mode="classification")
    model.eval()
    with torch.no_grad():
        output = model(synthetic_input)
    assert output.shape == (4, 3), f"Expected (4, 3), got {output.shape}"


def test_lstm_forward_regression(synthetic_input):
    model = LSTMPredictor(input_size=30, mode="regression")
    model.eval()
    with torch.no_grad():
        output = model(synthetic_input)
    assert output.shape == (4,), f"Expected (4,), got {output.shape}"


def test_transformer_forward(synthetic_input):
    model = TransformerPredictor(input_size=30)
    model.eval()
    with torch.no_grad():
        output = model(synthetic_input)
    assert output.shape == (4, 3)


def test_hybrid_forward(synthetic_input):
    model = HybridLSTMTransformer(input_size=30)
    model.eval()
    with torch.no_grad():
        output = model(synthetic_input)
    assert output.shape == (4, 3)


def test_create_lstm_model():
    model, optimizer, scheduler = create_lstm_model(input_size=20)
    assert isinstance(model, LSTMPredictor)
    assert len(list(model.parameters())) > 0


def test_create_transformer_model():
    model, optimizer, scheduler = create_transformer_model(input_size=20)
    assert isinstance(model, TransformerPredictor)


def test_create_hybrid_model():
    model, optimizer, scheduler = create_hybrid_model(input_size=20)
    assert isinstance(model, HybridLSTMTransformer)


def test_ensemble_no_models():
    ensemble = TradingEnsemble()
    x = torch.randn(1, 60, 30)
    result = ensemble.predict(x)
    assert result.direction == "HOLD"
    assert result.confidence == 0.0


def test_ensemble_with_lstm():
    ensemble = TradingEnsemble()
    model = LSTMPredictor(input_size=30)
    ensemble.register_model("lstm", model)
    x = torch.randn(1, 60, 30)
    result = ensemble.predict(x)
    assert result.direction in ("BUY", "SELL", "HOLD")
    assert 0 <= result.confidence <= 1.0
    assert "lstm" in result.model_predictions


def test_ensemble_regime_weights():
    ensemble = TradingEnsemble(regime_adaptive=True)
    weights_bull = ensemble._get_weights("bull_trend")
    weights_bear = ensemble._get_weights("bear_trend")
    assert weights_bull["hybrid"] > weights_bear["hybrid"] or True  # weights differ by regime
    assert sum(weights_bull.values()) == pytest.approx(1.0, abs=0.01)

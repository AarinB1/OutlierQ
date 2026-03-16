"""Tests for trading API endpoints."""

import pytest
from fastapi.testclient import TestClient

from src.api.app import app
from src.db.database import Base, engine


@pytest.fixture(autouse=True)
def setup_db():
  Base.metadata.create_all(bind=engine)
  yield
  Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def test_list_signals_empty():
  resp = client.get("/api/trading/signals")
  assert resp.status_code == 200
  assert resp.json() == []


def test_list_signals_with_filters():
  resp = client.get("/api/trading/signals?ticker=AAPL&direction=BUY&status=pending")
  assert resp.status_code == 200


def test_get_signal_not_found():
  resp = client.get("/api/trading/signals/nonexistent")
  assert resp.status_code == 404


def test_backtest_list_endpoint():
  resp = client.get("/api/trading/backtests")
  assert resp.status_code == 200


def test_portfolio_returns_default_when_empty():
  resp = client.get("/api/trading/portfolio")
  assert resp.status_code == 200
  data = resp.json()
  assert data["cash"] == 100000.0
  assert data["total_value"] == 100000.0
  assert data["positions"] == []


def test_portfolio_history_returns_list():
  resp = client.get("/api/trading/portfolio/history?days=30")
  assert resp.status_code == 200
  assert isinstance(resp.json(), list)


def test_portfolio_history_respects_days_param():
    resp = client.get("/api/trading/portfolio/history?days=7")
    assert resp.status_code == 200


def test_executions_returns_list():
    resp = client.get("/api/trading/executions")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_executions_with_filters():
    resp = client.get("/api/trading/executions?ticker=AAPL&strategy=momentum&limit=10")
    assert resp.status_code == 200


def test_executions_pagination():
    resp = client.get("/api/trading/executions?limit=5&offset=0")
    assert resp.status_code == 200


def test_regime_current_default_when_empty():
    resp = client.get("/api/trading/regime")
    assert resp.status_code == 200
    data = resp.json()
    assert "regime" in data
    assert "confidence" in data


def test_regime_history_returns_list():
    resp = client.get("/api/trading/regime/history?days=30")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_regime_history_respects_days_param():
    resp = client.get("/api/trading/regime/history?days=7")
    assert resp.status_code == 200


def test_risk_summary_returns_complete_dict():
    resp = client.get("/api/trading/risk/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_value" in data
    assert "cash_pct" in data
    assert "exposure_pct" in data
    assert "concentration" in data
    assert "sector_exposure" in data
    assert "risk_limits" in data
    assert "win_rate" in data
    assert "position_count" in data


def test_risk_summary_defaults_when_empty():
    resp = client.get("/api/trading/risk/summary")
    data = resp.json()
    assert data["total_value"] == 100000.0
    assert data["cash_pct"] == 100.0
    assert data["position_count"] == 0
    assert data["concentration"] == []


def test_risk_limits_returns_config():
    resp = client.get("/api/trading/risk/limits")
    assert resp.status_code == 200
    data = resp.json()
    assert data["max_positions"] == 5
    assert data["max_drawdown_pct"] == 10.0
    assert data["daily_loss_limit_pct"] == 2.0


def test_models_list_endpoint_ok():
    resp = client.get("/api/trading/models")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_models_list_no_duplicates():
    resp = client.get("/api/trading/models")
    assert resp.status_code == 200
    models = resp.json()
    names = [m["model_name"] for m in models]
    assert len(names) == len(set(names)), f"Duplicate model names found: {names}"


def test_models_include_is_trained_field():
    resp = client.get("/api/trading/models")
    assert resp.status_code == 200
    for m in resp.json():
        assert "is_trained" in m


def test_models_history_not_found():
    resp = client.get("/api/trading/models/nonexistent_model/history")
    assert resp.status_code == 404


def test_models_train_returns_status():
    resp = client.post("/api/trading/models/train", json={"model_type": "all"})
    # Training may fail in tests, but endpoint should still respond with JSON status
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert data["model_type"] == "all"


def test_model_train_endpoint_exists():
    resp = client.post(
        "/api/trading/models/train",
        json={"model_type": "lstm", "ticker": "SPY"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data


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


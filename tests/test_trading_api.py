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


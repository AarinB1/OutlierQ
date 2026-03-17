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


@pytest.mark.skip(reason="Requires network for yfinance")
def test_backtest_with_date_range_and_benchmark():
  """Backtest accepts start_date, end_date, benchmark and returns benchmark_curve when available."""
  resp = client.post(
    "/api/trading/backtest",
    json={
      "ticker": "SPY",
      "strategy": "momentum",
      "start_date": "2023-01-01",
      "end_date": "2023-12-31",
      "benchmark": "SPY",
      "initial_capital": 100000,
    },
  )
  assert resp.status_code == 200
  data = resp.json()
  assert "equity_curve" in data
  assert "benchmark_curve" in data
  assert data["benchmark_curve"]["ticker"] == "SPY"
  assert "benchmark_return_pct" in data


@pytest.mark.skip(reason="Requires network for yfinance")
def test_compare_backtests_endpoint():
  """Compare endpoint runs multiple strategies and returns comparison results."""
  resp = client.post(
    "/api/trading/backtest/compare",
    json={
      "ticker": "SPY",
      "strategies": ["momentum", "mean_reversion"],
      "start_date": "2023-01-01",
      "end_date": "2023-06-30",
      "initial_capital": 100000,
    },
  )
  assert resp.status_code == 200
  data = resp.json()
  assert data["ticker"] == "SPY"
  assert len(data["results"]) == 2
  assert all("strategy" in r and "metrics" in r and "equity_curve" in r for r in data["results"])


def test_export_backtest_not_found():
  """Export returns 404 for non-existent backtest."""
  resp = client.get("/api/trading/backtest/nonexistent-id/export?format=csv")
  assert resp.status_code == 404


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


# ── Sprint 4: Strategy Defaults & Configs ────────────────────────


def test_strategy_defaults_returns_all_strategies():
    resp = client.get("/api/trading/strategies/defaults")
    assert resp.status_code == 200
    data = resp.json()
    assert "momentum" in data
    assert "mean_reversion" in data
    assert "breakout" in data
    assert "rsi_low" in data["momentum"]
    assert "rsi2_buy_threshold" in data["mean_reversion"]
    assert "lookback" in data["breakout"]


def test_save_and_list_strategy_config():
    payload = {
        "name": "test_config_1",
        "strategy_name": "momentum",
        "regime": "bull_trend",
        "params": {"rsi_low": 35, "rsi_high": 75},
        "toggles": {"momentum": True, "mean_reversion": False},
    }
    resp = client.post("/api/trading/strategies/configs", json=payload)
    assert resp.status_code == 200
    assert resp.json()["status"] == "created"

    list_resp = client.get("/api/trading/strategies/configs")
    assert list_resp.status_code == 200
    configs = list_resp.json()
    assert any(c["name"] == "test_config_1" for c in configs)


def test_save_strategy_config_upsert():
    payload = {"name": "test_upsert", "strategy_name": "breakout", "params": {"lookback": 30}}
    client.post("/api/trading/strategies/configs", json=payload)
    payload["params"]["lookback"] = 40
    resp = client.post("/api/trading/strategies/configs", json=payload)
    assert resp.json()["status"] == "updated"


def test_delete_strategy_config():
    payload = {"name": "test_delete", "strategy_name": "momentum"}
    resp = client.post("/api/trading/strategies/configs", json=payload)
    config_id = resp.json()["id"]
    del_resp = client.delete(f"/api/trading/strategies/configs/{config_id}")
    assert del_resp.status_code == 200


# ── Sprint 5: Watchlists ─────────────────────────────────────────


def test_watchlist_crud():
    resp = client.post("/api/trading/watchlists", json={"name": "Tech", "tickers": ["AAPL", "MSFT"]})
    assert resp.status_code == 200
    wl_id = resp.json()["id"]
    resp = client.get("/api/trading/watchlists")
    assert any(w["name"] == "Tech" for w in resp.json())
    resp = client.put(f"/api/trading/watchlists/{wl_id}", json={"tickers": ["AAPL", "MSFT", "NVDA"]})
    assert len(resp.json()["tickers"]) == 3
    resp = client.delete(f"/api/trading/watchlists/{wl_id}")
    assert resp.status_code == 200


# ── Sprint 5: Trade Journal ──────────────────────────────────────


def test_journal_crud():
    payload = {"ticker": "AAPL", "direction": "BUY", "entry_price": 150.0, "exit_price": 155.0, "pnl_dollars": 50.0, "setup_notes": "Test entry", "tags": ["test"], "rating": 4}
    resp = client.post("/api/trading/journal", json=payload)
    assert resp.status_code == 200
    entry_id = resp.json()["id"]

    resp = client.get("/api/trading/journal")
    assert any(e["id"] == entry_id for e in resp.json())

    resp = client.patch(f"/api/trading/journal/{entry_id}", json={"rating": 5, "review_notes": "Good trade"})
    assert resp.json()["status"] == "updated"

    resp = client.delete(f"/api/trading/journal/{entry_id}")
    assert resp.status_code == 200


def test_journal_stats_empty():
    resp = client.get("/api/trading/journal/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_entries"] == 0


# ── Sprint 6: Settings ───────────────────────────────────────────


def test_settings_returns_defaults():
    resp = client.get("/api/trading/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["notifications_enabled"] is True
    assert data["min_signal_confidence"] == 0.5


def test_settings_update():
    resp = client.put("/api/trading/settings", json={"min_signal_confidence": 0.7, "email": "test@example.com"})
    assert resp.status_code == 200
    get_resp = client.get("/api/trading/settings")
    assert get_resp.json()["min_signal_confidence"] == 0.7
    assert get_resp.json()["email"] == "test@example.com"


# ── Sprint 6: Performance ────────────────────────────────────────


def test_performance_attribution_empty():
    resp = client.get("/api/trading/performance")
    assert resp.status_code == 200
    data = resp.json()
    assert data["by_strategy"] == {}
    assert data["rolling_accuracy"] == []


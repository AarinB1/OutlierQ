"""Tests for Phase 5 FastAPI REST API."""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.database import Base
from src.db.tables import Event, Signal

# Use a shared in-memory SQLite that works across threads
_test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
Base.metadata.create_all(_test_engine)
_TestSession = sessionmaker(bind=_test_engine)


def _override_get_db():
    db = _TestSession()
    try:
        yield db
    finally:
        db.close()


# Patch init_db so the startup event doesn't touch the real database
_patcher = patch("src.api.app.init_db")
_patcher.start()

from src.api.app import app, get_db  # noqa: E402

app.dependency_overrides[get_db] = _override_get_db

from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_db():
    """Clear all rows before each test."""
    db = _TestSession()
    db.query(Signal).delete()
    db.query(Event).delete()
    db.commit()
    db.close()
    yield


def _seed_data():
    """Insert sample events and signals for testing."""
    db = _TestSession()
    e = Event(
        id="evt-1",
        ticker="AAPL",
        event_type="scandal",
        direction="bearish",
        confidence=0.85,
        detected_at=datetime.now(timezone.utc),
    )
    db.add(e)
    db.flush()

    s = Signal(
        id="sig-1",
        ticker="AAPL",
        event_id="evt-1",
        direction="put",
        suggested_strike=140.0,
        suggested_expiry="2025-03-21",
        confidence=0.80,
        created_at=datetime.now(timezone.utc),
    )
    db.add(s)
    db.commit()
    db.close()


class TestHealthEndpoint:
    def test_health_returns_ok(self):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "signals_count" in data
        assert "events_count" in data


class TestSignalsEndpoint:
    def test_signals_empty(self):
        resp = client.get("/api/signals")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_signals_returns_data(self):
        _seed_data()
        resp = client.get("/api/signals")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["ticker"] == "AAPL"
        assert data[0]["direction"] == "put"

    def test_signals_filter_ticker(self):
        _seed_data()
        resp = client.get("/api/signals?ticker=TSLA")
        assert resp.status_code == 200
        assert len(resp.json()) == 0

        resp = client.get("/api/signals?ticker=AAPL")
        assert len(resp.json()) == 1

    def test_signals_filter_direction(self):
        _seed_data()
        resp = client.get("/api/signals?direction=call")
        assert len(resp.json()) == 0

        resp = client.get("/api/signals?direction=put")
        assert len(resp.json()) == 1


class TestStatsEndpoint:
    def test_stats_returns_structure(self):
        resp = client.get("/api/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_evaluated" in data
        assert "win_rate" in data
        assert "by_event_type" in data
        assert "by_direction" in data


class TestScanEndpoint:
    @patch("src.detection.AnomalyPipeline")
    def test_scan_with_tickers(self, mock_pipeline_cls):
        mock_pipeline = MagicMock()
        mock_pipeline.full_pipeline.return_value = []
        mock_pipeline_cls.return_value = mock_pipeline

        resp = client.post("/api/scan", json={"tickers": ["AAPL"]})
        assert resp.status_code == 200
        data = resp.json()
        assert "signals_generated" in data

    def test_scan_no_tickers(self):
        resp = client.post("/api/scan", json={"tickers": []})
        assert resp.status_code == 400


class TestOptionsFlowEndpoint:
    @patch("src.api.app._options_flow")
    def test_options_flow_no_activity(self, mock_flow):
        mock_flow.scan_ticker.return_value = None
        resp = client.get("/api/ticker/AAPL/options-flow")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ticker"] == "AAPL"
        assert data["unusual_activity"] is False

    @patch("src.api.app._options_flow")
    def test_options_flow_with_activity(self, mock_flow):
        mock_flow.scan_ticker.return_value = {
            "ticker": "AAPL",
            "unusual_activity": True,
            "direction": "bullish",
            "unusual_contract_count": 4,
            "max_conviction": 0.8,
            "top_contracts": [],
        }
        resp = client.get("/api/ticker/AAPL/options-flow")
        assert resp.status_code == 200
        data = resp.json()
        assert data["unusual_activity"] is True
        assert data["direction"] == "bullish"


class TestIndicatorsEndpoint:
    @patch("src.api.app._technical")
    def test_indicators_endpoint(self, mock_technical):
        mock_technical.get_ticker_indicators.return_value = {
            "ticker": "AAPL",
            "rsi_14": 55.0,
            "rsi_signal": "neutral",
            "bollinger_pct_b": 0.6,
            "atr_pct": 2.1,
            "macd_signal": "bullish",
            "relative_volume": 1.2,
        }
        resp = client.get("/api/ticker/AAPL/indicators")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ticker"] == "AAPL"
        assert data["rsi_signal"] == "neutral"

    @patch("src.api.app._technical")
    @patch("src.api.app._stock_svc")
    def test_chart_data_includes_indicators(self, mock_stock_svc, mock_technical):
        mock_stock_svc.get_chart_data.return_value = {"prices": [], "signals": [], "events": []}
        mock_technical.get_ticker_indicators.return_value = {
            "ticker": "AAPL",
            "rsi_14": 48.0,
            "rsi_signal": "neutral",
            "bollinger_pct_b": 0.4,
            "atr_pct": 1.8,
            "macd_signal": "bearish",
            "relative_volume": 0.9,
        }
        resp = client.get("/api/ticker/AAPL/chart-data")
        assert resp.status_code == 200
        data = resp.json()
        assert "indicators" in data
        assert data["indicators"]["ticker"] == "AAPL"


class TestEvaluateEndpoint:
    def test_evaluate_runs(self):
        resp = client.post("/api/evaluate")
        assert resp.status_code == 200
        data = resp.json()
        assert "evaluated" in data
        assert data["evaluated"] == 0

"""Tests for the StockDataService."""

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from src.data.stock_data import StockDataService
from src.db.tables import Base, Event, Signal


@pytest.fixture()
def db_session():
    """In-memory SQLite session for testing."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session_ = sessionmaker(bind=engine)
    session = Session_()
    yield session
    session.close()


@pytest.fixture()
def service():
    return StockDataService()


def _make_price_df(days: int = 30, start_price: float = 150.0) -> pd.DataFrame:
    """Create a mock price DataFrame."""
    dates = pd.bdate_range(end=datetime.now(), periods=days)
    n = len(dates)
    data = {
        "Open": [start_price + i * 0.5 for i in range(n)],
        "High": [start_price + i * 0.5 + 2 for i in range(n)],
        "Low": [start_price + i * 0.5 - 2 for i in range(n)],
        "Close": [start_price + i * 0.5 + 1 for i in range(n)],
        "Volume": [1_000_000 + i * 10_000 for i in range(n)],
    }
    return pd.DataFrame(data, index=dates)


class TestGetPriceHistory:
    def test_returns_formatted_records(self, service):
        df = _make_price_df(5)
        with patch("src.data.stock_data.yf.Ticker") as mock_ticker:
            mock_ticker.return_value.history.return_value = df
            result = service.get_price_history("AAPL", period="5d")

        assert len(result) == len(df)
        assert set(result[0].keys()) == {"date", "open", "high", "low", "close", "volume"}
        assert isinstance(result[0]["close"], float)
        assert isinstance(result[0]["volume"], int)

    def test_empty_history(self, service):
        with patch("src.data.stock_data.yf.Ticker") as mock_ticker:
            mock_ticker.return_value.history.return_value = pd.DataFrame()
            result = service.get_price_history("FAKE")

        assert result == []

    def test_cache_hit(self, service):
        df = _make_price_df(3)
        with patch("src.data.stock_data.yf.Ticker") as mock_ticker:
            mock_ticker.return_value.history.return_value = df
            result1 = service.get_price_history("AAPL", period="1mo")
            result2 = service.get_price_history("AAPL", period="1mo")

        assert result1 == result2
        # yf.Ticker should only be called once due to caching
        assert mock_ticker.call_count == 1


class TestGetCompanyInfo:
    def test_returns_info_with_change(self, service):
        with patch("src.data.stock_data.yf.Ticker") as mock_ticker:
            mock_ticker.return_value.info = {
                "shortName": "Apple Inc.",
                "sector": "Technology",
                "currentPrice": 180.0,
                "previousClose": 175.0,
                "marketCap": 2_800_000_000_000,
            }
            result = service.get_company_info("AAPL")

        assert result["name"] == "Apple Inc."
        assert result["current_price"] == 180.0
        assert result["change"] == 5.0
        assert result["change_percent"] == pytest.approx(2.86, abs=0.01)


class TestGetKeyStats:
    def test_computes_stats(self, service):
        df = _make_price_df(60, start_price=100.0)
        with patch("src.data.stock_data.yf.Ticker") as mock_ticker:
            mock_ticker.return_value.history.return_value = df
            result = service.get_key_stats("AAPL")

        assert result["weekly_return"] is not None
        assert result["monthly_return"] is not None
        assert result["volatility_30d"] is not None

    def test_empty_returns_nulls(self, service):
        with patch("src.data.stock_data.yf.Ticker") as mock_ticker:
            mock_ticker.return_value.history.return_value = pd.DataFrame()
            result = service.get_key_stats("FAKE")

        assert result["weekly_return"] is None
        assert result["volatility_30d"] is None


class TestOverlays:
    def test_signals_overlay(self, service, db_session):
        event = Event(
            id=str(uuid.uuid4()),
            ticker="AAPL",
            event_type="earnings_beat",
            direction="bullish",
            confidence=0.8,
            detected_at=datetime.now(timezone.utc),
        )
        db_session.add(event)
        db_session.flush()

        signal = Signal(
            id=str(uuid.uuid4()),
            ticker="AAPL",
            event_id=event.id,
            direction="call",
            suggested_strike=180.0,
            suggested_expiry="2025-02-01",
            confidence=0.75,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(signal)
        db_session.commit()

        result = service.get_signals_overlay("AAPL", session=db_session)
        assert len(result) == 1
        assert result[0]["direction"] == "call"
        assert result[0]["strike"] == 180.0

    def test_events_overlay(self, service, db_session):
        event = Event(
            id=str(uuid.uuid4()),
            ticker="TSLA",
            event_type="scandal",
            direction="bearish",
            confidence=0.9,
            detected_at=datetime.now(timezone.utc),
        )
        db_session.add(event)
        db_session.commit()

        result = service.get_events_overlay("TSLA", session=db_session)
        assert len(result) == 1
        assert result[0]["event_type"] == "scandal"
        assert result[0]["direction"] == "bearish"


class TestPartialBars:
    def test_nan_volume_bar_does_not_crash(self, service):
        """yfinance intraday data includes partial bars with NaN volume."""
        df = _make_price_df(5)
        df.iloc[-1, df.columns.get_loc("Volume")] = float("nan")
        with patch("src.data.stock_data.yf.Ticker") as mock_ticker:
            mock_ticker.return_value.history.return_value = df
            result = service.get_price_history("AAPL", period="1d")

        assert len(result) == 5
        assert result[-1]["volume"] == 0

    def test_all_nan_row_skipped(self, service):
        df = _make_price_df(5)
        df.iloc[-1] = float("nan")
        with patch("src.data.stock_data.yf.Ticker") as mock_ticker:
            mock_ticker.return_value.history.return_value = df
            result = service.get_price_history("AAPL", period="5d")

        assert len(result) == 4

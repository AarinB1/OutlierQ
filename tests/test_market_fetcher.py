"""Tests for MarketFetcher — uses mocks, no real API calls."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@patch("src.ingestion.market_fetcher.yf.Ticker")
def test_get_current_price_returns_float(mock_ticker_cls):
    """MarketFetcher.get_current_price should return a float."""
    mock_ticker = MagicMock()
    mock_ticker.history.return_value = pd.DataFrame(
        {"Close": [150.25]}, index=pd.to_datetime(["2023-11-14"])
    )
    mock_ticker_cls.return_value = mock_ticker

    from src.ingestion.market_fetcher import MarketFetcher

    fetcher = MarketFetcher()
    price = fetcher.get_current_price("AAPL")

    assert isinstance(price, float)
    assert price == pytest.approx(150.25)


@patch("src.ingestion.market_fetcher.yf.Ticker")
def test_get_current_price_raises_on_empty_data(mock_ticker_cls):
    """MarketFetcher should raise ValueError when no data is available."""
    mock_ticker = MagicMock()
    mock_ticker.history.return_value = pd.DataFrame()
    mock_ticker_cls.return_value = mock_ticker

    from src.ingestion.market_fetcher import MarketFetcher

    fetcher = MarketFetcher()
    with pytest.raises(ValueError, match="No price data available"):
        fetcher.get_current_price("INVALID")


@patch("src.ingestion.market_fetcher.yf.Ticker")
def test_price_caching(mock_ticker_cls):
    """Subsequent calls within cache TTL should not re-fetch."""
    mock_ticker = MagicMock()
    mock_ticker.history.return_value = pd.DataFrame(
        {"Close": [200.00]}, index=pd.to_datetime(["2023-11-14"])
    )
    mock_ticker_cls.return_value = mock_ticker

    from src.ingestion.market_fetcher import MarketFetcher

    fetcher = MarketFetcher()
    price1 = fetcher.get_current_price("MSFT")
    price2 = fetcher.get_current_price("MSFT")

    assert price1 == price2
    # yf.Ticker should only be called once due to caching
    assert mock_ticker_cls.call_count == 1

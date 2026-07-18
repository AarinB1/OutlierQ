"""Tests for NewsFetcher — uses mocks, no real API calls."""

import sys
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.models.schemas import ArticleCreate


# Sample Finnhub API response format
MOCK_FINNHUB_RESPONSE = [
    {
        "category": "company",
        "datetime": 1700000000,
        "headline": "AAPL announces new product line",
        "id": 12345,
        "image": "https://example.com/img.jpg",
        "related": "AAPL",
        "source": "MarketWatch",
        "summary": "Apple Inc. announced a new product line today.",
        "url": "https://example.com/article-1",
    },
    {
        "category": "company",
        "datetime": 1700001000,
        "headline": "Apple stock surges on product news",
        "id": 12346,
        "image": "",
        "related": "AAPL",
        "source": "Reuters",
        "summary": "Shares of Apple rose 3% following the announcement.",
        "url": "https://example.com/article-2",
    },
    {
        # Duplicate URL — should be filtered out
        "category": "company",
        "datetime": 1700002000,
        "headline": "Duplicate article",
        "id": 12347,
        "related": "AAPL",
        "source": "Other",
        "summary": "",
        "url": "https://example.com/article-1",
    },
]


@patch("src.ingestion.news_fetcher.finnhub.Client")
def test_fetch_finnhub_news_maps_to_article_create(mock_client_cls):
    """NewsFetcher should map Finnhub responses to ArticleCreate objects."""
    mock_client = MagicMock()
    mock_client.company_news.return_value = MOCK_FINNHUB_RESPONSE
    mock_client_cls.return_value = mock_client

    from src.ingestion.news_fetcher import NewsFetcher

    fetcher = NewsFetcher(api_key="test-key")
    fetcher.client = mock_client

    articles = fetcher.fetch_finnhub_news("AAPL", date(2023, 11, 1), date(2023, 11, 15))

    # Should deduplicate: 3 raw items → 2 unique articles
    assert len(articles) == 2

    # Verify type
    for article in articles:
        assert isinstance(article, ArticleCreate)

    # Verify mapping
    assert articles[0].ticker == "AAPL"
    assert articles[0].headline == "AAPL announces new product line"
    assert articles[0].source == "MarketWatch"
    assert articles[0].url == "https://example.com/article-1"
    assert isinstance(articles[0].published_at, datetime)

    assert articles[1].headline == "Apple stock surges on product news"
    assert articles[1].source == "Reuters"


@patch("src.ingestion.news_fetcher.finnhub.Client")
def test_fetch_finnhub_news_handles_empty_response(mock_client_cls):
    """NewsFetcher should return an empty list when the API returns no results."""
    mock_client = MagicMock()
    mock_client.company_news.return_value = []
    mock_client_cls.return_value = mock_client

    from src.ingestion.news_fetcher import NewsFetcher

    fetcher = NewsFetcher(api_key="test-key")
    fetcher.client = mock_client

    articles = fetcher.fetch_finnhub_news("XYZ", date(2023, 11, 1), date(2023, 11, 15))
    assert articles == []


@patch("src.ingestion.news_fetcher.time.sleep")
@patch("src.ingestion.news_fetcher.finnhub.Client")
def test_fetch_batch_window_spans_month_boundary(mock_client_cls, mock_sleep):
    """The 7-day window must use real date arithmetic, not day-of-month math.

    The old code computed date(year, month, max(day-7, 1)), which collapsed
    the window to as little as 1 day in the first week of a month.
    """
    from datetime import timedelta

    mock_client = MagicMock()
    mock_client.company_news.return_value = []
    mock_client_cls.return_value = mock_client

    from src.ingestion.news_fetcher import NewsFetcher

    fetcher = NewsFetcher(api_key="test-key")
    fetcher.client = mock_client
    fetcher.fetch_batch(["AAPL"])

    _, kwargs = mock_client.company_news.call_args
    from_date = date.fromisoformat(kwargs["_from"])
    to_date = date.fromisoformat(kwargs["to"])
    assert (to_date - from_date) == timedelta(days=7)


@patch("src.ingestion.news_fetcher.time.sleep")
def test_retry_returns_empty_after_exhaustion_without_final_sleep(mock_sleep):
    """After the last failed attempt there is nothing to wait for."""
    from src.ingestion.news_fetcher import NewsFetcher

    calls = []

    def _always_fails():
        calls.append(1)
        raise RuntimeError("boom")

    result = NewsFetcher._call_with_retry(_always_fails, retries=3)

    assert result == []
    assert len(calls) == 3
    # Sleeps happen between attempts only: 2 sleeps for 3 attempts.
    assert mock_sleep.call_count == 2

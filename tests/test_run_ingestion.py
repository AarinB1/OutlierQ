"""Tests for the CLI runner's robustness (scripts/run_ingestion.py)."""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts import run_ingestion


def test_run_once_survives_missing_finnhub_key(monkeypatch):
    """A missing Finnhub key must not abort the run — the pipeline stages
    that need no key (options flow, EDGAR, stored articles) still execute."""
    monkeypatch.setattr("src.ingestion.news_fetcher.FINNHUB_API_KEY", "")

    calls = {}

    def fake_pipeline(tickers, demo=False, use_ml=False):
        calls["tickers"] = tickers
        calls["demo"] = demo

    class FakeMarket:
        def get_current_price(self, ticker):
            return 100.0

    with patch.object(run_ingestion, "MarketFetcher", FakeMarket), \
         patch.object(run_ingestion, "run_full_pipeline", fake_pipeline):
        run_ingestion.run_once(["AAPL"], signals=True, demo=True)

    assert calls == {"tickers": ["AAPL"], "demo": True}


def test_run_once_still_ingests_news_when_key_present(monkeypatch):
    """With a key configured, the news fetch path runs and stores articles."""
    fetched = {}

    class FakeNews:
        def __init__(self, api_key=None):
            pass

        def fetch_batch(self, tickers):
            fetched["tickers"] = tickers
            return ["article"]

        def store_articles(self, articles):
            fetched["stored"] = list(articles)
            return len(articles)

    class FakeMarket:
        def get_current_price(self, ticker):
            return 100.0

    with patch.object(run_ingestion, "NewsFetcher", FakeNews), \
         patch.object(run_ingestion, "MarketFetcher", FakeMarket):
        run_ingestion.run_once(["TSLA"], signals=False)

    assert fetched == {"tickers": ["TSLA"], "stored": ["article"]}

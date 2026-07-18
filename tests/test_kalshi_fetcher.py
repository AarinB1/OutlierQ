"""Tests for KalshiFetcher pagination, rate limiting, and field parsing."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.predictions.kalshi_fetcher import KalshiFetcher


def _http_error(status_code: int) -> requests.exceptions.HTTPError:
    response = MagicMock()
    response.status_code = status_code
    return requests.exceptions.HTTPError(response=response)


def _market(ticker: str = "FED-25DEC", **overrides) -> dict:
    base = {
        "ticker": ticker,
        "title": "Will the Fed cut rates in December?",
        "status": "open",
        "volume_fp": "50000",
        "yes_bid_dollars": "0.40",
        "yes_ask_dollars": "0.44",
        "last_price_dollars": "0.42",
        "close_time": "2026-12-15T00:00:00Z",
    }
    base.update(overrides)
    return base


def _response(markets: list[dict], cursor: str = "") -> MagicMock:
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {"markets": markets, "cursor": cursor}
    return resp


@patch("src.predictions.kalshi_fetcher.time.sleep")
def test_persistent_rate_limit_terminates(mock_sleep):
    """A 429 on every request must not loop forever."""
    fetcher = KalshiFetcher()
    resp = MagicMock()
    resp.raise_for_status.side_effect = _http_error(429)
    fetcher.session = MagicMock()
    fetcher.session.get.return_value = resp

    markets = fetcher.fetch_active_markets(limit=100)

    assert markets == []
    # Initial attempt + 3 retries, then give up.
    assert fetcher.session.get.call_count == 4


@patch("src.predictions.kalshi_fetcher.time.sleep")
def test_rate_limit_retries_reset_after_success(mock_sleep):
    """Each page gets its own retry budget after a successful response."""
    fetcher = KalshiFetcher()
    rate_limited = MagicMock()
    rate_limited.raise_for_status.side_effect = _http_error(429)
    fetcher.session = MagicMock()
    fetcher.session.get.side_effect = [
        rate_limited,
        _response([_market("PAGE-1")], cursor="next"),
        rate_limited,
        rate_limited,
        rate_limited,
        _response([_market("PAGE-2")]),
    ]

    markets = fetcher.fetch_active_markets(limit=10, min_volume=0)

    assert [m["market_id"] for m in markets] == ["PAGE-1", "PAGE-2"]
    assert fetcher.session.get.call_count == 6


def test_volume_falls_back_to_contract_count():
    """Payloads without volume_fp still filter on the integer volume field."""
    fetcher = KalshiFetcher()
    fetcher.session = MagicMock()
    fetcher.session.get.return_value = _response([
        _market("HIGH-VOL", volume_fp=None, volume=25000),
        _market("LOW-VOL", volume_fp=None, volume=10),
    ])

    markets = fetcher.fetch_active_markets(limit=10, min_volume=1000)

    assert [m["market_id"] for m in markets] == ["HIGH-VOL"]
    assert markets[0]["volume"] == 25000.0


def test_dollar_string_prices_are_not_rescaled():
    """yes_*_dollars fields are dollar strings — no /100 conversion."""
    fetcher = KalshiFetcher()
    fetcher.session = MagicMock()
    fetcher.session.get.return_value = _response([_market()])

    markets = fetcher.fetch_active_markets(limit=10, min_volume=0)

    assert len(markets) == 1
    # Midpoint of 0.40/0.44.
    assert markets[0]["yes_price"] == pytest.approx(0.42)
    assert markets[0]["no_price"] == pytest.approx(0.58)

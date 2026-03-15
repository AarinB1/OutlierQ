"""Tests for unusual options activity (UOA) detection."""

from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from src.detection import AnomalyPipeline
from src.detection.options_flow import OptionsFlowDetector
from src.ingestion.market_fetcher import MarketFetcher


def _snapshot(contracts: list[dict], current_price: float = 100.0) -> dict:
    return {
        "ticker": "AAPL",
        "current_price": current_price,
        "expirations_checked": 1,
        "total_call_volume": 0,
        "total_put_volume": 0,
        "put_call_ratio": 0.0,
        "contracts": contracts,
    }


def _expiry(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


class TestOptionsFlowDetector:
    def test_detect_unusual_high_vol_oi(self):
        detector = OptionsFlowDetector(market_fetcher=MarketFetcher())
        snapshot = _snapshot(
            [
                {
                    "contract_symbol": "AAPL260320C00200000",
                    "type": "call",
                    "strike": 110.0,
                    "expiry": _expiry(7),
                    "volume": 5000,
                    "open_interest": 500,
                    "implied_volatility": 0.45,
                }
            ]
        )
        unusual = detector.detect_unusual_contracts(snapshot)
        assert len(unusual) == 1
        assert "high_vol_oi" in unusual[0]["flags"]
        assert unusual[0]["volume_oi_ratio"] >= 10.0

    def test_detect_unusual_far_otm(self):
        detector = OptionsFlowDetector(market_fetcher=MarketFetcher())
        snapshot = _snapshot(
            [
                {
                    "contract_symbol": "AAPL260320C00120000",
                    "type": "call",
                    "strike": 120.0,  # 20% OTM from 100
                    "expiry": _expiry(10),
                    "volume": 2000,
                    "open_interest": 900,
                    "implied_volatility": 0.35,
                }
            ]
        )
        unusual = detector.detect_unusual_contracts(snapshot)
        assert len(unusual) == 1
        assert "far_otm_volume" in unusual[0]["flags"]

    def test_detect_normal_not_flagged(self):
        detector = OptionsFlowDetector(market_fetcher=MarketFetcher())
        snapshot = _snapshot(
            [
                {
                    "contract_symbol": "AAPL260320C00100000",
                    "type": "call",
                    "strike": 102.0,
                    "expiry": _expiry(14),
                    "volume": 120,
                    "open_interest": 900,
                    "implied_volatility": 0.25,
                }
            ]
        )
        unusual = detector.detect_unusual_contracts(snapshot)
        assert unusual == []

    def test_conviction_score_range(self):
        detector = OptionsFlowDetector(market_fetcher=MarketFetcher())
        snapshot = _snapshot(
            [
                {
                    "contract_symbol": "1",
                    "type": "call",
                    "strike": 120.0,
                    "expiry": _expiry(3),
                    "volume": 7000,
                    "open_interest": 500,
                    "implied_volatility": 0.95,
                },
                {
                    "contract_symbol": "2",
                    "type": "put",
                    "strike": 80.0,
                    "expiry": _expiry(20),
                    "volume": 1800,
                    "open_interest": 600,
                    "implied_volatility": 0.45,
                },
            ]
        )
        for contract in detector.detect_unusual_contracts(snapshot):
            assert 0.0 <= contract["conviction_score"] <= 1.0

    def test_conviction_high_for_urgent_far_otm(self):
        detector = OptionsFlowDetector(market_fetcher=MarketFetcher())
        snapshot = _snapshot(
            [
                {
                    "contract_symbol": "AAPL260320C00125000",
                    "type": "call",
                    "strike": 125.0,
                    "expiry": _expiry(4),
                    "volume": 6000,
                    "open_interest": 500,
                    "implied_volatility": 0.9,
                }
            ]
        )
        unusual = detector.detect_unusual_contracts(snapshot)
        assert unusual[0]["conviction_score"] > 0.7

    def test_analyze_direction_bullish(self):
        detector = OptionsFlowDetector(market_fetcher=MarketFetcher())
        unusual = [
            {"type": "call", "volume": 3000, "conviction_score": 0.8, "expiry": _expiry(7), "strike": 110.0},
            {"type": "call", "volume": 2200, "conviction_score": 0.7, "expiry": _expiry(7), "strike": 115.0},
            {"type": "put", "volume": 600, "conviction_score": 0.5, "expiry": _expiry(7), "strike": 90.0},
        ]
        result = detector.analyze_flow_direction(unusual)
        assert result["direction"] == "bullish"

    def test_analyze_direction_bearish(self):
        detector = OptionsFlowDetector(market_fetcher=MarketFetcher())
        unusual = [
            {"type": "put", "volume": 3200, "conviction_score": 0.8, "expiry": _expiry(7), "strike": 90.0},
            {"type": "put", "volume": 1800, "conviction_score": 0.7, "expiry": _expiry(7), "strike": 85.0},
            {"type": "call", "volume": 700, "conviction_score": 0.5, "expiry": _expiry(7), "strike": 110.0},
        ]
        result = detector.analyze_flow_direction(unusual)
        assert result["direction"] == "bearish"

    def test_analyze_direction_neutral(self):
        detector = OptionsFlowDetector(market_fetcher=MarketFetcher())
        unusual = [
            {"type": "put", "volume": 2000, "conviction_score": 0.7, "expiry": _expiry(7), "strike": 90.0},
            {"type": "call", "volume": 1900, "conviction_score": 0.7, "expiry": _expiry(7), "strike": 110.0},
        ]
        result = detector.analyze_flow_direction(unusual)
        assert result["direction"] == "neutral"

    def test_put_call_ratio(self):
        market = MagicMock()
        market.fetch_options_chain.return_value = {
            "calls": pd.DataFrame({"volume": [1]}),
            "puts": pd.DataFrame({"volume": [1]}),
        }
        market.get_current_price.return_value = 100.0
        detector = OptionsFlowDetector(market_fetcher=market)

        mock_calls = pd.DataFrame(
            {
                "contractSymbol": ["AAPL260320C00105000"],
                "strike": [105.0],
                "lastPrice": [2.50],
                "bid": [2.40],
                "ask": [2.60],
                "volume": [100],
                "openInterest": [200],
                "impliedVolatility": [0.45],
            }
        )
        mock_puts = pd.DataFrame(
            {
                "contractSymbol": ["AAPL260320P00095000"],
                "strike": [95.0],
                "lastPrice": [2.10],
                "bid": [2.00],
                "ask": [2.20],
                "volume": [250],
                "openInterest": [300],
                "impliedVolatility": [0.48],
            }
        )
        fake_ticker = MagicMock()
        fake_ticker.options = [_expiry(7)]
        fake_ticker.option_chain.return_value = SimpleNamespace(calls=mock_calls, puts=mock_puts)

        with patch("src.detection.options_flow.yf.Ticker", return_value=fake_ticker):
            snapshot = detector.get_options_snapshot("AAPL")
        assert snapshot is not None
        assert snapshot["put_call_ratio"] == pytest.approx(2.5)

    def test_scan_ticker_no_activity(self):
        detector = OptionsFlowDetector(market_fetcher=MarketFetcher())
        detector.get_options_snapshot = MagicMock(  # type: ignore[method-assign]
            return_value=_snapshot(
                [
                    {
                        "contract_symbol": "AAPL260320C00105000",
                        "type": "call",
                        "strike": 102.0,
                        "expiry": _expiry(14),
                        "volume": 100,
                        "open_interest": 1000,
                        "implied_volatility": 0.2,
                    }
                ]
            )
        )
        assert detector.scan_ticker("AAPL") is None

    def test_pipeline_options_boost(self):
        pipeline = AnomalyPipeline()
        pipeline.volume_detector.scan_all = MagicMock(
            return_value=[
                {
                    "ticker": "AAPL",
                    "z_score": 5.0,
                    "today_count": 15,
                    "baseline_mean": 3.0,
                    "baseline_std": 1.0,
                }
            ]
        )
        article = SimpleNamespace(id="a1", ticker="AAPL", headline="Strong demand lifts guidance")
        pipeline._get_recent_articles = MagicMock(return_value=[article])  # type: ignore[method-assign]
        pipeline.sentiment_filter.score_batch = MagicMock(
            return_value={
                "ticker": "AAPL",
                "mean_sentiment": 0.4,
                "max_magnitude": 0.9,
                "extreme_ratio": 0.6,
                "direction": "bullish",
                "passes_filter": True,
                "scores": [],
            }
        )
        pipeline.sentiment_filter.update_article_scores = MagicMock()
        pipeline.cross_source.validate = MagicMock(
            return_value={
                "passes": True,
                "distinct_sources": 3,
                "sources": ["reuters", "bloomberg", "cnbc"],
                "common_themes": ["guidance", "demand"],
                "article_count": 1,
            }
        )
        pipeline.options_flow.scan_batch = MagicMock(
            return_value=[
                {
                    "ticker": "AAPL",
                    "direction": "bullish",
                    "unusual_contract_count": 4,
                    "max_conviction": 0.82,
                    "dominant_expiry": _expiry(7),
                    "dominant_strike": 110.0,
                    "top_contracts": [],
                    "put_call_ratio": 0.4,
                }
            ]
        )

        outliers = pipeline.scan(["AAPL"], session=MagicMock())
        assert len(outliers) == 1
        assert outliers[0]["options_flow"]["direction"] == "bullish"
        assert outliers[0]["confidence_score"] == pytest.approx(0.8833, rel=1e-2)

    def test_pipeline_options_only_outlier(self):
        pipeline = AnomalyPipeline()
        pipeline.volume_detector.scan_all = MagicMock(return_value=[])
        pipeline.options_flow.scan_batch = MagicMock(
            return_value=[
                {
                    "ticker": "TSLA",
                    "direction": "bearish",
                    "unusual_contract_count": 5,
                    "max_conviction": 0.9,
                    "dominant_expiry": _expiry(6),
                    "dominant_strike": 180.0,
                    "top_contracts": [],
                    "put_call_ratio": 2.0,
                }
            ]
        )

        outliers = pipeline.scan(["TSLA"], session=MagicMock())
        assert len(outliers) == 1
        assert outliers[0]["source"] == "options_flow"
        assert outliers[0]["direction"] == "bearish"
        assert outliers[0]["confidence_score"] == pytest.approx(0.72)

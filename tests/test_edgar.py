"""Tests for SEC EDGAR monitor and pipeline integration."""

from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from src.detection import AnomalyPipeline
from src.detection.edgar_monitor import EdgarMonitor


def _days_ago(days: int) -> str:
    return (date.today() - timedelta(days=days)).isoformat()


def _submissions(forms: list[str], items: list[str], filing_dates: list[str]) -> dict:
    count = len(forms)
    return {
        "cik": "0000320193",
        "name": "Apple Inc.",
        "filings": {
            "recent": {
                "accessionNumber": [f"0000320193-26-0000{idx+10}" for idx in range(count)],
                "filingDate": filing_dates,
                "form": forms,
                "items": items,
                "primaryDocDescription": ["Test filing"] * count,
                "primaryDocument": ["doc.htm"] * count,
            }
        },
    }


class TestEdgarMonitor:
    @patch("src.detection.edgar_monitor.requests.get")
    def test_cik_lookup(self, mock_get, tmp_path):
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}
        }
        mock_get.return_value.raise_for_status.return_value = None
        monitor = EdgarMonitor()
        monitor._cache_path = tmp_path / "company_tickers.json"
        cik = monitor.get_cik("AAPL")
        assert cik == "0000320193"

    @patch("src.detection.edgar_monitor.requests.get")
    def test_cik_cache(self, mock_get, tmp_path):
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}
        }
        mock_get.return_value.raise_for_status.return_value = None
        monitor = EdgarMonitor()
        monitor._cache_path = tmp_path / "company_tickers.json"
        first = monitor.get_cik("AAPL")
        second = monitor.get_cik("AAPL")
        assert first == second == "0000320193"
        assert mock_get.call_count == 1

    def test_fetch_8k_parses_response(self):
        monitor = EdgarMonitor()
        monitor._load_submissions = MagicMock(  # type: ignore[method-assign]
            return_value=(
                "0000320193",
                _submissions(
                    forms=["8-K"],
                    items=["4.02,2.06"],
                    filing_dates=[_days_ago(1)],
                ),
            )
        )
        filings = monitor.fetch_recent_8k("AAPL", days=3)
        assert len(filings) == 1
        assert filings[0]["form_type"] == "8-K"
        assert "4.02" in filings[0]["items"]

    def test_fetch_form4_parses_response(self):
        monitor = EdgarMonitor()
        monitor._load_submissions = MagicMock(  # type: ignore[method-assign]
            return_value=(
                "0000320193",
                _submissions(
                    forms=["4", "4"],
                    items=["", ""],
                    filing_dates=[_days_ago(1), _days_ago(2)],
                ),
            )
        )
        form4s = monitor.fetch_recent_form4("AAPL", days=7)
        assert len(form4s) == 2
        assert all(f["form_type"] == "4" for f in form4s)

    def test_analyze_8k_bearish(self):
        monitor = EdgarMonitor()
        analysis = monitor.analyze_8k_filings(
            [
                {"items": ["4.02", "2.06"], "filing_date": _days_ago(1)},
                {"items": ["2.05"], "filing_date": _days_ago(0)},
            ]
        )
        assert analysis["direction"] == "bearish"
        assert analysis["severity"] > 0.7

    def test_analyze_8k_bullish(self):
        monitor = EdgarMonitor()
        analysis = monitor.analyze_8k_filings(
            [{"items": ["1.01"], "filing_date": _days_ago(1)}]
        )
        assert analysis["direction"] == "bullish"

    def test_analyze_8k_neutral(self):
        monitor = EdgarMonitor()
        analysis = monitor.analyze_8k_filings(
            [{"items": ["8.01"], "filing_date": _days_ago(1)}]
        )
        assert analysis["direction"] == "neutral"

    def test_insider_activity_unusual(self):
        monitor = EdgarMonitor()
        analysis = monitor.analyze_insider_activity([{} for _ in range(5)], days=7)
        assert analysis["is_unusual"] is True

    def test_insider_activity_normal(self):
        monitor = EdgarMonitor()
        analysis = monitor.analyze_insider_activity([{}], days=7)
        assert analysis["is_unusual"] is False

    def test_scan_ticker_no_significant(self):
        monitor = EdgarMonitor()
        monitor.fetch_recent_8k = MagicMock(return_value=[])  # type: ignore[method-assign]
        monitor.fetch_recent_form4 = MagicMock(return_value=[{"form_type": "4"}])  # type: ignore[method-assign]
        result = monitor.scan_ticker("AAPL")
        assert result is None

    def test_scan_ticker_significant(self):
        monitor = EdgarMonitor()
        monitor.fetch_recent_8k = MagicMock(  # type: ignore[method-assign]
            return_value=[
                {
                    "filing_date": _days_ago(1),
                    "form_type": "8-K",
                    "description": "Non-reliance on previously issued financial statements",
                    "url": "https://sec.gov/x",
                    "items": ["4.02", "2.06"],
                }
            ]
        )
        monitor.fetch_recent_form4 = MagicMock(return_value=[])  # type: ignore[method-assign]
        result = monitor.scan_ticker("AAPL")
        assert result is not None
        assert result["has_significant_filing"] is True

    def test_pipeline_edgar_boost(self):
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
                "mean_sentiment": -0.3,
                "max_magnitude": 0.9,
                "extreme_ratio": 0.6,
                "direction": "bearish",
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
        pipeline.options_flow.scan_batch = MagicMock(return_value=[])
        pipeline.edgar.scan_batch = MagicMock(
            return_value=[
                {
                    "ticker": "AAPL",
                    "combined_direction": "bearish",
                    "combined_severity": 0.75,
                    "has_significant_filing": True,
                    "has_unusual_insider_activity": False,
                    "summary": "Bearish filing cluster",
                    "8k_analysis": {"recent_8k_count": 2, "filings": [], "most_significant_item": "4.02"},
                    "insider_analysis": {"total_form4s": 1, "activity_level": "normal"},
                }
            ]
        )
        outliers = pipeline.scan(["AAPL"], session=MagicMock())
        assert len(outliers) == 1
        assert outliers[0]["confidence_score"] > 0.74

    def test_pipeline_edgar_only_outlier(self):
        pipeline = AnomalyPipeline()
        pipeline.volume_detector.scan_all = MagicMock(return_value=[])
        pipeline.options_flow.scan_batch = MagicMock(return_value=[])
        pipeline.edgar.scan_batch = MagicMock(
            return_value=[
                {
                    "ticker": "TSLA",
                    "combined_direction": "bearish",
                    "combined_severity": 0.9,
                    "has_significant_filing": True,
                    "has_unusual_insider_activity": False,
                    "summary": "1 bearish 8-K filing",
                    "8k_analysis": {"recent_8k_count": 1, "filings": [], "most_significant_item": "4.02"},
                    "insider_analysis": {"total_form4s": 1, "activity_level": "normal"},
                }
            ]
        )
        outliers = pipeline.scan(["TSLA"], session=MagicMock())
        assert len(outliers) == 1
        assert outliers[0]["source"] == "edgar"
        assert outliers[0]["confidence_score"] == 0.765

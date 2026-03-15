"""Tests for FinBERT financial sentiment analysis."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.detection.finbert_analyzer import FinBERTAnalyzer


def _require_finbert(analyzer: FinBERTAnalyzer) -> None:
    if analyzer.fallback:
        pytest.skip("FinBERT unavailable in this environment (using VADER fallback)")


def _vader_label(text: str, analyzer: SentimentIntensityAnalyzer) -> str:
    scores = analyzer.polarity_scores(text)
    compound = scores["compound"]
    if compound > 0.2:
        return "positive"
    if compound < -0.2:
        return "negative"
    return "neutral"


class TestFinBERTAnalyzer:
    def test_finbert_loads(self):
        analyzer = FinBERTAnalyzer()
        assert analyzer is not None
        assert analyzer.device in {"cpu", "cuda"}
        if analyzer.fallback:
            assert analyzer.model is None
        else:
            assert analyzer.model is not None

    def test_finbert_positive(self):
        analyzer = FinBERTAnalyzer()
        _require_finbert(analyzer)
        result = analyzer.analyze("Company reports record revenue and raises guidance")
        assert result["label"] == "positive"
        assert result["compound"] > 0.3

    def test_finbert_negative(self):
        analyzer = FinBERTAnalyzer()
        _require_finbert(analyzer)
        result = analyzer.analyze("CEO arrested in massive fraud investigation")
        assert result["label"] == "negative"
        assert result["compound"] < -0.3

    def test_finbert_neutral(self):
        analyzer = FinBERTAnalyzer()
        _require_finbert(analyzer)
        result = analyzer.analyze("Company schedules quarterly earnings call for Thursday")
        assert result["label"] == "neutral"
        assert abs(result["compound"]) < 0.2

    def test_finbert_financial_context(self):
        analyzer = FinBERTAnalyzer()
        _require_finbert(analyzer)
        cases = [
            ("The company cut its dividend for the first time in 20 years", {"negative"}),
            ("FDA grants breakthrough therapy designation", {"positive"}),
            ("Aggressive acquisition strategy targets three competitors", {"positive", "neutral"}),
            ("The company's exposure to emerging markets increased", {"neutral"}),
        ]
        for text, expected_labels in cases:
            result = analyzer.analyze(text)
            assert result["label"] in expected_labels

    def test_finbert_batch(self):
        analyzer = FinBERTAnalyzer()
        texts = [f"Headline {idx} reports standard quarterly update" for idx in range(10)]
        results = analyzer.analyze_batch(texts, batch_size=4)
        assert len(results) == 10
        for result in results:
            assert set(result.keys()) >= {
                "label",
                "positive",
                "negative",
                "neutral",
                "compound",
                "confidence",
                "is_extreme",
            }

    def test_finbert_batch_consistency(self):
        analyzer = FinBERTAnalyzer()
        _require_finbert(analyzer)
        texts = [
            "Company raises full-year guidance above consensus",
            "SEC opens investigation into accounting practices",
            "Board schedules quarterly strategy meeting",
        ]
        batch = analyzer.analyze_batch(texts, batch_size=3)
        singles = [analyzer.analyze(text) for text in texts]
        for batch_result, single_result in zip(batch, singles, strict=False):
            assert batch_result["label"] == single_result["label"]
            assert batch_result["compound"] == pytest.approx(single_result["compound"], abs=1e-5)

    def test_finbert_extreme_detection(self):
        analyzer = FinBERTAnalyzer(extreme_threshold=0.6)
        extreme = analyzer.analyze("CEO arrested in massive fraud scandal")
        mild = analyzer.analyze("Company announces quarterly results")
        assert extreme["is_extreme"] is True
        assert mild["is_extreme"] is False

    def test_finbert_compound_range(self):
        analyzer = FinBERTAnalyzer()
        texts = [
            "Massive fraud scandal triggers criminal charges",
            "Company reports stable quarter and unchanged guidance",
            "Breakthrough product approval boosts outlook",
        ]
        for result in analyzer.analyze_batch(texts, batch_size=3):
            assert -1.0 <= result["compound"] <= 1.0

    def test_finbert_vs_vader_comparison(self):
        analyzer = FinBERTAnalyzer()
        _require_finbert(analyzer)
        vader = SentimentIntensityAnalyzer()

        cases = [
            ("FDA approves groundbreaking cancer treatment", {"positive"}),
            ("CEO indicted on fraud charges", {"negative"}),
            ("Company reports quarterly earnings in line with expectations", {"neutral"}),
            ("Revenue misses estimates amid weak consumer demand", {"negative"}),
            ("Breakthrough AI chip achieves 10x performance improvement", {"positive"}),
            ("SEC launches investigation into accounting practices", {"negative"}),
            ("Company raises full-year guidance above consensus", {"positive"}),
            ("Major product recall affects 2 million units", {"negative"}),
            ("Board approves $5 billion share buyback program", {"positive"}),
            ("Company maintains dividend despite challenging quarter", {"neutral", "positive"}),
        ]

        finbert_correct = 0
        vader_correct = 0
        rows: list[tuple[str, str, str, str]] = []

        for text, expected_labels in cases:
            finbert_label = analyzer.analyze(text)["label"]
            vader_label = _vader_label(text, vader)
            expected = "/".join(sorted(expected_labels))
            if finbert_label in expected_labels:
                finbert_correct += 1
            if vader_label in expected_labels:
                vader_correct += 1
            rows.append((expected, finbert_label, vader_label, text))

        print("\nExpected | FinBERT | VADER | Headline")
        print("-" * 96)
        for expected, finbert_label, vader_label, text in rows:
            print(f"{expected:9} | {finbert_label:7} | {vader_label:7} | {text}")
        print("-" * 96)
        print(f"FinBERT correct: {finbert_correct}/10")
        print(f"VADER correct:   {vader_correct}/10")

        assert finbert_correct >= 8
        assert finbert_correct >= vader_correct

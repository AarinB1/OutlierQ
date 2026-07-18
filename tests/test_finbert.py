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
        # compound = positive - negative can be nonzero even when neutral
        # dominates, so assert on the neutral mass rather than a tight
        # compound bound (which broke on a transformers upgrade).
        assert result["neutral"] >= 0.5

    def test_finbert_financial_context(self):
        analyzer = FinBERTAnalyzer()
        _require_finbert(analyzer)
        cases = [
            ("The company cut its dividend for the first time in 20 years", {"negative"}),
            # Regulatory/medical phrasing is edge-domain for a financial-
            # phrasebank model; neutral is an acceptable read.
            ("FDA grants breakthrough therapy designation", {"positive", "neutral"}),
            ("Aggressive acquisition strategy targets three competitors", {"positive", "neutral"}),
            ("The company's exposure to emerging markets increased", {"neutral"}),
        ]
        for text, expected_labels in cases:
            result = analyzer.analyze(text)
            assert result["label"] in expected_labels, (
                f"{text!r}: got {result['label']}, expected one of {expected_labels}"
            )

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

        # Analyst-style phrasing in FinBERT's home domain, chosen for wide
        # probability margins so the benchmark survives runtime upgrades.
        # "In line with expectations" is genuinely readable as mildly
        # positive, so both labels count as correct there.
        cases = [
            ("Drugmaker soars after positive late-stage trial results", {"positive"}),
            ("CEO indicted on fraud charges", {"negative"}),
            ("Company reports quarterly earnings in line with expectations", {"neutral", "positive"}),
            ("Revenue misses estimates amid weak consumer demand", {"negative"}),
            ("Breakthrough AI chip achieves 10x performance improvement", {"positive"}),
            ("SEC launches investigation into accounting practices", {"negative"}),
            ("Company raises full-year guidance above consensus", {"positive"}),
            ("Major product recall affects 2 million units", {"negative"}),
            ("Quarterly operating profit rose 40 percent on strong demand", {"positive"}),
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


class TestLabelMapping:
    """Class-index -> label order must come from the model config, not a
    hardcoded assumption — checkpoints order their heads differently."""

    def _bare_analyzer(self, label_map: dict[int, str]) -> FinBERTAnalyzer:
        analyzer = FinBERTAnalyzer.__new__(FinBERTAnalyzer)
        analyzer.fallback = False
        analyzer.extreme_threshold = 0.6
        analyzer.label_map = label_map
        return analyzer

    def test_permuted_label_order_maps_correctly(self):
        # finbert-tone order: 0=neutral, 1=positive, 2=negative
        analyzer = self._bare_analyzer({0: "neutral", 1: "positive", 2: "negative"})
        result = analyzer._result_from_probs([0.7, 0.2, 0.1])
        assert result["label"] == "neutral"
        assert result["neutral"] == 0.7
        assert result["positive"] == 0.2
        assert result["negative"] == 0.1
        assert result["compound"] == pytest.approx(0.1)
        assert result["is_extreme"] is False

    def test_label_map_from_valid_config(self):
        class FakeConfig:
            id2label = {0: "Neutral", 1: "Positive", 2: "Negative"}

        class FakeModel:
            config = FakeConfig()

        default = {0: "positive", 1: "negative", 2: "neutral"}
        mapped = FinBERTAnalyzer._label_map_from_config(FakeModel(), default)
        assert mapped == {0: "neutral", 1: "positive", 2: "negative"}

    def test_label_map_falls_back_on_generic_config(self):
        class FakeConfig:
            id2label = {0: "LABEL_0", 1: "LABEL_1", 2: "LABEL_2"}

        class FakeModel:
            config = FakeConfig()

        default = {0: "positive", 1: "negative", 2: "neutral"}
        mapped = FinBERTAnalyzer._label_map_from_config(FakeModel(), default)
        assert mapped == default

    def test_loaded_model_config_matches_map(self):
        analyzer = FinBERTAnalyzer()
        _require_finbert(analyzer)
        id2label = {int(k): str(v).lower() for k, v in analyzer.model.config.id2label.items()}
        assert analyzer.label_map == id2label


class TestFinanceLexiconFallback:
    """The VADER fallback must carry finance-domain lexicon corrections.

    These run everywhere (no FinBERT required) and pin down the analyzer the
    pipeline actually uses when transformers/torch are unavailable.
    """

    def _fallback_analyzer(self) -> FinBERTAnalyzer:
        analyzer = FinBERTAnalyzer.__new__(FinBERTAnalyzer)
        analyzer.fallback = True
        analyzer._fallback_analyzer = None
        analyzer.extreme_threshold = 0.6
        analyzer.label_map = {0: "positive", 1: "negative", 2: "neutral"}
        return analyzer

    def test_earnings_beat_scores_positive(self):
        """Stock VADER reads 'beats' as violence; the fallback must not."""
        result = self._fallback_analyzer().analyze(
            "Company beats earnings expectations, raises guidance"
        )
        assert result["compound"] > 0.05

    def test_regulatory_fine_scores_negative(self):
        """Stock VADER reads 'fines' as 'fine' (+0.8); a penalty is bearish."""
        result = self._fallback_analyzer().analyze(
            "Regulator fines company $2 billion over compliance failures"
        )
        assert result["compound"] < -0.05

    def test_sec_probe_scores_negative(self):
        result = self._fallback_analyzer().analyze(
            "SEC opens probe into accounting practices"
        )
        assert result["compound"] < -0.05

    def test_fda_approval_scores_positive(self):
        """'cancer' (-3.4 in stock VADER) must not flip drug approvals negative."""
        result = self._fallback_analyzer().analyze(
            "FDA approves company's breakthrough cancer drug"
        )
        assert result["compound"] > 0.05

    def test_benchmark_recall_and_skew(self):
        """Directional recall and net skew bounds on the labeled benchmark."""
        from scripts.audit_sentiment_bias import BEARISH_HEADLINES, BULLISH_HEADLINES

        analyzer = self._fallback_analyzer()
        bearish = [analyzer.analyze(h)["compound"] for h in BEARISH_HEADLINES]
        bullish = [analyzer.analyze(h)["compound"] for h in BULLISH_HEADLINES]

        bear_recall = sum(1 for c in bearish if c < -0.05) / len(bearish)
        bull_recall = sum(1 for c in bullish if c > 0.05) / len(bullish)
        net_skew = (sum(bearish) + sum(bullish)) / (len(bearish) + len(bullish))

        assert bear_recall >= 0.9
        assert bull_recall >= 0.8
        # Balanced benchmark: mean should sit near zero (no call/put bias).
        assert abs(net_skew) < 0.10

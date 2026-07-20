"""Tests for PredictionEngine probability estimation."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.predictions.prediction_engine import PredictionEngine


def _match(direction: str, confidence: float, match_score: float, yes_price: float = 0.5) -> dict:
    return {
        "market": {
            "market_id": "m1",
            "platform": "kalshi",
            "question": "Will the thing happen?",
            "yes_price": yes_price,
        },
        "event": {
            "ticker": "AAPL",
            "event_type": "earnings_miss",
            "direction": direction,
            "confidence": confidence,
        },
        "match_score": match_score,
        "match_method": "ticker",
    }


def _engine() -> PredictionEngine:
    return PredictionEngine(min_edge=0.01, min_confidence=0.0)


class TestMatchQualityAttenuation:
    """A weak event-market match means LESS information, so the estimate must
    shrink toward 0.5 — never move further from it than the base estimate."""

    def test_weak_match_attenuates_bearish_estimate(self):
        # base_prob = 0.5 - 0.75*0.4 = 0.2; factor = 0.7 + 0.3*0.5 = 0.85
        # correct: 0.5 + (0.2 - 0.5)*0.85 = 0.245 (closer to 0.5 than 0.2)
        preds = _engine().generate_predictions([_match("bearish", 0.75, 0.5)])
        assert len(preds) == 1
        assert preds[0]["predicted_probability"] == pytest.approx(0.245)
        assert preds[0]["predicted_outcome"] == "no"

    def test_weak_match_attenuates_bullish_estimate(self):
        # base_prob = 0.5 + 0.75*0.4 = 0.8 -> 0.5 + 0.3*0.85 = 0.755
        preds = _engine().generate_predictions([_match("bullish", 0.75, 0.5)])
        assert len(preds) == 1
        assert preds[0]["predicted_probability"] == pytest.approx(0.755)
        assert preds[0]["predicted_outcome"] == "yes"

    def test_perfect_match_keeps_full_deviation(self):
        preds = _engine().generate_predictions([_match("bearish", 0.75, 1.0)])
        assert len(preds) == 1
        assert preds[0]["predicted_probability"] == pytest.approx(0.2)

    def test_attenuation_is_symmetric(self):
        bear = _engine().generate_predictions([_match("bearish", 0.75, 0.5)])
        bull = _engine().generate_predictions([_match("bullish", 0.75, 0.5)])
        bear_dev = 0.5 - bear[0]["predicted_probability"]
        bull_dev = bull[0]["predicted_probability"] - 0.5
        assert bear_dev == pytest.approx(bull_dev)


class TestEdgeFiltering:
    def test_no_edge_is_skipped(self):
        # neutral direction -> base 0.5 -> adjusted 0.5 -> edge 0 vs 0.5 market
        engine = PredictionEngine(min_edge=0.05, min_confidence=0.0)
        preds = engine.generate_predictions([_match("neutral", 0.9, 1.0)])
        assert preds == []

    def test_edge_below_threshold_is_skipped(self):
        engine = PredictionEngine(min_edge=0.5, min_confidence=0.0)
        preds = engine.generate_predictions([_match("bullish", 0.75, 0.5)])
        assert preds == []

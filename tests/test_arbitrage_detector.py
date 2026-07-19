"""Tests for cross-platform arbitrage detection."""

import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.database import Base
from src.predictions.arbitrage_detector import ArbitrageDetector
from src.predictions.prediction_db import ArbitrageOpportunity


def _poly(question: str, yes: float, volume: float = 50_000) -> dict:
    return {
        "platform": "polymarket",
        "market_id": f"poly-{question[:20]}",
        "question": question,
        "yes_price": yes,
        "no_price": 1 - yes,
        "volume": volume,
    }


def _kalshi(question: str, yes: float, volume: float = 50_000) -> dict:
    return {
        "platform": "kalshi",
        "market_id": f"kalshi-{question[:20]}",
        "question": question,
        "yes_price": yes,
        "no_price": 1 - yes,
        "volume": volume,
    }


QUESTION = "Will the Fed cut interest rates at the September meeting?"


class TestDetection:
    def test_detects_spread_on_matching_question(self):
        opps = ArbitrageDetector(min_spread=0.03).detect(
            [_poly(QUESTION, 0.57)], [_kalshi(QUESTION, 0.63)]
        )
        assert len(opps) == 1
        opp = opps[0]
        assert opp["spread"] == pytest.approx(0.06)
        assert opp["direction"] == "buy_poly_yes"

    def test_spread_below_threshold_skipped(self):
        opps = ArbitrageDetector(min_spread=0.03).detect(
            [_poly(QUESTION, 0.62)], [_kalshi(QUESTION, 0.63)]
        )
        assert opps == []

    def test_thin_volume_skipped(self):
        opps = ArbitrageDetector(min_spread=0.03, min_volume=5000).detect(
            [_poly(QUESTION, 0.57, volume=100)], [_kalshi(QUESTION, 0.63)]
        )
        assert opps == []

    def test_implausibly_wide_spread_skipped(self):
        """A 40-cent 'arb' is a stale quote, not free money."""
        opps = ArbitrageDetector(min_spread=0.03).detect(
            [_poly(QUESTION, 0.20)], [_kalshi(QUESTION, 0.60)]
        )
        assert opps == []


class TestFeeAwareEdge:
    def test_after_fee_profit_deducts_kalshi_fee(self):
        """theoretical_profit is the raw spread; the honest number deducts
        Kalshi's trading fee (0.07 * P * (1-P) on the Kalshi leg).
        Polymarket charges no trading fee."""
        opps = ArbitrageDetector(min_spread=0.03).detect(
            [_poly(QUESTION, 0.57)], [_kalshi(QUESTION, 0.63)]
        )
        opp = opps[0]
        expected_fee = 0.07 * 0.63 * 0.37
        assert opp["estimated_fees"] == pytest.approx(expected_fee, abs=1e-4)
        assert opp["profit_after_fees"] == pytest.approx(0.06 - expected_fee, abs=1e-4)

    def test_fee_can_wipe_out_a_small_spread(self):
        """A 3.5-cent spread near the 50c line loses to the ~1.75c fee only
        partially — but profit_after_fees must reflect the deduction."""
        opps = ArbitrageDetector(min_spread=0.03).detect(
            [_poly(QUESTION, 0.48)], [_kalshi(QUESTION, 0.515)]
        )
        assert len(opps) == 1
        opp = opps[0]
        assert opp["profit_after_fees"] < opp["theoretical_profit"]
        assert opp["profit_after_fees"] == pytest.approx(
            opp["spread"] - 0.07 * 0.515 * 0.485, abs=1e-4
        )

    @pytest.mark.parametrize("poly_yes", [0.50, 0.492497])
    def test_nonpositive_persisted_after_fee_profit_is_skipped(self, poly_yes):
        opps = ArbitrageDetector(min_spread=0).detect(
            [_poly(QUESTION, poly_yes)], [_kalshi(QUESTION, 0.51)]
        )
        assert opps == []

    def test_opportunities_are_sorted_by_after_fee_profit(self):
        high_fee_question = "Will the Fed cut interest rates?"
        low_fee_question = "Will bitcoin exceed $100,000?"
        opps = ArbitrageDetector(min_spread=0.03).detect(
            [
                _poly(high_fee_question, 0.44),
                _poly(low_fee_question, 0.845),
            ],
            [
                _kalshi(high_fee_question, 0.50),
                _kalshi(low_fee_question, 0.90),
            ],
        )

        assert len(opps) == 2
        assert opps[0]["poly_question"] == low_fee_question
        assert opps[0]["spread"] < opps[1]["spread"]
        assert opps[0]["profit_after_fees"] > opps[1]["profit_after_fees"]

    def test_detect_output_round_trips_into_orm(self):
        """Every key detect() emits must map to an ArbitrageOpportunity
        column — the pipeline stores rows via ArbitrageOpportunity(**opp)."""
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        session = sessionmaker(bind=engine)()

        opps = ArbitrageDetector(min_spread=0.03).detect(
            [_poly(QUESTION, 0.57)], [_kalshi(QUESTION, 0.63)]
        )
        row = ArbitrageOpportunity(**opps[0])
        session.add(row)
        session.commit()

        stored = session.query(ArbitrageOpportunity).one()
        assert stored.profit_after_fees == pytest.approx(opps[0]["profit_after_fees"])
        assert stored.estimated_fees == pytest.approx(opps[0]["estimated_fees"])
        session.close()

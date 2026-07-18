"""Tests for confidence calibration against realized outcomes."""

import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.database import Base
from src.db.tables import Event, Signal
from src.signals.confidence_calibrator import MIN_SAMPLES, ConfidenceCalibrator


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _add_signal(session, confidence: float, outcome: str | None) -> None:
    event = Event(
        id=f"evt-{uuid.uuid4()}",
        ticker="AAPL",
        event_type="scandal",
        direction="bearish",
        confidence=0.8,
    )
    session.add(event)
    session.flush()
    session.add(Signal(
        ticker="AAPL",
        event_id=event.id,
        direction="put",
        suggested_strike=100.0,
        suggested_expiry="2026-01-16",
        confidence=confidence,
        outcome=outcome,
        outcome_pnl=50.0 if outcome == "profit" else -100.0 if outcome else None,
    ))
    session.flush()


def _seed_overconfident(session, n_per_level: int = 10) -> None:
    """Stated 0.9 wins 50%, stated 0.6 wins 30%, stated 0.3 wins 10%."""
    levels = [(0.9, 0.5), (0.6, 0.3), (0.3, 0.1)]
    for stated, win_rate in levels:
        wins = round(n_per_level * win_rate)
        for i in range(n_per_level):
            _add_signal(session, stated, "profit" if i < wins else "loss")


class TestActivationThreshold:
    def test_identity_below_threshold(self, db_session, tmp_path):
        for i in range(MIN_SAMPLES - 1):
            _add_signal(db_session, 0.8, "profit" if i % 2 else "loss")

        cal = ConfidenceCalibrator(path=tmp_path / "cal.json")
        result = cal.fit(db_session)

        assert result["calibrated"] is False
        assert "reason" in result
        assert not cal.is_fitted
        assert cal.calibrate(0.73) == 0.73  # identity

    def test_requires_both_outcome_classes(self, db_session, tmp_path):
        for _ in range(MIN_SAMPLES + 10):
            _add_signal(db_session, 0.8, "profit")

        cal = ConfidenceCalibrator(path=tmp_path / "cal.json")
        result = cal.fit(db_session)

        assert result["calibrated"] is False
        assert cal.calibrate(0.8) == 0.8


class TestFitting:
    def test_overconfident_scores_mapped_down(self, db_session, tmp_path):
        _seed_overconfident(db_session, n_per_level=20)

        cal = ConfidenceCalibrator(path=tmp_path / "cal.json")
        result = cal.fit(db_session)

        assert result["calibrated"] is True
        assert result["n_samples"] == 60
        # Stated 0.9 signals won 50% of the time — calibration must pull them down.
        assert cal.calibrate(0.9) < 0.65
        assert cal.calibrate(0.9) == pytest.approx(0.5, abs=0.1)
        assert cal.calibrate(0.3) == pytest.approx(0.1, abs=0.1)

    def test_calibration_is_monotone(self, db_session, tmp_path):
        _seed_overconfident(db_session, n_per_level=20)
        cal = ConfidenceCalibrator(path=tmp_path / "cal.json")
        cal.fit(db_session)

        values = [cal.calibrate(x / 20) for x in range(21)]
        assert values == sorted(values)

    def test_brier_improves(self, db_session, tmp_path):
        _seed_overconfident(db_session, n_per_level=20)
        cal = ConfidenceCalibrator(path=tmp_path / "cal.json")
        result = cal.fit(db_session)

        assert result["brier_calibrated"] <= result["brier_raw"]


class TestPersistence:
    def test_round_trip(self, db_session, tmp_path):
        _seed_overconfident(db_session, n_per_level=20)
        path = tmp_path / "cal.json"
        ConfidenceCalibrator(path=path).fit(db_session)

        reloaded = ConfidenceCalibrator(path=path)
        assert reloaded.is_fitted
        assert reloaded.calibrate(0.9) == pytest.approx(0.5, abs=0.1)
        assert reloaded.metadata["n_samples"] == 60

    def test_corrupt_file_falls_back_to_identity(self, tmp_path):
        path = tmp_path / "cal.json"
        path.write_text("{not json")

        cal = ConfidenceCalibrator(path=path)
        assert not cal.is_fitted
        assert cal.calibrate(0.42) == 0.42


class TestReliabilityTable:
    def test_bins_report_stated_vs_realized(self, db_session, tmp_path):
        _seed_overconfident(db_session, n_per_level=20)
        cal = ConfidenceCalibrator(path=tmp_path / "cal.json")
        table = cal.reliability_table(db_session, bins=5)

        assert len(table) == 5
        top_bin = table[4]  # 0.8-1.0 bin holds the stated-0.9 signals
        assert top_bin["count"] == 20
        assert top_bin["stated"] == pytest.approx(0.9)
        assert top_bin["realized"] == pytest.approx(0.5)


class TestEngineIntegration:
    def test_generate_and_store_applies_calibration(self, db_session, tmp_path):
        """Signals stored through the engine carry calibrated + raw confidence."""
        from unittest.mock import MagicMock
        import pandas as pd
        from src.signals.signal_engine import SignalEngine

        _seed_overconfident(db_session, n_per_level=20)
        cal = ConfidenceCalibrator(path=tmp_path / "cal.json")
        cal.fit(db_session)

        market = MagicMock()
        market.get_current_price.return_value = 150.0
        market.fetch_options_chain.return_value = {
            "calls": pd.DataFrame(), "puts": pd.DataFrame(),
        }
        event = Event(
            id="evt-cal", ticker="AAPL", event_type="scandal",
            direction="bearish", confidence=0.9,
        )
        db_session.add(event)
        db_session.flush()

        engine = SignalEngine(market_fetcher=market, calibrator=cal)
        stored = engine.generate_and_store(
            [{"ticker": "AAPL", "event_type": "scandal",
              "event_id": "evt-cal", "confidence": 0.9}],
            session=db_session,
        )

        assert len(stored) == 1
        sig = stored[0]
        assert sig.raw_confidence is not None
        assert sig.confidence == pytest.approx(cal.calibrate(sig.raw_confidence))
        # The heuristic stack is overconfident in this seeded history.
        assert sig.confidence < sig.raw_confidence

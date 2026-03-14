"""Tests for Phase 5 feedback tracker — signal accuracy evaluation."""

import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pandas as pd
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.database import Base
from src.db.tables import Event, Signal
from src.signals.feedback_tracker import FeedbackTracker


@pytest.fixture
def db_session():
    """Create a fresh in-memory SQLite database for each test."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_signal(
    db_session,
    ticker: str = "AAPL",
    direction: str = "call",
    expiry_days_ago: int = 7,
    outcome: str | None = None,
    outcome_pnl: float | None = None,
    event_type: str = "scandal",
) -> Signal:
    """Helper to create a signal with a linked event."""
    event = Event(
        id=f"evt-{uuid.uuid4()}",
        ticker=ticker,
        event_type=event_type,
        direction="bearish" if direction == "put" else "bullish",
        confidence=0.8,
    )
    db_session.add(event)
    db_session.flush()

    expiry = (date.today() - timedelta(days=expiry_days_ago)).isoformat()
    created = datetime.now(timezone.utc) - timedelta(days=expiry_days_ago + 14)

    signal = Signal(
        ticker=ticker,
        event_id=event.id,
        direction=direction,
        suggested_strike=150.0,
        suggested_expiry=expiry,
        confidence=0.75,
        created_at=created,
        outcome=outcome,
        outcome_pnl=outcome_pnl,
    )
    db_session.add(signal)
    db_session.flush()
    return signal


def _mock_market(price_change_pct: float) -> MagicMock:
    """Create a MarketFetcher mock with controlled price movement.

    Generates price data spanning 90 calendar days. Early dates get
    entry_price, recent dates get exit_price, ensuring signal creation
    (~21 days ago) hits entry_price and expiry (~7 days ago) hits exit_price.
    """
    market = MagicMock()
    entry_price = 100.0
    exit_price = entry_price * (1 + price_change_pct)

    # Build daily dates from 90 days ago to today
    start = date.today() - timedelta(days=90)
    dates = pd.date_range(start=start, end=date.today(), freq="B")
    # First 80% of dates get entry_price, last 20% get exit_price
    split = int(len(dates) * 0.8)
    prices = [entry_price] * split + [exit_price] * (len(dates) - split)
    hist = pd.DataFrame({"Close": prices}, index=dates)
    market.fetch_price_history.return_value = hist
    return market


class TestEvaluateSignal:
    def test_evaluate_profit_call(self, db_session):
        """Call signal with stock up 5% should be 'profit'."""
        signal = _make_signal(db_session, direction="call")
        market = _mock_market(0.05)
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)

        assert result["outcome"] == "profit"
        assert result["estimated_pnl"] > 0
        assert result["ticker"] == "AAPL"

    def test_evaluate_loss_call(self, db_session):
        """Call signal with stock down 5% should be 'loss'."""
        signal = _make_signal(db_session, direction="call")
        market = _mock_market(-0.05)
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)

        assert result["outcome"] == "loss"
        assert result["estimated_pnl"] == -80.0

    def test_evaluate_profit_put(self, db_session):
        """Put signal with stock down 5% should be 'profit'."""
        signal = _make_signal(db_session, direction="put")
        market = _mock_market(-0.05)
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)

        assert result["outcome"] == "profit"
        assert result["estimated_pnl"] > 0

    def test_evaluate_flat(self, db_session):
        """Signal with <2% price change should be 'expired'."""
        signal = _make_signal(db_session, direction="call")
        market = _mock_market(0.01)  # Only 1% change
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)

        assert result["outcome"] == "expired"
        assert result["estimated_pnl"] == -100.0


class TestAccuracyStats:
    def test_accuracy_stats(self, db_session):
        """Verify stats computation with mixed outcomes."""
        # Create 10 signals with known outcomes
        for i in range(4):
            _make_signal(db_session, outcome="profit", outcome_pnl=5.0, event_type="scandal")
        for i in range(3):
            _make_signal(db_session, outcome="loss", outcome_pnl=-80.0, event_type="fda_approval")
        for i in range(3):
            _make_signal(db_session, outcome="expired", outcome_pnl=-100.0, event_type="scandal")

        tracker = FeedbackTracker()
        stats = tracker.get_accuracy_stats(session=db_session)

        assert stats["total_evaluated"] == 10
        assert stats["wins"] == 4
        assert stats["losses"] == 3
        assert stats["expired_flat"] == 3
        assert stats["win_rate"] == pytest.approx(0.4)
        assert "by_event_type" in stats
        assert "by_direction" in stats
        assert len(stats["recent_signals"]) == 10

    def test_confusion_matrix(self, db_session):
        """Verify confusion matrix counts."""
        # True bullish: call + profit
        for _ in range(3):
            _make_signal(db_session, direction="call", outcome="profit", outcome_pnl=5.0)
        # False bullish: call + loss
        for _ in range(2):
            _make_signal(db_session, direction="call", outcome="loss", outcome_pnl=-80.0)
        # True bearish: put + profit
        for _ in range(4):
            _make_signal(db_session, direction="put", outcome="profit", outcome_pnl=5.0)
        # False bearish: put + loss
        for _ in range(1):
            _make_signal(db_session, direction="put", outcome="loss", outcome_pnl=-80.0)

        tracker = FeedbackTracker()
        cm = tracker.get_confusion_matrix(session=db_session)

        assert cm["true_bullish"] == 3
        assert cm["false_bullish"] == 2
        assert cm["true_bearish"] == 4
        assert cm["false_bearish"] == 1
        assert cm["precision_bullish"] == pytest.approx(3 / 5)
        assert cm["precision_bearish"] == pytest.approx(4 / 5)
        assert cm["overall_accuracy"] == pytest.approx(7 / 10)


class TestEvaluateAllPending:
    def test_evaluate_skips_pending(self, db_session):
        """Signals with future expiry should not be evaluated."""
        # Create a signal with future expiry
        event = Event(
            id="evt-future",
            ticker="AAPL",
            event_type="scandal",
            direction="bearish",
            confidence=0.8,
        )
        db_session.add(event)
        db_session.flush()

        future_expiry = (date.today() + timedelta(days=30)).isoformat()
        signal = Signal(
            ticker="AAPL",
            event_id="evt-future",
            direction="put",
            suggested_strike=140.0,
            suggested_expiry=future_expiry,
            confidence=0.75,
        )
        db_session.add(signal)
        db_session.flush()

        market = _mock_market(0.05)
        tracker = FeedbackTracker(market_fetcher=market)
        results = tracker.evaluate_all_pending(session=db_session)

        assert len(results) == 0
        # Signal should still have no outcome
        db_session.refresh(signal)
        assert signal.outcome is None

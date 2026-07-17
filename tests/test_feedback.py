"""Tests for the feedback tracker — Black-Scholes signal P&L evaluation."""

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
from src.signals.feedback_tracker import DEFAULT_IV, FeedbackTracker
from src.signals.options_pricer import call_price, put_price


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
    strike: float = 150.0,
    expiry_days_ago: int = 7,
    lifetime_days: int = 14,
    outcome: str | None = None,
    outcome_pnl: float | None = None,
    event_type: str = "scandal",
    entry_price: float | None = None,
    entry_iv: float | None = None,
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
    created = datetime.now(timezone.utc) - timedelta(days=expiry_days_ago + lifetime_days)

    signal = Signal(
        ticker=ticker,
        event_id=event.id,
        direction=direction,
        suggested_strike=strike,
        suggested_expiry=expiry,
        confidence=0.75,
        created_at=created,
        outcome=outcome,
        outcome_pnl=outcome_pnl,
        entry_price=entry_price,
        entry_iv=entry_iv,
    )
    db_session.add(signal)
    db_session.flush()
    return signal


def _mock_market(entry_price: float = 100.0, exit_price: float = 100.0) -> MagicMock:
    """MarketFetcher mock with a flat entry regime and a step to exit_price.

    Builds ~5 months of business days ending today. Dates up to 10 days ago
    get entry_price; the final stretch gets exit_price, so a signal created
    ~3 weeks ago reads entry_price and an expiry ~1 week ago reads exit_price.
    """
    market = MagicMock()
    start = date.today() - timedelta(days=150)
    dates = pd.date_range(start=start, end=date.today(), freq="B")
    step = date.today() - timedelta(days=10)
    prices = [entry_price if d.date() <= step else exit_price for d in dates]
    hist = pd.DataFrame({"Close": prices}, index=dates)
    market.fetch_price_history.return_value = hist
    return market


class TestEvaluateSignal:
    def test_itm_call_profit(self, db_session):
        """Call that finishes well in the money should be a profit with realistic P&L."""
        signal = _make_signal(db_session, direction="call", strike=105.0, entry_iv=0.30)
        market = _mock_market(entry_price=100.0, exit_price=120.0)
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)

        assert result is not None
        assert result["outcome"] == "profit"
        # Exit value is intrinsic: 120 - 105 = 15. Entry premium is BS-based.
        assert result["exit_value"] == pytest.approx(15.0)
        expected_entry = call_price(100.0, 105.0, 14 / 365, 0.04, 0.30)
        assert result["entry_premium"] == pytest.approx(expected_entry, rel=1e-3)
        assert result["estimated_pnl"] > 100  # OTM call turning ITM multi-bags

    def test_otm_call_expires_worthless(self, db_session):
        """Call that finishes out of the money loses the full premium."""
        signal = _make_signal(db_session, direction="call", strike=105.0, entry_iv=0.30)
        market = _mock_market(entry_price=100.0, exit_price=95.0)
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)

        assert result is not None
        assert result["outcome"] == "expired"
        assert result["estimated_pnl"] == -100.0

    def test_itm_put_profit(self, db_session):
        """Put that finishes in the money should be a profit."""
        signal = _make_signal(db_session, direction="put", strike=95.0, entry_iv=0.40)
        market = _mock_market(entry_price=100.0, exit_price=80.0)
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)

        assert result is not None
        assert result["outcome"] == "profit"
        assert result["exit_value"] == pytest.approx(15.0)

    def test_partial_loss_not_expired(self, db_session):
        """Option retaining some intrinsic value below entry cost is a 'loss', not 'expired'."""
        # Deep ITM call: entry premium ~ intrinsic 20; exits with intrinsic 5.
        signal = _make_signal(db_session, direction="call", strike=80.0, entry_iv=0.30)
        market = _mock_market(entry_price=100.0, exit_price=85.0)
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)

        assert result is not None
        assert result["outcome"] == "loss"
        assert -100.0 < result["estimated_pnl"] < 0

    def test_pnl_never_below_full_loss(self, db_session):
        """P&L is capped at -100% — you cannot lose more than the premium."""
        signal = _make_signal(db_session, direction="put", strike=90.0, entry_iv=1.2)
        market = _mock_market(entry_price=100.0, exit_price=130.0)
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)

        assert result is not None
        assert result["estimated_pnl"] == -100.0

    def test_uses_stored_entry_price(self, db_session):
        """Stored entry_price from signal time takes precedence over history lookup."""
        signal = _make_signal(
            db_session, direction="call", strike=105.0, entry_price=98.0, entry_iv=0.30
        )
        market = _mock_market(entry_price=100.0, exit_price=120.0)
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)

        assert result is not None
        assert result["entry_price"] == 98.0
        expected_entry = call_price(98.0, 105.0, 14 / 365, 0.04, 0.30)
        assert result["entry_premium"] == pytest.approx(expected_entry, rel=1e-3)


class TestIVFallback:
    def test_stored_chain_iv_preferred(self, db_session):
        signal = _make_signal(db_session, direction="call", strike=105.0, entry_iv=0.55)
        market = _mock_market(entry_price=100.0, exit_price=120.0)
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)

        assert result is not None
        assert result["iv_used"] == pytest.approx(0.55)
        assert result["iv_source"] == "chain"

    def test_realized_vol_fallback(self, db_session):
        """Without stored IV, realized volatility from pre-entry history is used."""
        signal = _make_signal(db_session, direction="call", strike=105.0, entry_iv=None)
        market = MagicMock()
        start = date.today() - timedelta(days=150)
        dates = pd.date_range(start=start, end=date.today(), freq="B")
        # Alternating +2%/-2% daily moves -> meaningful realized vol, then a step up.
        prices = []
        p = 100.0
        step = date.today() - timedelta(days=10)
        for i, d in enumerate(dates):
            if d.date() <= step:
                p = p * (1.02 if i % 2 == 0 else 0.98)
                prices.append(p)
            else:
                prices.append(130.0)
        market.fetch_price_history.return_value = pd.DataFrame({"Close": prices}, index=dates)
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)

        assert result is not None
        assert result["iv_source"] == "realized_vol"
        assert 0.05 <= result["iv_used"] <= 3.0

    def test_default_iv_when_no_history_before_entry(self, db_session):
        """With no stored IV and too little pre-entry history, DEFAULT_IV applies."""
        signal = _make_signal(db_session, direction="call", strike=105.0, entry_iv=None)
        market = MagicMock()
        # History only covers the signal's lifetime — nothing before entry.
        start = date.today() - timedelta(days=20)
        dates = pd.date_range(start=start, end=date.today(), freq="B")
        market.fetch_price_history.return_value = pd.DataFrame(
            {"Close": [100.0] * len(dates)}, index=dates
        )
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)

        assert result is not None
        assert result["iv_source"] == "default"
        assert result["iv_used"] == pytest.approx(DEFAULT_IV)

    def test_implausible_stored_iv_ignored(self, db_session):
        """A stored IV of 0 (stale yfinance quote) must not be trusted."""
        signal = _make_signal(db_session, direction="call", strike=105.0, entry_iv=0.0)
        market = _mock_market(entry_price=100.0, exit_price=120.0)
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)

        assert result is not None
        assert result["iv_source"] != "chain"


class TestUnevaluableSignals:
    def test_history_gap_leaves_signal_pending(self, db_session):
        """A price-history gap around expiry leaves the signal unevaluated."""
        signal = _make_signal(db_session, direction="call", strike=105.0)
        market = MagicMock()
        # History ends 30 days ago — expiry (7 days ago) has no nearby bar.
        start = date.today() - timedelta(days=150)
        end = date.today() - timedelta(days=30)
        dates = pd.date_range(start=start, end=end, freq="B")
        market.fetch_price_history.return_value = pd.DataFrame(
            {"Close": [100.0] * len(dates)}, index=dates
        )
        tracker = FeedbackTracker(market_fetcher=market)

        result = tracker.evaluate_signal(signal, db_session)
        assert result is None

    def test_invalid_expiry_skipped(self, db_session):
        signal = _make_signal(db_session)
        signal.suggested_expiry = "not-a-date"
        tracker = FeedbackTracker(market_fetcher=_mock_market())

        assert tracker.evaluate_signal(signal, db_session) is None

    def test_empty_history_skipped(self, db_session):
        signal = _make_signal(db_session)
        market = MagicMock()
        market.fetch_price_history.return_value = pd.DataFrame()
        tracker = FeedbackTracker(market_fetcher=market)

        assert tracker.evaluate_signal(signal, db_session) is None


class TestAccuracyStats:
    def test_accuracy_stats(self, db_session):
        """Verify stats computation with mixed outcomes."""
        for i in range(4):
            _make_signal(db_session, outcome="profit", outcome_pnl=120.0, event_type="scandal")
        for i in range(3):
            _make_signal(db_session, outcome="loss", outcome_pnl=-60.0, event_type="fda_approval")
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
        assert stats["by_event_type"]["scandal"]["count"] == 7
        assert "by_direction" in stats
        assert len(stats["recent_signals"]) == 10

    def test_confusion_matrix(self, db_session):
        """Verify confusion matrix counts, including worthless expiries as misses."""
        for _ in range(3):
            _make_signal(db_session, direction="call", outcome="profit", outcome_pnl=50.0)
        for _ in range(2):
            _make_signal(db_session, direction="call", outcome="loss", outcome_pnl=-60.0)
        for _ in range(4):
            _make_signal(db_session, direction="put", outcome="profit", outcome_pnl=80.0)
        # A worthless expiry is a wrong directional bet, not a neutral event.
        for _ in range(1):
            _make_signal(db_session, direction="put", outcome="expired", outcome_pnl=-100.0)

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

        tracker = FeedbackTracker(market_fetcher=_mock_market())
        results = tracker.evaluate_all_pending(session=db_session)

        assert len(results) == 0
        db_session.refresh(signal)
        assert signal.outcome is None

    def test_evaluate_all_pending_stores_outcomes(self, db_session):
        signal = _make_signal(db_session, direction="call", strike=105.0, entry_iv=0.30)
        market = _mock_market(entry_price=100.0, exit_price=120.0)
        tracker = FeedbackTracker(market_fetcher=market)

        results = tracker.evaluate_all_pending(session=db_session)

        assert len(results) == 1
        db_session.refresh(signal)
        assert signal.outcome == "profit"
        assert signal.outcome_pnl == pytest.approx(results[0]["estimated_pnl"])

    def test_unevaluable_signal_left_pending(self, db_session):
        """Signals that can't be honestly evaluated keep outcome=None."""
        signal = _make_signal(db_session)
        market = MagicMock()
        market.fetch_price_history.return_value = pd.DataFrame()
        tracker = FeedbackTracker(market_fetcher=market)

        results = tracker.evaluate_all_pending(session=db_session)

        assert results == []
        db_session.refresh(signal)
        assert signal.outcome is None


class TestReevaluateAll:
    def test_reevaluate_restates_history(self, db_session):
        """reevaluate_all clears legacy proxy outcomes and re-scores with BS P&L."""
        # Legacy-evaluated signal with the old fake P&L convention.
        signal = _make_signal(
            db_session, direction="call", strike=105.0, entry_iv=0.30,
            outcome="profit", outcome_pnl=5.0,
        )
        market = _mock_market(entry_price=100.0, exit_price=95.0)
        tracker = FeedbackTracker(market_fetcher=market)

        summary = tracker.reevaluate_all(session=db_session)

        assert summary["previously_evaluated"] == 1
        assert summary["reevaluated"] == 1
        db_session.refresh(signal)
        # Under honest options P&L this OTM call expired worthless.
        assert signal.outcome == "expired"
        assert signal.outcome_pnl == -100.0

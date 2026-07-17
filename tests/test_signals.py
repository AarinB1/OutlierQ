"""Tests for Phase 4 signal generation engine.

Uses mocks for market data and in-memory SQLite for database tests.
"""

import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.database import Base
from src.db.tables import Event, Signal
from src.signals.signal_engine import (
    EVENT_PROFILES,
    SignalEngine,
    _get_strike_increment,
    _next_friday,
    _round_to_strike,
)


@pytest.fixture
def db_session():
    """Create a fresh in-memory SQLite database for each test."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def mock_market():
    """MarketFetcher mock that returns predictable data."""
    market = MagicMock()
    market.get_current_price.return_value = 150.0
    market.fetch_options_chain.return_value = {
        "calls": pd.DataFrame({
            "contractSymbol": ["AAPL260320C00155000"],
            "strike": [155.0],
            "bid": [3.50],
            "ask": [3.80],
            "volume": [120],
            "openInterest": [500],
            "impliedVolatility": [0.35],
        }),
        "puts": pd.DataFrame({
            "contractSymbol": ["AAPL260320P00142500"],
            "strike": [142.50],
            "bid": [2.80],
            "ask": [3.10],
            "volume": [85],
            "openInterest": [300],
            "impliedVolatility": [0.40],
        }),
    }
    return market


# ── Strike computation ────────────────────────────────────────────────


class TestComputeStrike:
    def test_put_strike_below_price(self):
        """Put strike should be below current price (OTM)."""
        strike = SignalEngine.compute_strike(150.0, "put", 0.05)
        assert strike < 150.0

    def test_call_strike_above_price(self):
        """Call strike should be above current price (OTM)."""
        strike = SignalEngine.compute_strike(150.0, "call", 0.05)
        assert strike > 150.0

    def test_strike_rounded_to_increment(self):
        """Strike should be rounded to the nearest standard increment."""
        # $150 stock → $2.50 increment
        strike = SignalEngine.compute_strike(150.0, "put", 0.05)
        # 150 * 0.95 = 142.5 → should round to 142.5 (exact $2.50 increment)
        assert strike == 142.5

    def test_strike_increment_under_50(self):
        """Stocks under $50 use $1 increments."""
        assert _get_strike_increment(30.0) == 1.0
        strike = SignalEngine.compute_strike(30.0, "call", 0.05)
        # 30 * 1.05 = 31.5 → round to $32
        assert strike == round(31.5 / 1.0) * 1.0

    def test_strike_increment_over_500(self):
        """Stocks over $500 use $10 increments."""
        assert _get_strike_increment(800.0) == 10.0
        strike = SignalEngine.compute_strike(800.0, "put", 0.05)
        # 800 * 0.95 = 760 → already on $10 increment
        assert strike == 760.0


# ── Expiry computation ────────────────────────────────────────────────


class TestComputeExpiry:
    def test_spike_fade_uses_min_days(self):
        """spike_fade events should use the minimum expiry window."""
        expiry = SignalEngine.compute_expiry(7, 14, "spike_fade")
        target = date.today() + timedelta(days=7)
        expiry_date = date.fromisoformat(expiry)
        # Should be on or after target, and on a Friday
        assert expiry_date.weekday() == 4  # Friday
        assert expiry_date >= target

    def test_sustained_uses_max_days(self):
        """sustained events should use the maximum expiry window."""
        expiry = SignalEngine.compute_expiry(14, 30, "sustained")
        target = date.today() + timedelta(days=30)
        expiry_date = date.fromisoformat(expiry)
        assert expiry_date.weekday() == 4
        assert expiry_date >= target or (target - expiry_date).days <= 6

    def test_moderate_uses_midpoint(self):
        """moderate events should use the midpoint of min and max."""
        expiry = SignalEngine.compute_expiry(7, 21, "moderate")
        target = date.today() + timedelta(days=14)
        expiry_date = date.fromisoformat(expiry)
        assert expiry_date.weekday() == 4
        # Should be within a week of the midpoint target
        assert abs((expiry_date - target).days) <= 6

    def test_expiry_always_friday(self):
        """All computed expiry dates should land on a Friday."""
        for decay in ["spike_fade", "sustained", "moderate"]:
            expiry = SignalEngine.compute_expiry(7, 30, decay)
            assert date.fromisoformat(expiry).weekday() == 4

    def test_next_friday_helper(self):
        """_next_friday should find the next Friday."""
        # Monday → should go to Friday of the same week
        monday = date(2026, 3, 16)  # A Monday
        assert _next_friday(monday).weekday() == 4
        assert _next_friday(monday) == date(2026, 3, 20)

        # Friday → should stay on Friday
        friday = date(2026, 3, 20)
        assert _next_friday(friday) == friday

        # Saturday → should go to next Friday
        saturday = date(2026, 3, 21)
        assert _next_friday(saturday) == date(2026, 3, 27)


# ── Contract lookup ───────────────────────────────────────────────────


class TestFindBestContract:
    def test_finds_call_contract(self, mock_market):
        engine = SignalEngine(market_fetcher=mock_market)
        contract = engine.find_best_contract("AAPL", "call", 155.0, "2026-03-20")

        assert contract is not None
        assert contract["strike"] == 155.0
        assert contract["open_interest"] == 500
        assert contract["volume"] == 120

    def test_finds_put_contract(self, mock_market):
        engine = SignalEngine(market_fetcher=mock_market)
        contract = engine.find_best_contract("AAPL", "put", 142.5, "2026-03-20")

        assert contract is not None
        assert contract["strike"] == 142.5

    def test_returns_none_on_empty_chain(self):
        market = MagicMock()
        market.fetch_options_chain.return_value = {
            "calls": pd.DataFrame(),
            "puts": pd.DataFrame(),
        }
        engine = SignalEngine(market_fetcher=market)
        contract = engine.find_best_contract("XYZ", "call", 100.0, "2026-03-20")

        assert contract is None

    def test_returns_none_on_fetch_error(self):
        market = MagicMock()
        market.fetch_options_chain.side_effect = Exception("API error")
        engine = SignalEngine(market_fetcher=market)
        contract = engine.find_best_contract("XYZ", "call", 100.0, "2026-03-20")

        assert contract is None


# ── Confidence computation ────────────────────────────────────────────


class TestComputeConfidence:
    def test_high_liquidity_boost(self):
        """High open interest and volume should boost confidence."""
        contract = {"open_interest": 200, "volume": 100, "implied_volatility": 0.3}
        conf = SignalEngine.compute_confidence(0.8, 0.8, contract)
        base = SignalEngine.compute_confidence(0.8, 0.8, None)
        assert conf > base

    def test_high_iv_penalty(self):
        """High implied volatility should reduce confidence."""
        low_iv = {"open_interest": 200, "volume": 100, "implied_volatility": 0.3}
        high_iv = {"open_interest": 200, "volume": 100, "implied_volatility": 1.5}
        conf_low = SignalEngine.compute_confidence(0.8, 0.8, low_iv)
        conf_high = SignalEngine.compute_confidence(0.8, 0.8, high_iv)
        assert conf_high < conf_low

    def test_no_contract_penalty(self):
        """No contract found should reduce confidence."""
        conf_with = SignalEngine.compute_confidence(0.8, 0.8, {"open_interest": 0, "volume": 0, "implied_volatility": 0.3})
        conf_without = SignalEngine.compute_confidence(0.8, 0.8, None)
        assert conf_without < conf_with

    def test_confidence_clamped(self):
        """Confidence should be clamped between 0.1 and 0.95."""
        # Very high inputs
        assert SignalEngine.compute_confidence(1.0, 1.0, {"open_interest": 1000, "volume": 500, "implied_volatility": 0.1}) <= 0.95
        # Very low inputs
        assert SignalEngine.compute_confidence(0.0, 0.0, None) >= 0.1


# ── Signal generation ─────────────────────────────────────────────────


class TestGenerateSignal:
    def test_scandal_generates_put(self, mock_market):
        """Scandal events should generate put signals."""
        engine = SignalEngine(market_fetcher=mock_market)
        signal = engine.generate_signal({
            "ticker": "AAPL",
            "event_type": "scandal",
            "event_id": "evt-123",
            "confidence": 0.85,
        })

        assert signal is not None
        assert signal["direction"] == "put"
        assert signal["ticker"] == "AAPL"
        assert signal["suggested_strike"] < 150.0
        assert signal["confidence"] > 0
        assert "scandal" in signal["reasoning"].lower()

    def test_fda_generates_call(self, mock_market):
        """FDA approval events should generate call signals."""
        engine = SignalEngine(market_fetcher=mock_market)
        signal = engine.generate_signal({
            "ticker": "AAPL",
            "event_type": "fda_approval",
            "event_id": "evt-456",
            "confidence": 0.90,
        })

        assert signal is not None
        assert signal["direction"] == "call"
        assert signal["suggested_strike"] >= 150.0  # at or above current price

    def test_other_returns_none_when_low_confidence(self, mock_market):
        """'other' event with low detection confidence returns None (no exploratory)."""
        engine = SignalEngine(market_fetcher=mock_market)
        signal = engine.generate_signal({
            "ticker": "AAPL",
            "event_type": "other",
            "event_id": "evt-789",
            "confidence": 0.49,
            "metadata": {"mean_sentiment": 0.3},
        })
        assert signal is None

    def test_exploratory_signal_bullish(self, mock_market):
        """Event type 'other' with mean_sentiment 0.3 -> generates call signal with exploratory=True."""
        engine = SignalEngine(market_fetcher=mock_market)
        signal = engine.generate_signal({
            "ticker": "AAPL",
            "event_type": "other",
            "event_id": "evt-exp",
            "confidence": 0.65,
            "metadata": {"mean_sentiment": 0.3},
        })
        assert signal is not None
        assert signal["direction"] == "call"
        assert signal["exploratory"] is True
        assert signal["ticker"] == "AAPL"

    def test_exploratory_signal_bearish(self, mock_market):
        """Event type 'other' with mean_sentiment -0.3 -> generates put signal."""
        engine = SignalEngine(market_fetcher=mock_market)
        signal = engine.generate_signal({
            "ticker": "AAPL",
            "event_type": "other",
            "event_id": "evt-exp2",
            "confidence": 0.7,
            "metadata": {"mean_sentiment": -0.3},
        })
        assert signal is not None
        assert signal["direction"] == "put"
        assert signal["exploratory"] is True

    def test_exploratory_signal_mildly_bearish(self, mock_market):
        """Event type 'other' with mean_sentiment -0.11 should generate a put."""
        engine = SignalEngine(market_fetcher=mock_market)
        signal = engine.generate_signal({
            "ticker": "AAPL",
            "event_type": "other",
            "event_id": "evt-mild-bear",
            "confidence": 0.55,
            "metadata": {"mean_sentiment": -0.11},
        })
        assert signal is not None
        assert signal["direction"] == "put"
        assert signal["exploratory"] is True

    def test_exploratory_signal_neutral_skips(self, mock_market):
        """Event type 'other' with mean_sentiment 0.05 (between -0.10 and 0.15) -> returns None."""
        engine = SignalEngine(market_fetcher=mock_market)
        signal = engine.generate_signal({
            "ticker": "AAPL",
            "event_type": "other",
            "event_id": "evt-neut",
            "confidence": 0.7,
            "metadata": {"mean_sentiment": 0.05},
        })
        assert signal is None

    def test_exploratory_low_confidence_skips(self, mock_market):
        """Event type 'other' with detection confidence 0.4 -> returns None."""
        engine = SignalEngine(market_fetcher=mock_market)
        signal = engine.generate_signal({
            "ticker": "AAPL",
            "event_type": "other",
            "event_id": "evt-low",
            "confidence": 0.4,
            "metadata": {"mean_sentiment": 0.3},
        })
        assert signal is None

    def test_signal_includes_contract(self, mock_market):
        """Signal should include real contract data when available."""
        engine = SignalEngine(market_fetcher=mock_market)
        signal = engine.generate_signal({
            "ticker": "AAPL",
            "event_type": "earnings_beat",
            "event_id": "evt-100",
            "confidence": 0.80,
        })

        assert signal is not None
        assert signal["contract"] is not None
        assert "contract_symbol" in signal["contract"]

    def test_signal_without_price_returns_none(self):
        """If price fetch fails, should return None."""
        market = MagicMock()
        market.get_current_price.side_effect = ValueError("No data")
        engine = SignalEngine(market_fetcher=market)
        signal = engine.generate_signal({
            "ticker": "INVALID",
            "event_type": "scandal",
            "event_id": "evt-999",
            "confidence": 0.80,
        })

        assert signal is None

    def test_edgar_only_keeps_classified_profile(self, mock_market):
        """EDGAR-source events should keep classified profile parameters."""
        engine = SignalEngine(market_fetcher=mock_market)
        signal = engine.generate_signal(
            {
                "ticker": "AAPL",
                "event_type": "scandal",  # classified from EDGAR item mapping
                "event_id": "evt-edgar-scandal",
                "confidence": 0.8,
                "metadata": {
                    "source": "edgar",
                    "edgar_data": {
                        "combined_direction": "bearish",
                        "combined_severity": 0.9,
                        "summary": "Restatement filing detected",
                        "8k_analysis": {"recent_8k_count": 1},
                    },
                },
            }
        )
        assert signal is not None
        # Must use scandal profile, not generic edgar profile.
        assert signal["expected_move_pct"] == EVENT_PROFILES["scandal"]["expected_move_pct"]
        assert signal["decay_type"] == EVENT_PROFILES["scandal"]["decay_type"]
        assert signal["direction"] == "put"

    def test_news_with_edgar_data_applies_edgar_direction(self, mock_market):
        """News-pipeline events with EDGAR data should use EDGAR direction override."""
        engine = SignalEngine(market_fetcher=mock_market)
        signal = engine.generate_signal(
            {
                "ticker": "AAPL",
                "event_type": "major_contract",
                "event_id": "evt-news-edgar",
                "confidence": 0.75,
                "metadata": {
                    "source": "news_pipeline",
                    "edgar_data": {
                        "combined_direction": "bearish",
                        "combined_severity": 0.7,
                        "summary": "Bearish SEC filing context",
                        "8k_analysis": {"recent_8k_count": 2},
                    },
                },
            }
        )
        assert signal is not None
        # Keep profile characteristics from classified event type.
        assert signal["expected_move_pct"] == EVENT_PROFILES["major_contract"]["expected_move_pct"]
        assert signal["decay_type"] == EVENT_PROFILES["major_contract"]["decay_type"]
        # But override direction from EDGAR data.
        assert signal["direction"] == "put"
        assert "SEC filing detected" in signal["reasoning"]


# ── Batch and store ───────────────────────────────────────────────────


class TestGenerateSignals:
    def test_batch_sorted_by_confidence(self, mock_market):
        """generate_signals should return results sorted by confidence desc."""
        engine = SignalEngine(market_fetcher=mock_market)
        events = [
            {"ticker": "AAPL", "event_type": "recall", "event_id": "e1", "confidence": 0.50},
            {"ticker": "AAPL", "event_type": "scandal", "event_id": "e2", "confidence": 0.90},
            {"ticker": "AAPL", "event_type": "earnings_beat", "event_id": "e3", "confidence": 0.70},
        ]
        signals = engine.generate_signals(events)

        assert len(signals) == 3
        assert signals[0]["confidence"] >= signals[1]["confidence"]
        assert signals[1]["confidence"] >= signals[2]["confidence"]

    def test_filters_out_other(self, mock_market):
        """generate_signals should skip 'other' events."""
        engine = SignalEngine(market_fetcher=mock_market)
        events = [
            {"ticker": "AAPL", "event_type": "scandal", "event_id": "e1", "confidence": 0.80},
            {"ticker": "AAPL", "event_type": "other", "event_id": "e2", "confidence": 0.50},
        ]
        signals = engine.generate_signals(events)

        assert len(signals) == 1
        assert signals[0]["event_type"] == "scandal"

    def test_generate_and_store(self, db_session, mock_market):
        """generate_and_store should create Signal records in the database."""
        # Create an event to link the signal to
        event = Event(
            id="evt-store-test",
            ticker="AAPL",
            event_type="scandal",
            direction="bearish",
            confidence=0.85,
        )
        db_session.add(event)
        db_session.flush()

        engine = SignalEngine(market_fetcher=mock_market)
        event_dicts = [{
            "ticker": "AAPL",
            "event_type": "scandal",
            "event_id": "evt-store-test",
            "confidence": 0.85,
        }]

        stored = engine.generate_and_store(event_dicts, session=db_session)

        assert len(stored) == 1
        assert stored[0].ticker == "AAPL"
        assert stored[0].direction == "put"
        assert stored[0].event_id == "evt-store-test"
        assert stored[0].suggested_strike is not None
        assert stored[0].suggested_expiry is not None

        # Verify it's in the DB
        db_session.expire_all()
        record = db_session.query(Signal).filter(Signal.event_id == "evt-store-test").one()
        assert record.direction == "put"
        # Entry snapshot for later Black-Scholes evaluation must be persisted.
        assert record.entry_price == 150.0
        assert record.entry_iv == pytest.approx(0.40)  # put chain IV from mock

    def test_generate_and_store_without_contract_leaves_iv_null(self, db_session):
        """When no chain contract is found, entry_iv stays NULL (fallback at eval time)."""
        event = Event(
            id="evt-no-chain",
            ticker="XYZ",
            event_type="scandal",
            direction="bearish",
            confidence=0.85,
        )
        db_session.add(event)
        db_session.flush()

        market = MagicMock()
        market.get_current_price.return_value = 80.0
        market.fetch_options_chain.return_value = {
            "calls": pd.DataFrame(),
            "puts": pd.DataFrame(),
        }
        engine = SignalEngine(market_fetcher=market)
        stored = engine.generate_and_store(
            [{
                "ticker": "XYZ",
                "event_type": "scandal",
                "event_id": "evt-no-chain",
                "confidence": 0.85,
            }],
            session=db_session,
        )

        assert len(stored) == 1
        assert stored[0].entry_price == 80.0
        assert stored[0].entry_iv is None

    def test_contract_lookup_targets_signal_expiry(self, mock_market):
        """The chain lookup should request the signal's expiry, not just the front week."""
        engine = SignalEngine(market_fetcher=mock_market)
        engine.generate_signal({
            "ticker": "AAPL",
            "event_type": "scandal",
            "event_id": "evt-expiry",
            "confidence": 0.85,
        })
        _, kwargs = mock_market.fetch_options_chain.call_args
        assert "target_expiry" in kwargs
        date.fromisoformat(kwargs["target_expiry"])  # valid YYYY-MM-DD


# ── All event profiles produce valid signals ──────────────────────────


class TestAllProfiles:
    def test_every_profile_generates_signal(self, mock_market):
        """Every event type in EVENT_PROFILES should generate a valid signal."""
        engine = SignalEngine(market_fetcher=mock_market)

        for event_type, profile in EVENT_PROFILES.items():
            signal = engine.generate_signal({
                "ticker": "AAPL",
                "event_type": event_type,
                "event_id": f"evt-{event_type}",
                "confidence": 0.75,
            })

            assert signal is not None, f"No signal for {event_type}"
            assert signal["direction"] == profile["direction"]
            assert signal["expected_move_pct"] == profile["expected_move_pct"]
            assert signal["decay_type"] == profile["decay_type"]
            assert 0.1 <= signal["confidence"] <= 0.95

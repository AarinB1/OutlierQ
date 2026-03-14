"""Tests for Phase 3 event classification.

Uses an in-memory SQLite database for fast, isolated tests.
"""

import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.classification.event_classifier import EventClassifier
from src.db.database import Base
from src.db.tables import Article, Event


@pytest.fixture
def db_session():
    """Create a fresh in-memory SQLite database for each test."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_article(
    ticker: str = "AAPL",
    headline: str = "Test headline",
    summary: str | None = None,
    source: str = "TestSource",
) -> Article:
    """Helper to create an Article with sensible defaults."""
    now = datetime.now(timezone.utc)
    return Article(
        id=str(uuid.uuid4()),
        ticker=ticker,
        headline=headline,
        summary=summary,
        source=source,
        url=f"https://example.com/{uuid.uuid4()}",
        published_at=now,
        ingested_at=now,
    )


# ── Single article classification ────────────────────────────────────


class TestClassifyArticle:
    def test_classify_scandal(self):
        """Fraud/arrest headline should classify as scandal (bearish)."""
        clf = EventClassifier()
        result = clf.classify_article("CEO arrested in massive fraud investigation")

        assert result["event_type"] == "scandal"
        assert result["direction"] == "bearish"

    def test_classify_fda(self):
        """FDA approval headline should classify as fda_approval (bullish)."""
        clf = EventClassifier()
        result = clf.classify_article("FDA approves groundbreaking cancer treatment")

        assert result["event_type"] == "fda_approval"
        assert result["direction"] == "bullish"

    def test_classify_earnings_beat(self):
        """Record revenue + raised guidance should classify as earnings_beat (bullish)."""
        clf = EventClassifier()
        result = clf.classify_article(
            "Company reports record revenue, raises guidance for next quarter"
        )

        assert result["event_type"] == "earnings_beat"
        assert result["direction"] == "bullish"

    def test_classify_earnings_miss(self):
        """Revenue miss + guidance cut should classify as earnings_miss (bearish)."""
        clf = EventClassifier()
        result = clf.classify_article(
            "Revenue misses estimates as demand weakens, guidance cut"
        )

        assert result["event_type"] == "earnings_miss"
        assert result["direction"] == "bearish"

    def test_classify_recall(self):
        """Product recall headline should classify as recall (bearish)."""
        clf = EventClassifier()
        result = clf.classify_article(
            "Major product recall issued due to safety defect"
        )

        assert result["event_type"] == "recall"
        assert result["direction"] == "bearish"

    def test_classify_ambiguous(self):
        """Bland headline with no strong keywords should classify as other."""
        clf = EventClassifier()
        result = clf.classify_article("Company announces quarterly results")

        assert result["event_type"] == "other"

    def test_classify_high_confidence(self):
        """Strong keyword matches should produce confidence > 0.7."""
        clf = EventClassifier()
        result = clf.classify_article(
            "CEO arrested for massive fraud and embezzlement scheme"
        )

        assert result["confidence"] > 0.7

    def test_classify_low_confidence(self):
        """Weak/ambiguous match should have lower confidence than strong match."""
        clf = EventClassifier()
        weak = clf.classify_article("Company faces controversy and probe")
        strong = clf.classify_article(
            "CEO arrested for massive fraud and embezzlement scheme"
        )

        assert weak["confidence"] < strong["confidence"]


# ── Multi-article event classification ───────────────────────────────


class TestClassifyEvent:
    def test_majority_vote(self, db_session):
        """3 scandal articles + 2 legal articles → scandal wins majority."""
        articles = [
            _make_article(headline="CEO arrested in massive fraud scheme"),
            _make_article(headline="Executives indicted for corruption"),
            _make_article(headline="Whistleblower exposes company scandal"),
            _make_article(headline="Class action lawsuit filed against company"),
            _make_article(headline="SEC charges company with violations"),
        ]
        for a in articles:
            db_session.add(a)
        db_session.flush()

        clf = EventClassifier()
        result = clf.classify_event(articles)

        assert result["event_type"] == "scandal"
        assert result["direction"] == "bearish"
        assert result["vote_distribution"]["scandal"] >= 3

    def test_common_themes_boost(self, db_session):
        """Common themes containing high-weight keywords should boost confidence."""
        articles = [
            _make_article(headline="CEO arrested for fraud"),
            _make_article(headline="Executive indicted in corruption scheme"),
        ]
        for a in articles:
            db_session.add(a)
        db_session.flush()

        clf = EventClassifier()

        # Without boost
        result_no_boost = clf.classify_event(articles, common_themes=["company", "stock"])
        # With boost (fraud is a high-weight keyword)
        result_boosted = clf.classify_event(articles, common_themes=["fraud", "ceo"])

        assert result_boosted["confidence"] >= result_no_boost["confidence"]


# ── Reclassify existing events ───────────────────────────────────────


class TestReclassify:
    def test_reclassify_updates_db(self, db_session):
        """Create an 'other' event with scandal articles, reclassify → scandal."""
        # Create articles that clearly indicate a scandal
        articles = [
            _make_article(
                ticker="TSLA",
                headline="CEO arrested in massive fraud investigation",
            ),
            _make_article(
                ticker="TSLA",
                headline="Executives indicted for corruption and bribery",
            ),
            _make_article(
                ticker="TSLA",
                headline="Whistleblower reveals massive embezzlement scheme",
            ),
        ]
        for a in articles:
            db_session.add(a)
        db_session.flush()

        article_ids = [a.id for a in articles]

        # Create an event with event_type "other" (as Phase 2 would have)
        event = Event(
            id=str(uuid.uuid4()),
            ticker="TSLA",
            event_type="other",
            direction="bearish",
            confidence=0.5,
            article_ids=article_ids,
            metadata_json={"common_themes": ["fraud"]},
        )
        db_session.add(event)
        db_session.flush()

        # Reclassify
        clf = EventClassifier()
        results = clf.reclassify_events(event_ids=[event.id], session=db_session)

        assert len(results) == 1
        assert results[0]["old_type"] == "other"
        assert results[0]["new_type"] == "scandal"
        assert results[0]["new_direction"] == "bearish"

        # Verify the DB record was updated
        db_session.expire_all()
        updated_event = db_session.query(Event).filter(Event.id == event.id).one()
        assert updated_event.event_type == "scandal"
        assert updated_event.direction == "bearish"
        assert updated_event.confidence > 0.5

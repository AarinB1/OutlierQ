"""Tests for MarketMatcher event-dict construction and matching."""

import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.database import Base
from src.db.tables import Article, Event
from src.predictions.market_matcher import MarketMatcher, build_event_dicts


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_build_event_dicts_pulls_article_headlines(db_session):
    """Event rows have no .headline; headlines must come from linked articles."""
    from datetime import datetime, timezone

    article_ids = []
    for i in range(2):
        a = Article(
            id=f"art-{uuid.uuid4()}",
            ticker="ACME",
            headline=f"ACME faces SEC probe {i}",
            source="reuters",
            url=f"https://example.com/{uuid.uuid4()}",
            published_at=datetime.now(timezone.utc),
        )
        db_session.add(a)
        article_ids.append(a.id)
    db_session.flush()

    event = Event(
        id="evt-headlines",
        ticker="ACME",
        event_type="scandal",
        direction="bearish",
        confidence=0.8,
        article_ids=article_ids,
    )
    db_session.add(event)
    db_session.flush()

    dicts = build_event_dicts([event], db_session)

    assert len(dicts) == 1
    assert dicts[0]["ticker"] == "ACME"
    assert len(dicts[0]["headlines"]) == 2
    assert all("ACME faces SEC probe" in h for h in dicts[0]["headlines"])


def test_build_event_dicts_handles_missing_articles(db_session):
    event = Event(
        id="evt-bare",
        ticker="ACME",
        event_type="options_flow",
        direction="bullish",
        confidence=0.7,
        article_ids=None,
    )
    db_session.add(event)
    db_session.flush()

    dicts = build_event_dicts([event], db_session)
    assert dicts[0]["headlines"] == []


def test_headlines_enable_semantic_matching():
    """With real headlines present, the semantic tier can produce matches."""
    matcher = MarketMatcher()
    events = [{
        "ticker": "ZZZQ",  # not mentioned in the question
        "event_type": "other",  # no keyword mapping
        "direction": "bearish",
        "confidence": 0.8,
        "headlines": ["Will the Federal Reserve cut interest rates in December?"],
    }]
    markets = [{
        "market_id": "m1",
        "platform": "kalshi",
        "question": "Will the Federal Reserve cut interest rates in December?",
        "yes_price": 0.4,
    }]

    matches = matcher.match_events_to_markets(events, markets)

    assert len(matches) == 1
    assert matches[0]["match_method"] == "semantic"


def test_conflict_check_only_fires_on_real_tickers():
    """A question naming a different ticker is rejected; ordinary words are not."""
    matcher = MarketMatcher()

    # Real conflicting ticker -> no match.
    score, method = matcher._score_match(
        "ACME", "earnings_beat", [],
        "Will TSLA report record quarterly earnings and revenue this quarter?",
    )
    assert (score, method) == (0.0, "conflict")

    # Ordinary lowercase words must not be mistaken for tickers.
    score, method = matcher._score_match(
        "ACME", "earnings_beat", [],
        "Will the company report record quarterly earnings and revenue?",
    )
    assert method == "keyword"
    assert score > 0

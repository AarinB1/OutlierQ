"""SQLAlchemy table definitions for OutlierQ.

All tables use String UUIDs as primary keys for SQLite compatibility.
JSON columns are used instead of JSONB/ARRAY (PostgreSQL-specific types).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, JSON, String, Text

from src.db.database import Base


def _generate_uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Article(Base):
    __tablename__ = "articles"

    id = Column(String, primary_key=True, default=_generate_uuid)
    ticker = Column(String, nullable=False, index=True)
    headline = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    source = Column(String, nullable=False)
    url = Column(String, nullable=False, unique=True)
    published_at = Column(DateTime, nullable=False)
    ingested_at = Column(DateTime, default=_utcnow)
    sentiment_score = Column(Float, nullable=True)
    sentiment_magnitude = Column(Float, nullable=True)
    raw_json = Column(JSON, nullable=True)

    def __repr__(self) -> str:
        return f"<Article {self.ticker} — {self.headline[:50]}>"


class Event(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True, default=_generate_uuid)
    ticker = Column(String, nullable=False, index=True)
    event_type = Column(String, nullable=False)  # scandal, legal, fda_approval, etc.
    direction = Column(String, nullable=False)    # bullish / bearish
    confidence = Column(Float, nullable=False)
    detected_at = Column(DateTime, default=_utcnow)
    article_ids = Column(JSON, nullable=True)     # list of UUID strings
    metadata_json = Column(JSON, nullable=True)

    def __repr__(self) -> str:
        return f"<Event {self.ticker} {self.event_type} ({self.direction})>"


class Signal(Base):
    __tablename__ = "signals"

    id = Column(String, primary_key=True, default=_generate_uuid)
    ticker = Column(String, nullable=False, index=True)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    direction = Column(String, nullable=False)       # call / put
    suggested_strike = Column(Float, nullable=True)
    suggested_expiry = Column(String, nullable=True)
    confidence = Column(Float, nullable=False)
    created_at = Column(DateTime, default=_utcnow)
    outcome = Column(String, nullable=True)          # profit / loss / expired
    outcome_pnl = Column(Float, nullable=True)

    def __repr__(self) -> str:
        return f"<Signal {self.ticker} {self.direction} conf={self.confidence:.2f}>"

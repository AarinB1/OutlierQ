"""Database model and helpers for discovered tickers."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, JSON, String
from sqlalchemy.orm import Session

from src.db.database import Base


def _generate_uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DiscoveredTicker(Base):
    """Tracks tickers found by the discovery system (news scanner, volume screener)."""

    __tablename__ = "discovered_tickers"

    id = Column(String, primary_key=True, default=_generate_uuid)
    ticker = Column(String, nullable=False, index=True)
    discovery_method = Column(String, nullable=False)  # "news_scanner", "volume_screener", "both"
    discovery_confidence = Column(Float, nullable=False)
    mention_count = Column(Integer, nullable=True)
    volume_ratio = Column(Float, nullable=True)
    sample_headlines = Column(JSON, nullable=True)  # list[str]
    discovered_at = Column(DateTime, default=_utcnow, index=True)
    scanned = Column(Boolean, default=False, nullable=False)
    signal_generated = Column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:
        return f"<DiscoveredTicker {self.ticker} {self.discovery_method}>"


def store_discovery(session: Session, payload: dict[str, Any]) -> DiscoveredTicker:
    """Insert a discovery record. Caller must commit."""
    row = DiscoveredTicker(
        ticker=payload["ticker"],
        discovery_method=payload["discovery_method"],
        discovery_confidence=payload["discovery_confidence"],
        mention_count=payload.get("mention_count"),
        volume_ratio=payload.get("volume_ratio"),
        sample_headlines=payload.get("sample_headlines"),
        discovered_at=payload.get("discovered_at", _utcnow()),
        scanned=payload.get("scanned", False),
        signal_generated=payload.get("signal_generated", False),
    )
    session.add(row)
    session.flush()
    return row


def was_recently_scanned(session: Session, ticker: str, within_hours: float = 2.0) -> bool:
    """Return True if this ticker was discovered (and thus scanned) within the last N hours."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=within_hours)
    return (
        session.query(DiscoveredTicker)
        .filter(
            DiscoveredTicker.ticker == ticker.upper(),
            DiscoveredTicker.discovered_at >= cutoff,
        )
        .limit(1)
        .first()
        is not None
    )

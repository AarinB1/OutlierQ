"""Pydantic models for validation and serialization."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Articles ──────────────────────────────────────────────────────────

class ArticleCreate(BaseModel):
    """Incoming article data before it gets a DB-generated id."""
    ticker: str
    headline: str
    summary: Optional[str] = None
    source: str
    url: str
    published_at: datetime
    sentiment_score: Optional[float] = None
    sentiment_magnitude: Optional[float] = None
    raw_json: Optional[dict] = None


class ArticleRead(ArticleCreate):
    """Full article record as stored in the database."""
    id: str
    ingested_at: datetime

    model_config = {"from_attributes": True}


# ── Events ────────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    ticker: str
    event_type: str = Field(
        ...,
        pattern="^(scandal|legal|earnings_miss|recall|fda_approval|breakthrough|major_contract|earnings_beat|other)$",
    )
    direction: str = Field(..., pattern="^(bullish|bearish)$")
    confidence: float = Field(..., ge=0.0, le=1.0)
    article_ids: list[str] = []
    metadata_json: Optional[dict] = None


class EventRead(EventCreate):
    id: str
    detected_at: datetime

    model_config = {"from_attributes": True}


# ── Signals ───────────────────────────────────────────────────────────

class SignalCreate(BaseModel):
    ticker: str
    event_id: str
    direction: str = Field(..., pattern="^(call|put)$")
    suggested_strike: Optional[float] = None
    suggested_expiry: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)


class SignalRead(SignalCreate):
    id: str
    created_at: datetime
    outcome: Optional[str] = None
    outcome_pnl: Optional[float] = None

    model_config = {"from_attributes": True}

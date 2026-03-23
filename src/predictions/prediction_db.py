"""SQLAlchemy models for prediction market data."""

from datetime import datetime
from sqlalchemy import Column, DateTime, Float, Integer, String, Text, Boolean
from src.db.database import Base


class PredictionMarket(Base):
    """Cached prediction market metadata from Polymarket/Kalshi."""
    __tablename__ = "prediction_markets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    platform = Column(String(20), nullable=False)          # "polymarket" | "kalshi"
    market_id = Column(String(255), nullable=False, unique=True)  # condition_id or ticker
    slug = Column(String(500))
    question = Column(Text, nullable=False)
    category = Column(String(100))
    status = Column(String(20), default="open")            # open | closed | resolved
    yes_price = Column(Float)                              # 0.0–1.0
    no_price = Column(Float)
    volume = Column(Float)
    resolution_date = Column(DateTime)
    outcome = Column(String(10))                           # "yes" | "no" | null
    last_fetched = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


class Prediction(Base):
    """Bot's prediction on a market."""
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    market_id = Column(String(255), nullable=False)        # FK to prediction_markets.market_id
    platform = Column(String(20), nullable=False)
    question = Column(Text)

    # Bot's assessment
    predicted_outcome = Column(String(10), nullable=False)  # "yes" | "no"
    predicted_probability = Column(Float, nullable=False)    # 0.0–1.0, bot's estimated prob of YES
    market_probability = Column(Float)                       # market's YES price at prediction time
    edge = Column(Float)                                     # predicted_prob - market_prob (signed)
    confidence = Column(Float)                               # 0.0–1.0

    # Linkage to OutlierQ events
    matched_event_type = Column(String(50))                  # e.g. "earnings_beat", "fda_approval"
    matched_tickers = Column(Text)                           # comma-separated tickers
    match_method = Column(String(50))                        # "keyword" | "ticker" | "semantic"

    # Resolution
    actual_outcome = Column(String(10))                      # "yes" | "no" | null
    is_correct = Column(Boolean)
    pnl_if_bet = Column(Float)                               # hypothetical $ P&L on $1 YES/NO bet

    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime)

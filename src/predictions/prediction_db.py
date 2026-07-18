"""SQLAlchemy models for prediction market data."""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, Boolean
from src.db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


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
    last_fetched = Column(DateTime, default=_utcnow)
    created_at = Column(DateTime, default=_utcnow)


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

    # MiroFish simulation enrichment
    simulation_enhanced = Column(Boolean, default=False)
    sim_estimated_probability = Column(Float)      # MiroFish's probability estimate
    sim_consensus_strength = Column(Float)          # 0.0–1.0
    sim_yes_pct = Column(Float)                     # % of agents saying YES
    sim_narrative = Column(Text)                    # key factors / narrative

    # Resolution
    actual_outcome = Column(String(10))                      # "yes" | "no" | null
    is_correct = Column(Boolean)
    pnl_if_bet = Column(Float)                               # hypothetical $ P&L on $1 YES/NO bet

    created_at = Column(DateTime, default=_utcnow)
    resolved_at = Column(DateTime)


class ArbitrageOpportunity(Base):
    """Detected price discrepancy between platforms on the same event."""
    __tablename__ = "arbitrage_opportunities"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Polymarket side
    poly_market_id = Column(String(255), nullable=False)
    poly_question = Column(Text)
    poly_yes_price = Column(Float, nullable=False)
    poly_volume = Column(Float)

    # Kalshi side
    kalshi_market_id = Column(String(255), nullable=False)
    kalshi_question = Column(Text)
    kalshi_yes_price = Column(Float, nullable=False)
    kalshi_volume = Column(Float)

    # Arbitrage metrics
    spread = Column(Float, nullable=False)          # abs(poly_yes - kalshi_yes)
    spread_pct = Column(Float, nullable=False)       # spread as % of midpoint
    direction = Column(String(50), nullable=False)   # "buy_poly_yes" | "buy_kalshi_yes"
    match_score = Column(Float, nullable=False)      # 0.0-1.0, how confident the question match is
    match_method = Column(String(50))                # "exact" | "fuzzy" | "keyword"

    # Hypothetical P&L
    theoretical_profit = Column(Float)               # profit per $1 if arb is real and resolves

    # Status
    status = Column(String(20), default="open")      # open | closed | expired | false_positive
    notes = Column(Text)

    detected_at = Column(DateTime, default=_utcnow)
    closed_at = Column(DateTime)

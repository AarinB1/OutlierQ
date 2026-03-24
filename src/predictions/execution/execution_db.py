"""SQLAlchemy models for prediction market execution tracking."""

from datetime import datetime
from sqlalchemy import Column, DateTime, Float, Integer, String, Text
from src.db.database import Base


class PredictionOrder(Base):
    """An order placed (or simulated) on a prediction market."""
    __tablename__ = "prediction_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    prediction_id = Column(Integer, nullable=False)
    market_id = Column(String(255), nullable=False)
    platform = Column(String(20), nullable=False)       # "polymarket" | "kalshi"
    mode = Column(String(10), nullable=False)            # "paper" | "live"

    # Order details
    side = Column(String(10), nullable=False)            # "yes" | "no"
    action = Column(String(10), nullable=False)          # "buy" | "sell"
    contracts = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)                # entry price (0.0-1.0)
    cost = Column(Float, nullable=False)                 # total cost in dollars

    # Platform response
    platform_order_id = Column(String(255))
    client_order_id = Column(String(255))
    status = Column(String(20), default="pending")       # pending|filled|partial|rejected|cancelled
    filled_contracts = Column(Integer, default=0)
    filled_price = Column(Float)

    # Resolution
    pnl = Column(Float)
    exit_price = Column(Float)
    exit_reason = Column(String(50))                     # "resolved"|"sold"|"expired"

    created_at = Column(DateTime, default=datetime.utcnow)
    filled_at = Column(DateTime)
    resolved_at = Column(DateTime)


class PredictionPosition(Base):
    """Current open position on a prediction market."""
    __tablename__ = "prediction_positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    market_id = Column(String(255), nullable=False, unique=True)
    platform = Column(String(20), nullable=False)
    question = Column(Text)
    side = Column(String(10), nullable=False)            # "yes" | "no"
    contracts = Column(Integer, nullable=False)
    avg_price = Column(Float, nullable=False)
    cost_basis = Column(Float, nullable=False)
    current_price = Column(Float)
    unrealized_pnl = Column(Float)
    mode = Column(String(10), nullable=False)            # "paper" | "live"
    opened_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class BankrollSnapshot(Base):
    """Point-in-time bankroll state for tracking performance over time."""
    __tablename__ = "bankroll_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mode = Column(String(10), nullable=False)
    total_bankroll = Column(Float, nullable=False)
    available_cash = Column(Float, nullable=False)
    deployed_capital = Column(Float, nullable=False)
    total_pnl = Column(Float, nullable=False)
    open_positions = Column(Integer, nullable=False)
    win_count = Column(Integer, default=0)
    loss_count = Column(Integer, default=0)
    timestamp = Column(DateTime, default=datetime.utcnow)

"""SQLAlchemy table definitions for the short-term trading module.

Coexists with existing Article, Event, Signal tables.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text

from src.db.database import Base


def _generate_uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TradeSignal(Base):
    __tablename__ = "trade_signals"

    id = Column(String, primary_key=True, default=_generate_uuid)
    ticker = Column(String, nullable=False, index=True)
    direction = Column(String, nullable=False)  # BUY / SELL / SHORT
    strategy_name = Column(String, nullable=False)
    model_name = Column(String, nullable=True)
    entry_price = Column(Float, nullable=True)
    target_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    confidence = Column(Float, nullable=False)
    timeframe = Column(String, nullable=True)  # swing / intraday
    status = Column(String, default="pending")  # pending / active / closed / cancelled
    pnl = Column(Float, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    metadata_json = Column(JSON, nullable=True)

    def __repr__(self) -> str:
        return f"<TradeSignal {self.ticker} {self.direction} conf={self.confidence:.2f}>"


class TradeExecution(Base):
    __tablename__ = "trade_executions"

    id = Column(String, primary_key=True, default=_generate_uuid)
    signal_id = Column(String, ForeignKey("trade_signals.id"), nullable=True)
    ticker = Column(String, nullable=False, index=True)
    direction = Column(String, nullable=False)
    entry_time = Column(DateTime, nullable=True)
    exit_time = Column(DateTime, nullable=True)
    entry_price = Column(Float, nullable=True)
    exit_price = Column(Float, nullable=True)
    quantity = Column(Integer, nullable=True)
    pnl_dollars = Column(Float, nullable=True)
    pnl_percent = Column(Float, nullable=True)
    fees = Column(Float, default=0.0)
    slippage = Column(Float, default=0.0)
    exit_reason = Column(String, nullable=True)
    strategy_name = Column(String, nullable=True)

    def __repr__(self) -> str:
        return f"<TradeExecution {self.ticker} {self.direction} pnl={self.pnl_dollars}>"


class BacktestRun(Base):
    __tablename__ = "backtest_runs"

    id = Column(String, primary_key=True, default=_generate_uuid)
    strategy_name = Column(String, nullable=False)
    ticker = Column(String, nullable=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    initial_capital = Column(Float, default=100000.0)
    final_capital = Column(Float, nullable=True)
    sharpe = Column(Float, nullable=True)
    sortino = Column(Float, nullable=True)
    max_drawdown = Column(Float, nullable=True)
    win_rate = Column(Float, nullable=True)
    total_trades = Column(Integer, nullable=True)
    profit_factor = Column(Float, nullable=True)
    total_return_pct = Column(Float, nullable=True)
    config_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    def __repr__(self) -> str:
        return f"<BacktestRun {self.strategy_name} sharpe={self.sharpe}>"


class ModelCheckpoint(Base):
    __tablename__ = "model_checkpoints"

    id = Column(String, primary_key=True, default=_generate_uuid)
    model_name = Column(String, nullable=False)
    model_type = Column(String, nullable=False)  # lstm / transformer / hybrid / gbm
    version = Column(Integer, default=1)
    trained_at = Column(DateTime, default=_utcnow)
    val_accuracy = Column(Float, nullable=True)
    val_sharpe = Column(Float, nullable=True)
    feature_names = Column(JSON, nullable=True)
    hyperparameters = Column(JSON, nullable=True)
    model_path = Column(String, nullable=True)

    def __repr__(self) -> str:
        return f"<ModelCheckpoint {self.model_name} v{self.version}>"


class PortfolioState(Base):
    __tablename__ = "portfolio_states"

    id = Column(String, primary_key=True, default=_generate_uuid)
    timestamp = Column(DateTime, default=_utcnow)
    cash = Column(Float, nullable=False)
    total_value = Column(Float, nullable=False)
    positions_json = Column(JSON, nullable=True)
    daily_pnl = Column(Float, default=0.0)
    cumulative_pnl = Column(Float, default=0.0)
    max_drawdown = Column(Float, default=0.0)

    def __repr__(self) -> str:
        return f"<PortfolioState value={self.total_value:.0f}>"


class MarketRegime(Base):
    __tablename__ = "market_regimes"

    id = Column(String, primary_key=True, default=_generate_uuid)
    timestamp = Column(DateTime, default=_utcnow)
    regime = Column(String, nullable=False)  # bull_trend / bear_trend / sideways / high_vol
    vix_level = Column(Float, nullable=True)
    vix_percentile = Column(Float, nullable=True)
    breadth_score = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)

    def __repr__(self) -> str:
        return f"<MarketRegime {self.regime} conf={self.confidence}>"


class StrategyConfig(Base):
    __tablename__ = "strategy_configs"

    id = Column(String, primary_key=True, default=_generate_uuid)
    name = Column(String, nullable=False, unique=True)
    strategy_name = Column(String, nullable=False)
    regime = Column(String, nullable=True)
    params_json = Column(JSON, nullable=True)
    toggles_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class Watchlist(Base):
    __tablename__ = "watchlists"

    id = Column(String, primary_key=True, default=_generate_uuid)
    name = Column(String, nullable=False)
    tickers_json = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class TradeJournal(Base):
    __tablename__ = "trade_journal"

    id = Column(String, primary_key=True, default=_generate_uuid)
    execution_id = Column(String, ForeignKey("trade_executions.id"), nullable=True)
    ticker = Column(String, nullable=False)
    direction = Column(String, nullable=True)
    entry_price = Column(Float, nullable=True)
    exit_price = Column(Float, nullable=True)
    pnl_dollars = Column(Float, nullable=True)
    setup_notes = Column(Text, nullable=True)
    review_notes = Column(Text, nullable=True)
    tags_json = Column(JSON, nullable=True, default=list)
    rating = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(String, primary_key=True, default=_generate_uuid)
    key = Column(String, nullable=False, unique=True, index=True)
    value_json = Column(JSON, nullable=True)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

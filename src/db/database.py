"""SQLAlchemy engine and session setup.

Currently configured for SQLite. To switch to PostgreSQL:
  1. Set DATABASE_URL=postgresql://user:pass@host:5432/outlierq in .env
  2. Install psycopg2-binary: pip install psycopg2-binary
  3. Remove the connect_args below (check_same_thread is SQLite-only)
"""

import logging
from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from config.settings import DATABASE_URL

logger = logging.getLogger(__name__)

# SQLite needs check_same_thread=False for multi-threaded access (e.g. APScheduler)
_connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    _connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=_connect_args)
# expire_on_commit=False: pipeline entry points (generate_and_store,
# scan_and_store, full_pipeline) return ORM rows out of a get_session()
# block that commits and closes — with expiry enabled every attribute
# access on those rows raised DetachedInstanceError in the CLI path.
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
Base = declarative_base()


@contextmanager
def get_session() -> Generator[Session, None, None]:
    """Provide a transactional database session via context manager."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def migrate_db() -> None:
    """Add new columns to existing tables if missing (SQLite-friendly migration)."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "signals" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("signals")}
    with engine.connect() as conn:
        if "exploratory" not in cols:
            conn.execute(text("ALTER TABLE signals ADD COLUMN exploratory INTEGER DEFAULT 0 NOT NULL"))
            conn.commit()
            logger.info("Added signals.exploratory column.")
        if "discovery_source" not in cols:
            conn.execute(text("ALTER TABLE signals ADD COLUMN discovery_source VARCHAR"))
            conn.commit()
            logger.info("Added signals.discovery_source column.")
        if "simulation_enhanced" not in cols:
            conn.execute(text("ALTER TABLE signals ADD COLUMN simulation_enhanced INTEGER DEFAULT 0 NOT NULL"))
            conn.commit()
            logger.info("Added signals.simulation_enhanced column.")
        if "entry_price" not in cols:
            conn.execute(text("ALTER TABLE signals ADD COLUMN entry_price FLOAT"))
            conn.commit()
            logger.info("Added signals.entry_price column.")
        if "entry_iv" not in cols:
            conn.execute(text("ALTER TABLE signals ADD COLUMN entry_iv FLOAT"))
            conn.commit()
            logger.info("Added signals.entry_iv column.")
        if "raw_confidence" not in cols:
            conn.execute(text("ALTER TABLE signals ADD COLUMN raw_confidence FLOAT"))
            conn.commit()
            logger.info("Added signals.raw_confidence column.")

    if "arbitrage_opportunities" in insp.get_table_names():
        arb_cols = {c["name"] for c in insp.get_columns("arbitrage_opportunities")}
        with engine.connect() as conn:
            if "estimated_fees" not in arb_cols:
                conn.execute(text("ALTER TABLE arbitrage_opportunities ADD COLUMN estimated_fees FLOAT"))
                conn.commit()
                logger.info("Added arbitrage_opportunities.estimated_fees column.")
            if "profit_after_fees" not in arb_cols:
                conn.execute(text("ALTER TABLE arbitrage_opportunities ADD COLUMN profit_after_fees FLOAT"))
                conn.commit()
                logger.info("Added arbitrage_opportunities.profit_after_fees column.")


def init_db() -> None:
    """Create all tables. Safe to call multiple times — existing tables are skipped."""
    from src.db.tables import Article, Event, Signal, SimulationResult  # noqa: F401
    from src.discovery.discovery_db import DiscoveredTicker  # noqa: F401
    from src.db.trading_tables import (  # noqa: F401
        TradeSignal, TradeExecution, BacktestRun,
        ModelCheckpoint, PortfolioState, MarketRegime,
        StrategyConfig, Watchlist, TradeJournal, UserSettings,
    )
    from src.predictions.prediction_db import PredictionMarket, Prediction, ArbitrageOpportunity  # noqa: F401

    Base.metadata.create_all(bind=engine)
    migrate_db()
    logger.info("Database tables initialized.")

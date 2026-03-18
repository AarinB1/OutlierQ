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
SessionLocal = sessionmaker(bind=engine)
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


def init_db() -> None:
    """Create all tables. Safe to call multiple times — existing tables are skipped."""
    from src.db.tables import Article, Event, Signal, SimulationResult  # noqa: F401
    from src.discovery.discovery_db import DiscoveredTicker  # noqa: F401
    from src.db.trading_tables import (  # noqa: F401
        TradeSignal, TradeExecution, BacktestRun,
        ModelCheckpoint, PortfolioState, MarketRegime,
        StrategyConfig, Watchlist, TradeJournal, UserSettings,
    )

    Base.metadata.create_all(bind=engine)
    migrate_db()
    logger.info("Database tables initialized.")

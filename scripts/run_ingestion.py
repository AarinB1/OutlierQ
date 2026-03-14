#!/usr/bin/env python3
"""CLI entry point to run the OutlierQ ingestion pipeline.

Usage:
    python scripts/run_ingestion.py --once --tickers AAPL,TSLA
    python scripts/run_ingestion.py --verbose
"""

import argparse
import logging
import sys
from pathlib import Path

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.settings import DEFAULT_TICKERS, LOG_FORMAT
from src.db.database import init_db
from src.ingestion.market_fetcher import MarketFetcher
from src.ingestion.news_fetcher import NewsFetcher

logger = logging.getLogger("outlierq")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OutlierQ data ingestion pipeline")
    parser.add_argument(
        "--tickers",
        type=str,
        default=",".join(DEFAULT_TICKERS),
        help="Comma-separated list of tickers (default: AAPL,TSLA,NVDA,MSFT,AMZN)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single ingestion pass and exit (no scheduler)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug-level logging",
    )
    return parser.parse_args()


def run_once(tickers: list[str]) -> None:
    """Fetch news + market data for all tickers once, then exit."""
    news = NewsFetcher()
    market = MarketFetcher()

    # News ingestion
    logger.info("Fetching news for %s", tickers)
    articles = news.fetch_batch(tickers)
    news.store_articles(articles)

    # Market data
    for ticker in tickers:
        try:
            price = market.get_current_price(ticker)
            logger.info("%s current price: $%.2f", ticker, price)
        except Exception:
            logger.exception("Failed to fetch market data for %s", ticker)


def run_scheduled(tickers: list[str]) -> None:
    """Start the APScheduler-based ingestion loop."""
    from src.ingestion.scheduler import IngestionScheduler

    scheduler = IngestionScheduler(tickers=tickers)
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        scheduler.stop()
        logger.info("Scheduler stopped by user.")


def main() -> None:
    args = parse_args()

    level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(format=LOG_FORMAT, level=level)

    tickers = [t.strip().upper() for t in args.tickers.split(",")]
    logger.info("OutlierQ ingestion — tickers: %s", tickers)

    # Ensure tables exist (creates the SQLite .db file if needed)
    init_db()

    if args.once:
        run_once(tickers)
    else:
        run_scheduled(tickers)


if __name__ == "__main__":
    main()

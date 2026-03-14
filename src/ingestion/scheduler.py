"""APScheduler job orchestration for periodic data ingestion.

Runs two jobs during US market hours (9:30 AM – 4:00 PM ET, Mon–Fri):
  - News ingestion every 15 minutes
  - Market data refresh every 5 minutes
"""

import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from config.settings import DEFAULT_TICKERS, LOG_FORMAT
from src.ingestion.market_fetcher import MarketFetcher
from src.ingestion.news_fetcher import NewsFetcher

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class IngestionScheduler:
    """Orchestrates scheduled data ingestion jobs."""

    def __init__(self, tickers: list[str] | None = None) -> None:
        self.tickers = tickers or DEFAULT_TICKERS
        self.scheduler = BlockingScheduler()
        self.news_fetcher = NewsFetcher()
        self.market_fetcher = MarketFetcher()
        self._setup_jobs()

    # ── Job definitions ───────────────────────────────────────────────

    def _setup_jobs(self) -> None:
        # News ingestion — every 15 minutes during market hours (ET)
        self.scheduler.add_job(
            self._run_news_job,
            trigger=CronTrigger(
                day_of_week="mon-fri",
                hour="9-15",
                minute="*/15",
                timezone="US/Eastern",
            ),
            id="news_ingestion",
            name="News Ingestion",
        )
        # Also run at 4:00 PM close
        self.scheduler.add_job(
            self._run_news_job,
            trigger=CronTrigger(
                day_of_week="mon-fri",
                hour="16",
                minute="0",
                timezone="US/Eastern",
            ),
            id="news_ingestion_close",
            name="News Ingestion (Market Close)",
        )

        # Market data — every 5 minutes during market hours
        self.scheduler.add_job(
            self._run_market_job,
            trigger=CronTrigger(
                day_of_week="mon-fri",
                hour="9-15",
                minute="*/5",
                timezone="US/Eastern",
            ),
            id="market_data",
            name="Market Data Refresh",
        )

    # ── Job runners ───────────────────────────────────────────────────

    def _run_news_job(self) -> None:
        logger.info("Running scheduled news ingestion for %s", self.tickers)
        try:
            articles = self.news_fetcher.fetch_batch(self.tickers)
            self.news_fetcher.store_articles(articles)
        except Exception:
            logger.exception("News ingestion job failed")

    def _run_market_job(self) -> None:
        logger.info("Running scheduled market data refresh for %s", self.tickers)
        for ticker in self.tickers:
            try:
                price = self.market_fetcher.get_current_price(ticker)
                logger.info("%s current price: $%.2f", ticker, price)
            except Exception:
                logger.exception("Market data fetch failed for %s", ticker)

    # ── Control ───────────────────────────────────────────────────────

    def start(self) -> None:
        """Start the scheduler. Blocks until stopped."""
        logger.info("Starting ingestion scheduler for tickers: %s", self.tickers)
        self.scheduler.start()

    def stop(self) -> None:
        """Gracefully shut down the scheduler."""
        logger.info("Stopping ingestion scheduler.")
        self.scheduler.shutdown(wait=False)

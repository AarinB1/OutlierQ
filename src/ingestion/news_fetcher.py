"""Finnhub news ingestion with deduplication and retry logic."""

import logging
import time
from datetime import date, datetime, timedelta, timezone

import finnhub
from sqlalchemy.exc import IntegrityError

from config.settings import FINNHUB_API_KEY, LOG_FORMAT
from src.db.database import get_session
from src.db.tables import Article
from src.models.schemas import ArticleCreate

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

MAX_RETRIES = 3
RATE_LIMIT_DELAY = 1.0  # seconds between requests (Finnhub free tier)


class NewsFetcher:
    """Fetches company news from Finnhub and stores articles in the database."""

    def __init__(self, api_key: str | None = None):
        key = api_key or FINNHUB_API_KEY
        if not key:
            raise ValueError(
                "Finnhub API key is required. Set FINNHUB_API_KEY in your .env file."
            )
        self.client = finnhub.Client(api_key=key)

    # ── Core fetch ────────────────────────────────────────────────────

    def fetch_finnhub_news(
        self, ticker: str, from_date: date, to_date: date
    ) -> list[ArticleCreate]:
        """Fetch company news from Finnhub with retry + deduplication by URL."""
        raw_articles = self._call_with_retry(
            lambda: self.client.company_news(
                ticker,
                _from=from_date.isoformat(),
                to=to_date.isoformat(),
            )
        )

        if not raw_articles:
            logger.info("No news returned for %s (%s to %s)", ticker, from_date, to_date)
            return []

        # Deduplicate by URL within this batch
        seen_urls: set[str] = set()
        articles: list[ArticleCreate] = []
        for item in raw_articles:
            url = item.get("url", "")
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)

            articles.append(
                ArticleCreate(
                    ticker=ticker,
                    headline=item.get("headline", ""),
                    summary=item.get("summary"),
                    source=item.get("source", "finnhub"),
                    url=url,
                    published_at=datetime.fromtimestamp(
                        item.get("datetime", 0), tz=timezone.utc
                    ),
                    raw_json=item,
                )
            )

        logger.info("Fetched %d articles for %s", len(articles), ticker)
        return articles

    # ── Batch fetch ───────────────────────────────────────────────────

    def fetch_batch(self, tickers: list[str]) -> list[ArticleCreate]:
        """Fetch news for multiple tickers with rate limiting."""
        today = date.today()
        from_date = today - timedelta(days=7)
        all_articles: list[ArticleCreate] = []

        for ticker in tickers:
            articles = self.fetch_finnhub_news(ticker, from_date, today)
            all_articles.extend(articles)
            time.sleep(RATE_LIMIT_DELAY)

        logger.info("Batch complete: %d total articles for %d tickers",
                     len(all_articles), len(tickers))
        return all_articles

    # ── Store ─────────────────────────────────────────────────────────

    def store_articles(self, articles: list[ArticleCreate]) -> int:
        """Upsert articles into the database, skipping duplicates by URL.

        Returns the number of newly inserted articles.
        """
        inserted = 0
        with get_session() as session:
            for article in articles:
                # Skip if URL already exists
                existing = (
                    session.query(Article).filter(Article.url == article.url).first()
                )
                if existing:
                    continue

                # Savepoint per insert: a full session.rollback() here would
                # also discard every article already flushed in this batch.
                row = Article(**article.model_dump())
                try:
                    with session.begin_nested():
                        session.add(row)
                        session.flush()
                    inserted += 1
                except IntegrityError:
                    logger.debug("Insert skipped for URL: %s", article.url)

        logger.info("Stored %d new articles (skipped %d duplicates)",
                     inserted, len(articles) - inserted)
        return inserted

    # ── Helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _call_with_retry(fn, retries: int = MAX_RETRIES):
        """Call *fn* with exponential backoff on failure."""
        for attempt in range(retries):
            try:
                return fn()
            except Exception as exc:
                if attempt == retries - 1:
                    break
                wait = 2 ** attempt
                logger.warning(
                    "Attempt %d/%d failed: %s — retrying in %ds",
                    attempt + 1, retries, exc, wait,
                )
                time.sleep(wait)
        logger.error("All %d retry attempts exhausted.", retries)
        return []

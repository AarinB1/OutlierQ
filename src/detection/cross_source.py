"""Multi-outlet confirmation for detected events.

Validates that an event is being reported by multiple independent sources,
not just a single outlet. Also extracts common themes across headlines
to help identify the nature of the event.
"""

import logging
from collections import Counter
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT
from src.db.database import get_session
from src.db.tables import Article

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Common English stopwords to exclude from theme extraction
_STOPWORDS = frozenset({
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "must",
    "and", "but", "or", "nor", "not", "so", "yet", "both", "either",
    "to", "of", "in", "for", "on", "at", "by", "with", "from", "up",
    "about", "into", "through", "during", "before", "after", "above",
    "below", "between", "out", "off", "over", "under", "again",
    "this", "that", "these", "those", "it", "its", "he", "she", "they",
    "we", "you", "i", "me", "him", "her", "us", "them", "my", "your",
    "his", "our", "their", "what", "which", "who", "whom", "how",
    "when", "where", "why", "all", "each", "every", "any", "few",
    "more", "most", "other", "some", "such", "no", "only", "own",
    "same", "than", "too", "very", "just", "also", "now", "new",
    "says", "said", "as", "if", "then", "here", "there", "while",
    "s", "t", "re", "ve", "ll", "d", "m",
})


class CrossSourceValidator:
    """Confirms events by cross-referencing multiple news sources."""

    def __init__(
        self,
        min_sources: int = 2,
        time_window_hours: int = 6,
    ) -> None:
        self.min_sources = min_sources
        self.time_window_hours = time_window_hours

    def get_recent_articles(
        self, ticker: str, hours: int | None = None, session: Session | None = None
    ) -> list:
        """Query articles from the last N hours for this ticker."""
        window = hours if hours is not None else self.time_window_hours
        cutoff = datetime.now(timezone.utc) - timedelta(hours=window)

        def _query(s: Session) -> list:
            return (
                s.query(Article)
                .filter(
                    Article.ticker == ticker,
                    Article.ingested_at >= cutoff,
                )
                .all()
            )

        if session is not None:
            return _query(session)
        with get_session() as s:
            return _query(s)

    def count_sources(self, articles: list) -> dict:
        """Count distinct sources from a list of articles.

        Source names are normalized (lowercase, stripped) before counting.
        """
        source_set: set[str] = set()
        for article in articles:
            normalized = article.source.strip().lower()
            source_set.add(normalized)

        return {
            "distinct_sources": len(source_set),
            "sources": sorted(source_set),
            "article_count": len(articles),
        }

    def extract_common_themes(self, articles: list) -> list[str]:
        """Extract top 10 words appearing across multiple article headlines.

        Filters out common stopwords and short tokens.
        """
        word_counts: Counter[str] = Counter()

        for article in articles:
            # Split headline into words, normalize
            words = set()
            for word in article.headline.split():
                cleaned = word.strip(".,!?;:\"'()[]{}—–-").lower()
                if len(cleaned) > 2 and cleaned not in _STOPWORDS:
                    words.add(cleaned)
            word_counts.update(words)

        # Return words appearing in 2+ headlines (or 3+ if enough articles)
        min_appearances = 3 if len(articles) >= 5 else 2
        themes = [
            word for word, count in word_counts.most_common(10)
            if count >= min_appearances
        ]

        return themes

    def validate(
        self, ticker: str, articles: list | None = None, session: Session | None = None
    ) -> dict | None:
        """Run cross-source validation for a ticker.

        Returns result dict if validation passes (enough distinct sources),
        else None.
        """
        if articles is None:
            articles = self.get_recent_articles(ticker, session=session)

        if not articles:
            logger.info("%s: no recent articles to validate", ticker)
            return None

        source_info = self.count_sources(articles)
        themes = self.extract_common_themes(articles)
        passes = source_info["distinct_sources"] >= self.min_sources

        logger.info(
            "%s cross-source: %d sources %s, themes=%s, passes=%s",
            ticker, source_info["distinct_sources"], source_info["sources"],
            themes, passes,
        )

        if passes:
            return {
                "ticker": ticker,
                "distinct_sources": source_info["distinct_sources"],
                "sources": source_info["sources"],
                "common_themes": themes,
                "article_count": source_info["article_count"],
                "passes": True,
            }
        return None

"""Sentiment magnitude scoring using VADER.

Analyzes article headlines for extreme sentiment language. VADER returns
a compound score from -1.0 (most negative) to +1.0 (most positive).
Articles with |compound| >= 0.6 are classified as "extreme sentiment".
A ticker passes the sentiment filter when at least half its articles
contain extreme language.
"""

import logging

from sqlalchemy.orm import Session
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from config.settings import LOG_FORMAT
from src.db.database import get_session
from src.db.tables import Article

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class SentimentFilter:
    """Scores and filters articles by sentiment magnitude."""

    def __init__(
        self,
        extreme_threshold: float = 0.6,
        extreme_ratio_threshold: float = 0.5,
    ) -> None:
        self.extreme_threshold = extreme_threshold
        self.extreme_ratio_threshold = extreme_ratio_threshold
        self._analyzer = SentimentIntensityAnalyzer()

    def score_headline(self, headline: str) -> dict:
        """Score a single headline with VADER.

        Returns dict with compound, pos, neg, neu scores and is_extreme flag.
        """
        scores = self._analyzer.polarity_scores(headline)
        return {
            "compound": scores["compound"],
            "pos": scores["pos"],
            "neg": scores["neg"],
            "neu": scores["neu"],
            "is_extreme": abs(scores["compound"]) >= self.extreme_threshold,
        }

    def score_batch(self, articles: list) -> dict:
        """Score a batch of article records for a single ticker.

        Accepts Article ORM objects or any object with .headline and .ticker attrs.
        Returns aggregate sentiment stats and whether the ticker passes the filter.
        """
        if not articles:
            return {
                "ticker": "",
                "mean_sentiment": 0.0,
                "max_magnitude": 0.0,
                "extreme_ratio": 0.0,
                "direction": "neutral",
                "passes_filter": False,
            }

        ticker = articles[0].ticker
        scores: list[dict] = []

        for article in articles:
            result = self.score_headline(article.headline)
            result["article_id"] = article.id
            scores.append(result)

        compounds = [s["compound"] for s in scores]
        mean_sentiment = sum(compounds) / len(compounds)
        max_magnitude = max(abs(c) for c in compounds)
        extreme_count = sum(1 for s in scores if s["is_extreme"])
        extreme_ratio = extreme_count / len(scores)

        # Determine direction
        if mean_sentiment < -0.2:
            direction = "bearish"
        elif mean_sentiment > 0.2:
            direction = "bullish"
        else:
            direction = "neutral"

        passes = extreme_ratio >= self.extreme_ratio_threshold

        logger.info(
            "%s sentiment: %d articles, mean=%.3f, max_mag=%.3f, "
            "extreme_ratio=%.2f (%d/%d), direction=%s, passes=%s",
            ticker, len(articles), mean_sentiment, max_magnitude,
            extreme_ratio, extreme_count, len(articles), direction, passes,
        )

        return {
            "ticker": ticker,
            "mean_sentiment": mean_sentiment,
            "max_magnitude": max_magnitude,
            "extreme_ratio": extreme_ratio,
            "direction": direction,
            "passes_filter": passes,
            "scores": scores,
        }

    def update_article_scores(
        self, articles: list, session: Session | None = None
    ) -> None:
        """Write sentiment_score and sentiment_magnitude back to the articles table."""
        def _update(s: Session) -> None:
            for article in articles:
                result = self.score_headline(article.headline)
                article.sentiment_score = result["compound"]
                article.sentiment_magnitude = abs(result["compound"])
                s.add(article)
            logger.info("Updated sentiment scores for %d articles", len(articles))

        if session is not None:
            _update(session)
        else:
            with get_session() as s:
                _update(s)

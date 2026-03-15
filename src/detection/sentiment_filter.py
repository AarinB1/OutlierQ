"""Sentiment magnitude scoring using FinBERT (with VADER fallback)."""

import logging
import time

from sqlalchemy.orm import Session

from config.settings import FINBERT_BATCH_SIZE, FINBERT_DEVICE, LOG_FORMAT
from src.db.database import get_session
from src.db.tables import Article
from src.detection.finbert_analyzer import FinBERTAnalyzer

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class SentimentFilter:
    """Scores and filters articles by sentiment magnitude."""

    def __init__(
        self,
        extreme_threshold: float = 0.6,
        extreme_ratio_threshold: float = 0.5,
        batch_size: int = FINBERT_BATCH_SIZE,
    ) -> None:
        self.extreme_threshold = extreme_threshold
        self.extreme_ratio_threshold = extreme_ratio_threshold
        self.batch_size = max(1, batch_size)
        self.finbert = FinBERTAnalyzer(
            device=FINBERT_DEVICE,
            extreme_threshold=extreme_threshold,
        )
        logger.info(
            "SentimentFilter initialized with FinBERT (extreme_threshold=%.2f, extreme_ratio=%.2f)",
            extreme_threshold,
            extreme_ratio_threshold,
        )

    def score_headline(self, headline: str) -> dict:
        """Score a single headline with FinBERT.

        Returns dict with compound, pos, neg, neu scores and is_extreme flag.
        """
        finbert_scores = self.finbert.analyze(headline)
        return {
            "compound": float(finbert_scores["compound"]),
            "pos": float(finbert_scores["positive"]),
            "neg": float(finbert_scores["negative"]),
            "neu": float(finbert_scores["neutral"]),
            "is_extreme": bool(finbert_scores["is_extreme"]),
            "confidence": float(finbert_scores["confidence"]),
            "label": str(finbert_scores["label"]),
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
        headlines = [article.headline for article in articles]
        start = time.perf_counter()
        finbert_results = self.finbert.analyze_batch(
            headlines,
            batch_size=self.batch_size,
        )
        elapsed = time.perf_counter() - start
        per_headline_ms = (elapsed / len(headlines) * 1000.0) if headlines else 0.0
        logger.info(
            "Batch sentiment analysis: %d headlines in %.2fs (%.0fms/headline)",
            len(headlines),
            elapsed,
            per_headline_ms,
        )

        scores: list[dict] = []
        for article, result in zip(articles, finbert_results, strict=False):
            scores.append(
                {
                    "article_id": article.id,
                    "compound": float(result["compound"]),
                    "pos": float(result["positive"]),
                    "neg": float(result["negative"]),
                    "neu": float(result["neutral"]),
                    "is_extreme": bool(result["is_extreme"]),
                    "confidence": float(result["confidence"]),
                    "label": str(result["label"]),
                }
            )

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
            headlines = [article.headline for article in articles]
            scores = self.finbert.analyze_batch(headlines, batch_size=self.batch_size)
            for article, result in zip(articles, scores, strict=False):
                compound = float(result["compound"])
                article.sentiment_score = compound
                article.sentiment_magnitude = abs(compound)
                s.add(article)
            logger.info("Updated sentiment scores for %d articles", len(articles))

        if session is not None:
            _update(session)
        else:
            with get_session() as s:
                _update(s)

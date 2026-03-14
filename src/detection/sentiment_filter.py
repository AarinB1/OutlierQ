"""Sentiment magnitude scoring — stub for Phase 2.

This module will use VADER (and optionally a transformer model) to score
article headlines and summaries, filtering for extreme sentiment that
correlates with significant price moves.

Planned features:
  - VADER compound score for each article headline + summary
  - Magnitude classification: neutral / moderate / extreme
  - Extreme sentiment threshold (|compound| > 0.7)
  - Batch scoring for newly ingested articles
"""


class SentimentFilter:
    """Scores and filters articles by sentiment magnitude."""

    def score_article(self, headline: str, summary: str | None = None) -> dict:
        """Return sentiment scores for a single article."""
        raise NotImplementedError("Sentiment scoring is planned for Phase 2.")

    def filter_extreme(self, ticker: str, threshold: float = 0.7) -> list[dict]:
        """Return articles with extreme sentiment (|compound| > threshold)."""
        raise NotImplementedError("Extreme sentiment filtering is planned for Phase 2.")

"""Event type classification — stub for Phase 3.

This module will classify detected outlier events into categories
(scandal, legal, FDA approval, etc.) and assign a directional bias
(bullish / bearish) with a confidence score.

Planned features:
  - Keyword-based classification as a fast first pass
  - Optional LLM-based classification for ambiguous events
  - Event types: scandal, legal, earnings_miss, recall, fda_approval,
    breakthrough, major_contract, earnings_beat, other
  - Direction inference: map event types to bullish/bearish
  - Confidence scoring based on source count + sentiment magnitude
"""


class EventClassifier:
    """Classifies detected events by type and direction."""

    def classify(self, ticker: str, article_ids: list[str]) -> dict:
        """Classify a cluster of articles into an event type and direction."""
        raise NotImplementedError("Event classification is planned for Phase 3.")

    def infer_direction(self, event_type: str) -> str:
        """Return 'bullish' or 'bearish' for a given event type."""
        raise NotImplementedError("Direction inference is planned for Phase 3.")

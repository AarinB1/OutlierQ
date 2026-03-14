"""Call/put signal generation — stub for Phase 4.

This module will take classified events and generate actionable
options trading signals (call or put recommendations) with
suggested strike prices and expiration dates.

Planned features:
  - Map bullish events → call signals, bearish → put signals
  - Strike price suggestion based on current price + expected move
  - Expiry selection based on event type (short-term for earnings, longer for legal)
  - Confidence scoring combining event confidence + sentiment + volume
  - Signal deduplication (don't re-signal the same event)
  - Outcome tracking: record profit/loss after expiry
"""


class SignalEngine:
    """Generates options trading signals from classified events."""

    def generate_signal(self, event_id: str) -> dict:
        """Generate a call/put signal for a classified event."""
        raise NotImplementedError("Signal generation is planned for Phase 4.")

    def suggest_strike(self, ticker: str, direction: str) -> float:
        """Suggest a strike price based on current price and expected move."""
        raise NotImplementedError("Strike suggestion is planned for Phase 4.")

    def suggest_expiry(self, event_type: str) -> str:
        """Suggest an expiration date based on event type."""
        raise NotImplementedError("Expiry suggestion is planned for Phase 4.")

"""Z-score spike detection — stub for Phase 2.

This module will detect abnormal spikes in news volume and trading volume
using rolling Z-scores. A Z-score > 3.0 on article count or trading volume
for a given ticker triggers an outlier alert.

Planned features:
  - Rolling 30-day baseline for article frequency per ticker
  - Z-score computation on article count per time window
  - Trading volume Z-score using yfinance historical data
  - Configurable threshold (default Z > 3.0)
"""


class VolumeDetector:
    """Detects abnormal volume spikes via Z-score analysis."""

    def detect_news_spike(self, ticker: str) -> dict | None:
        """Check if recent news volume for *ticker* is a statistical outlier."""
        raise NotImplementedError("News volume spike detection is planned for Phase 2.")

    def detect_trade_volume_spike(self, ticker: str) -> dict | None:
        """Check if recent trading volume for *ticker* is a statistical outlier."""
        raise NotImplementedError("Trade volume spike detection is planned for Phase 2.")

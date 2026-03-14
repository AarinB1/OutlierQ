"""Reddit / social media ingestion — stub for Phase 3.

This module will use PRAW (Python Reddit API Wrapper) to monitor
subreddits like r/wallstreetbets, r/stocks, and r/options for
unusual mention spikes that correlate with extreme news events.

Planned features:
  - Monitor configurable subreddits for ticker mentions
  - Track mention velocity (mentions per hour vs. baseline)
  - Extract sentiment from post titles and top comments
  - Feed results into the cross-source confirmation engine
"""

import logging

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)


class SocialFetcher:
    """Fetches social media signals from Reddit via PRAW."""

    def __init__(self) -> None:
        raise NotImplementedError(
            "SocialFetcher is not yet implemented. "
            "Reddit/PRAW integration is planned for Phase 3."
        )

    def fetch_subreddit_mentions(self, ticker: str, subreddit: str = "wallstreetbets") -> list[dict]:
        """Fetch recent posts mentioning *ticker* from a subreddit."""
        raise NotImplementedError("Subreddit mention fetching is planned for Phase 3.")

    def get_mention_velocity(self, ticker: str) -> float:
        """Return the current mention rate vs. the 7-day baseline."""
        raise NotImplementedError("Mention velocity tracking is planned for Phase 3.")

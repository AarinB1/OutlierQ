"""Centralized configuration loading from environment variables."""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


def _require_env(key: str) -> str:
    """Return the value of an environment variable or exit with a clear error."""
    value = os.getenv(key)
    if not value:
        print(f"ERROR: Required environment variable '{key}' is not set.")
        print(f"Copy .env.example to .env and fill in your keys.")
        sys.exit(1)
    return value


# API keys — required for production, but we allow missing keys so tests
# and local exploration can import settings without a full .env file.
FINNHUB_API_KEY: str = os.getenv("FINNHUB_API_KEY", "")
NEWS_API_KEY: str = os.getenv("NEWS_API_KEY", "")
REDDIT_CLIENT_ID: str = os.getenv("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET: str = os.getenv("REDDIT_CLIENT_SECRET", "")

# Database — defaults to a local SQLite file in the project root.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_DB_PATH = _PROJECT_ROOT / "outlierq.db"
DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{_DEFAULT_DB_PATH}")

# Default tickers to track
DEFAULT_TICKERS: list[str] = ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN"]

# Logging format
LOG_FORMAT: str = "[%(asctime)s] %(name)s %(levelname)s: %(message)s"

# MiroFish simulation settings
MIROFISH_BASE_URL: str = os.getenv("MIROFISH_BASE_URL", "http://localhost:5001")
MIROFISH_ENABLED: bool = os.getenv("MIROFISH_ENABLED", "false").lower() in ("true", "1", "yes")
MIROFISH_MAX_ROUNDS: int = int(os.getenv("MIROFISH_MAX_ROUNDS", "20"))
MIROFISH_MIN_CONFIDENCE: float = float(os.getenv("MIROFISH_MIN_CONFIDENCE", "0.7"))
MIROFISH_TIMEOUT: int = int(os.getenv("MIROFISH_TIMEOUT", "30"))
MIROFISH_WAIT_TIMEOUT: int = int(os.getenv("MIROFISH_WAIT_TIMEOUT", "600"))

# FinBERT settings
FINBERT_MODEL: str = os.getenv("FINBERT_MODEL", "ProsusAI/finbert")
FINBERT_DEVICE: str | None = os.getenv("FINBERT_DEVICE", None)
FINBERT_BATCH_SIZE: int = int(os.getenv("FINBERT_BATCH_SIZE", "16"))

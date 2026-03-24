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

# ── Prediction Markets ──────────────────────────────────────────────────
POLYMARKET_ENABLED = os.getenv("POLYMARKET_ENABLED", "true").lower() == "true"
KALSHI_ENABLED = os.getenv("KALSHI_ENABLED", "true").lower() == "true"
KALSHI_DEMO = os.getenv("KALSHI_DEMO", "true").lower() == "true"
KALSHI_API_KEY = os.getenv("KALSHI_API_KEY", "")
KALSHI_PRIVATE_KEY_PATH = os.getenv("KALSHI_PRIVATE_KEY_PATH", "")
PREDICTION_MIN_EDGE = float(os.getenv("PREDICTION_MIN_EDGE", "0.05"))
PREDICTION_MIN_CONFIDENCE = float(os.getenv("PREDICTION_MIN_CONFIDENCE", "0.4"))
PREDICTION_MARKET_MIN_VOLUME = float(os.getenv("PREDICTION_MARKET_MIN_VOLUME", "10000"))

# ── Prediction Execution ────────────────────────────────────────────
PREDICTION_EXECUTION_MODE = os.getenv("PREDICTION_EXECUTION_MODE", "paper")
PREDICTION_BANKROLL = float(os.getenv("PREDICTION_BANKROLL", "1000.0"))
PREDICTION_MAX_BET_PCT = float(os.getenv("PREDICTION_MAX_BET_PCT", "0.05"))
PREDICTION_KELLY_FRACTION = float(os.getenv("PREDICTION_KELLY_FRACTION", "0.25"))
PREDICTION_MAX_POSITIONS = int(os.getenv("PREDICTION_MAX_POSITIONS", "20"))
PREDICTION_EXECUTION_MIN_EDGE = float(os.getenv("PREDICTION_EXECUTION_MIN_EDGE", "0.05"))

# Kalshi credentials (for kalshi_demo / kalshi_live modes)
KALSHI_API_KEY_ID = os.getenv("KALSHI_API_KEY_ID", "")
KALSHI_PRIVATE_KEY_PATH_EXEC = os.getenv("KALSHI_PRIVATE_KEY_PATH", "")

# Polymarket credentials (for polymarket mode)
POLYMARKET_PRIVATE_KEY = os.getenv("POLYMARKET_PRIVATE_KEY", "")
POLYMARKET_FUNDER_ADDRESS = os.getenv("POLYMARKET_FUNDER_ADDRESS", "")
POLYMARKET_SIGNATURE_TYPE = int(os.getenv("POLYMARKET_SIGNATURE_TYPE", "0"))

# FinBERT settings
FINBERT_MODEL: str = os.getenv("FINBERT_MODEL", "ProsusAI/finbert")
FINBERT_DEVICE: str | None = os.getenv("FINBERT_DEVICE", None)
FINBERT_BATCH_SIZE: int = int(os.getenv("FINBERT_BATCH_SIZE", "16"))

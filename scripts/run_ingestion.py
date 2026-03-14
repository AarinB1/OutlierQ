#!/usr/bin/env python3
"""CLI entry point to run the OutlierQ ingestion, detection, and classification pipeline.

Usage:
    python scripts/run_ingestion.py --once --tickers AAPL,TSLA
    python scripts/run_ingestion.py --once --detect --tickers AAPL,TSLA
    python scripts/run_ingestion.py --detect --verbose
    python scripts/run_ingestion.py --reclassify --verbose
"""

import argparse
import logging
import sys
from collections import Counter
from pathlib import Path

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.settings import DEFAULT_TICKERS, LOG_FORMAT
from src.db.database import init_db
from src.ingestion.market_fetcher import MarketFetcher
from src.ingestion.news_fetcher import NewsFetcher

logger = logging.getLogger("outlierq")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OutlierQ data ingestion pipeline")
    parser.add_argument(
        "--tickers",
        type=str,
        default=",".join(DEFAULT_TICKERS),
        help="Comma-separated list of tickers (default: AAPL,TSLA,NVDA,MSFT,AMZN)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single ingestion pass and exit (no scheduler)",
    )
    parser.add_argument(
        "--detect",
        action="store_true",
        help="Run anomaly detection after ingestion",
    )
    parser.add_argument(
        "--reclassify",
        action="store_true",
        help="Re-classify all existing events in the database and exit",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug-level logging",
    )
    return parser.parse_args()


def run_detection(tickers: list[str]) -> None:
    """Run the anomaly detection pipeline and print results."""
    from src.detection import AnomalyPipeline

    pipeline = AnomalyPipeline()
    events = pipeline.scan_and_store(tickers)

    if not events:
        logger.info("No outlier events detected.")
        print("\nNo outlier events detected.")
        return

    print(f"\n{'='*60}")
    print(f"  OUTLIER EVENTS DETECTED: {len(events)}")
    print(f"{'='*60}")

    for event in events:
        meta = event.metadata_json or {}
        print(f"\n  Ticker:     {event.ticker}")
        print(f"  Event Type: {event.event_type}")
        print(f"  Direction:  {event.direction}")
        print(f"  Confidence: {event.confidence:.3f}")
        print(f"  Z-Score:    {meta.get('z_score', 'N/A')}")
        print(f"  Sentiment:  {meta.get('mean_sentiment', 'N/A')}")
        print(f"  Sources:    {', '.join(meta.get('sources', []))}")
        print(f"  Themes:     {', '.join(meta.get('common_themes', []))}")
        print(f"  Keywords:   {', '.join(meta.get('top_keywords', []))}")
        print(f"  {'─'*56}")

    print()


def run_reclassify() -> None:
    """Re-classify all existing events and print a summary."""
    from src.classification.event_classifier import EventClassifier

    classifier = EventClassifier()
    results = classifier.reclassify_events()

    if not results:
        print("\nNo events to reclassify.")
        return

    # Build summary
    type_counter: Counter[str] = Counter()
    for r in results:
        type_counter[r["new_type"]] += 1

    breakdown = ", ".join(f"{t}: {c}" for t, c in type_counter.most_common())

    print(f"\n{len(results)} events reclassified: {breakdown}")

    for r in results:
        changed = r["old_type"] != r["new_type"]
        marker = " *CHANGED*" if changed else ""
        print(
            f"  {r['ticker']}: {r['old_type']} -> {r['new_type']} "
            f"({r['new_direction']}, conf={r['confidence']:.3f}){marker}"
        )

    print()


def run_once(tickers: list[str], detect: bool = False) -> None:
    """Fetch news + market data for all tickers once, then exit."""
    news = NewsFetcher()
    market = MarketFetcher()

    # News ingestion
    logger.info("Fetching news for %s", tickers)
    articles = news.fetch_batch(tickers)
    news.store_articles(articles)

    # Market data
    for ticker in tickers:
        try:
            price = market.get_current_price(ticker)
            logger.info("%s current price: $%.2f", ticker, price)
        except Exception:
            logger.exception("Failed to fetch market data for %s", ticker)

    # Detection
    if detect:
        run_detection(tickers)


def run_scheduled(tickers: list[str], detect: bool = False) -> None:
    """Start the APScheduler-based ingestion loop."""
    from src.ingestion.scheduler import IngestionScheduler

    scheduler = IngestionScheduler(tickers=tickers)

    if detect:
        from apscheduler.triggers.cron import CronTrigger

        def _detection_job() -> None:
            logger.info("Running scheduled anomaly detection for %s", tickers)
            try:
                run_detection(tickers)
            except Exception:
                logger.exception("Detection job failed")

        scheduler.scheduler.add_job(
            _detection_job,
            trigger=CronTrigger(
                day_of_week="mon-fri",
                hour="9-15",
                minute="*/15",
                timezone="US/Eastern",
            ),
            id="anomaly_detection",
            name="Anomaly Detection",
        )
        logger.info("Anomaly detection job added (every 15 min during market hours)")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        scheduler.stop()
        logger.info("Scheduler stopped by user.")


def main() -> None:
    args = parse_args()

    level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(format=LOG_FORMAT, level=level)

    tickers = [t.strip().upper() for t in args.tickers.split(",")]
    logger.info("OutlierQ ingestion — tickers: %s", tickers)

    # Ensure tables exist (creates the SQLite .db file if needed)
    init_db()

    # Reclassify mode — standalone operation
    if args.reclassify:
        run_reclassify()
        return

    if args.once:
        run_once(tickers, detect=args.detect)
    else:
        run_scheduled(tickers, detect=args.detect)


if __name__ == "__main__":
    main()

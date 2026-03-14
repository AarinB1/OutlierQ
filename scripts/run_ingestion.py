#!/usr/bin/env python3
"""CLI entry point for OutlierQ — ingestion, detection, classification, signals, and API.

Usage:
    python scripts/run_ingestion.py --once --tickers AAPL,TSLA
    python scripts/run_ingestion.py --once --signals --tickers AAPL,TSLA
    python scripts/run_ingestion.py --signals --verbose
    python scripts/run_ingestion.py --evaluate
    python scripts/run_ingestion.py --reclassify --verbose
    python scripts/run_ingestion.py --api
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
        "--signals",
        action="store_true",
        help="Run full pipeline including signal generation (implies --detect)",
    )
    parser.add_argument(
        "--evaluate",
        action="store_true",
        help="Evaluate pending signals and print accuracy stats, then exit",
    )
    parser.add_argument(
        "--reclassify",
        action="store_true",
        help="Re-classify all existing events in the database and exit",
    )
    parser.add_argument(
        "--api",
        action="store_true",
        help="Start the FastAPI server on port 8000",
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


def run_full_pipeline(tickers: list[str]) -> None:
    """Run the full pipeline: detection + classification + signal generation."""
    from src.detection import AnomalyPipeline

    pipeline = AnomalyPipeline()
    signals = pipeline.full_pipeline(tickers)

    if not signals:
        print("\nNo signals generated.")
        return

    print(f"\n{'='*60}")
    print(f"  TRADE SIGNALS GENERATED: {len(signals)}")
    print(f"{'='*60}")

    for sig in signals:
        direction_symbol = "CALL" if sig.direction == "call" else "PUT"
        print(f"\n  {direction_symbol} {sig.ticker}")
        print(f"  Strike:     ${sig.suggested_strike:.0f}")
        print(f"  Expiry:     {sig.suggested_expiry}")
        print(f"  Confidence: {sig.confidence:.3f}")
        print(f"  {'─'*56}")

    print()


def run_evaluate() -> None:
    """Evaluate pending signals and print accuracy stats."""
    from src.signals.feedback_tracker import FeedbackTracker

    tracker = FeedbackTracker()
    results = tracker.evaluate_all_pending()

    if results:
        print(f"\nEvaluated {len(results)} signals:")
        for r in results:
            print(f"  {r['ticker']} {r['direction']}: {r['outcome']} (P&L: {r['estimated_pnl']:+.1f}%)")

    stats = tracker.get_accuracy_stats()
    print(f"\n{'='*60}")
    print(f"  ACCURACY REPORT")
    print(f"{'='*60}")
    print(f"  Total evaluated: {stats['total_evaluated']}")
    print(f"  Pending:         {stats['total_pending']}")
    print(f"  Wins:            {stats['wins']}")
    print(f"  Losses:          {stats['losses']}")
    print(f"  Expired flat:    {stats['expired_flat']}")
    print(f"  Win rate:        {stats['win_rate']:.1%}")
    print(f"  Avg P&L:         {stats['avg_pnl']:+.1f}%")

    if stats["by_event_type"]:
        print(f"\n  By Event Type:")
        for et, data in stats["by_event_type"].items():
            print(f"    {et}: {data['wins']}/{data['count']} wins ({data['win_rate']:.0%})")

    print()


def run_reclassify() -> None:
    """Re-classify all existing events and print a summary."""
    from src.classification.event_classifier import EventClassifier

    classifier = EventClassifier()
    results = classifier.reclassify_events()

    if not results:
        print("\nNo events to reclassify.")
        return

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


def run_api() -> None:
    """Start the FastAPI server."""
    import uvicorn
    print("OutlierQ API running at http://localhost:8000 — docs at http://localhost:8000/docs")
    uvicorn.run("src.api.app:app", host="0.0.0.0", port=8000, reload=True)


def run_once(tickers: list[str], detect: bool = False, signals: bool = False) -> None:
    """Fetch news + market data for all tickers once, then exit."""
    news = NewsFetcher()
    market = MarketFetcher()

    logger.info("Fetching news for %s", tickers)
    articles = news.fetch_batch(tickers)
    news.store_articles(articles)

    for ticker in tickers:
        try:
            price = market.get_current_price(ticker)
            logger.info("%s current price: $%.2f", ticker, price)
        except Exception:
            logger.exception("Failed to fetch market data for %s", ticker)

    if signals:
        run_full_pipeline(tickers)
    elif detect:
        run_detection(tickers)


def run_scheduled(tickers: list[str], detect: bool = False, signals: bool = False) -> None:
    """Start the APScheduler-based ingestion loop."""
    from apscheduler.triggers.cron import CronTrigger

    from src.ingestion.scheduler import IngestionScheduler

    scheduler = IngestionScheduler(tickers=tickers)

    if signals or detect:
        job_fn = (lambda: run_full_pipeline(tickers)) if signals else (lambda: run_detection(tickers))
        job_name = "Full Pipeline" if signals else "Anomaly Detection"

        def _job() -> None:
            logger.info("Running scheduled %s for %s", job_name.lower(), tickers)
            try:
                job_fn()
            except Exception:
                logger.exception("%s job failed", job_name)

        scheduler.scheduler.add_job(
            _job,
            trigger=CronTrigger(
                day_of_week="mon-fri",
                hour="9-15",
                minute="*/15",
                timezone="US/Eastern",
            ),
            id="pipeline_job",
            name=job_name,
        )
        logger.info("%s job added (every 15 min during market hours)", job_name)

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        scheduler.stop()
        logger.info("Scheduler stopped by user.")


def main() -> None:
    args = parse_args()

    level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(format=LOG_FORMAT, level=level)

    # Standalone modes
    init_db()

    if args.api:
        run_api()
        return

    if args.evaluate:
        run_evaluate()
        return

    if args.reclassify:
        run_reclassify()
        return

    tickers = [t.strip().upper() for t in args.tickers.split(",")]
    logger.info("OutlierQ ingestion — tickers: %s", tickers)

    detect = args.detect or args.signals

    if args.once:
        run_once(tickers, detect=detect, signals=args.signals)
    else:
        run_scheduled(tickers, detect=detect, signals=args.signals)


if __name__ == "__main__":
    main()

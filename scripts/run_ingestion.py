#!/usr/bin/env python3
"""CLI entry point for OutlierQ — ingestion, detection, classification, signals, and API.

Usage:
    python scripts/run_ingestion.py --once --tickers AAPL,TSLA
    python scripts/run_ingestion.py --once --signals --tickers AAPL,TSLA
    python scripts/run_ingestion.py --once --signals --demo --tickers AAPL,TSLA
    python scripts/run_ingestion.py --signals --demo --anytime --tickers AAPL,TSLA
    python scripts/run_ingestion.py --evaluate
    python scripts/run_ingestion.py --reclassify --verbose
    python scripts/run_ingestion.py --api
    python scripts/run_ingestion.py --once --discover
    python scripts/run_ingestion.py --discover-only
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
        "--demo",
        action="store_true",
        help="Lower detection thresholds so signals generate on normal market days",
    )
    parser.add_argument(
        "--anytime",
        action="store_true",
        help="Run the scheduler regardless of market hours (for testing evenings/weekends)",
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
    parser.add_argument(
        "--discover",
        action="store_true",
        help="Run discovery system once and feed results into pipeline (implies --signals and --detect)",
    )
    parser.add_argument(
        "--discover-only",
        action="store_true",
        help="Run discovery and print discovered tickers only (no pipeline scan)",
    )
    return parser.parse_args()


def run_detection(tickers: list[str], demo: bool = False) -> None:
    """Run the anomaly detection pipeline and print results."""
    from src.detection import AnomalyPipeline

    pipeline = AnomalyPipeline(demo=demo)
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


def run_full_pipeline(tickers: list[str], demo: bool = False) -> None:
    """Run the full pipeline: detection + classification + signal generation."""
    from src.detection import AnomalyPipeline

    pipeline = AnomalyPipeline(demo=demo)
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


def _discovery_orchestrator(demo: bool = False):
    """Build DiscoveryOrchestrator with real dependencies."""
    import finnhub
    from config.settings import FINNHUB_API_KEY
    from src.detection import AnomalyPipeline
    from src.discovery.orchestrator import DiscoveryOrchestrator
    from src.ingestion.market_fetcher import MarketFetcher
    from src.signals.signal_engine import SignalEngine

    client = finnhub.Client(api_key=FINNHUB_API_KEY) if FINNHUB_API_KEY else None
    if not client:
        raise ValueError("FINNHUB_API_KEY required for discovery. Set it in .env")
    market = MarketFetcher()
    pipeline = AnomalyPipeline(demo=demo)
    engine = SignalEngine(market_fetcher=market)
    return DiscoveryOrchestrator(
        db_session=None,
        finnhub_client=client,
        market_fetcher=market,
        pipeline=pipeline,
        signal_engine=engine,
    )


def _print_discoveries(discoveries: list[dict]) -> None:
    """Print discovered tickers in the requested format."""
    print("\n" + "=" * 40)
    print("DISCOVERED TICKERS")
    print("=" * 40)
    if not discoveries:
        print("No tickers discovered.")
        return
    for d in discoveries:
        methods = d.get("discovery_methods") or []
        if len(methods) >= 2:
            badge = "news + volume"
        elif methods == ["news_scanner"]:
            badge = "news only"
        else:
            badge = "volume only"
        print(f"\n\u26a1 {d['ticker']} ({badge})")
        if d.get("mention_count") is not None:
            print(f"   Mentions: {d['mention_count']} | ", end="")
        if d.get("volume_ratio") is not None:
            print(f"Volume: {d['volume_ratio']}x avg | ", end="")
        print(f"Confidence: {d.get('discovery_confidence', 0):.2f}")
        headlines = d.get("sample_headlines") or []
        if headlines:
            print("   Headlines:")
            for h in headlines[:3]:
                print(f"   - \"{h[:80]}{'...' if len(h) > 80 else ''}\"")
        if d.get("price_change_pct") is not None and not headlines:
            print(f"   Price: {d['price_change_pct']:+.1f}%")
    print("\n" + "=" * 40)


def run_discover_only() -> None:
    """Run discovery and print results; do not run pipeline."""
    orch = _discovery_orchestrator()
    discoveries = orch.discover()
    _print_discoveries(discoveries)
    print("Exiting (--discover-only). Use --discover to also run the pipeline.\n")


def run_discover_and_scan(demo: bool = False) -> None:
    """Run discovery, print discovered tickers, then feed into pipeline."""
    orch = _discovery_orchestrator(demo=demo)
    discoveries = orch.discover()
    _print_discoveries(discoveries)
    if not discoveries:
        print("No tickers to scan.\n")
        return
    print(f"Feeding {len(discoveries)} discovered tickers into pipeline...")
    signals = orch.feed_discoveries(discoveries)
    if signals:
        print(f"\nGenerated {len(signals)} signal(s).")
    print()


def run_once(
    tickers: list[str],
    detect: bool = False,
    signals: bool = False,
    demo: bool = False,
) -> None:
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
        run_full_pipeline(tickers, demo=demo)
    elif detect:
        run_detection(tickers, demo=demo)


def run_scheduled(
    tickers: list[str],
    detect: bool = False,
    signals: bool = False,
    demo: bool = False,
    anytime: bool = False,
    discover: bool = False,
) -> None:
    """Start the APScheduler-based ingestion loop."""
    from src.ingestion.scheduler import IngestionScheduler

    scheduler = IngestionScheduler(tickers=tickers, anytime=anytime)

    if signals or detect:
        job_fn = (lambda: run_full_pipeline(tickers, demo=demo)) if signals else (lambda: run_detection(tickers, demo=demo))
        job_name = "Full Pipeline" if signals else "Anomaly Detection"

        def _job() -> None:
            logger.info("Running scheduled %s for %s", job_name.lower(), tickers)
            try:
                job_fn()
            except Exception:
                logger.exception("%s job failed", job_name)

        if anytime:
            from apscheduler.triggers.interval import IntervalTrigger

            scheduler.scheduler.add_job(
                _job,
                trigger=IntervalTrigger(minutes=15),
                id="pipeline_job",
                name=f"{job_name} (anytime)",
            )
            logger.info("%s job added (every 15 min, anytime mode)", job_name)
        else:
            from apscheduler.triggers.cron import CronTrigger

            if discover:
                scheduler.scheduler.add_job(
                    _job,
                    trigger=CronTrigger(
                        day_of_week="mon-fri",
                        hour="9-15",
                        minute="0,30",
                        timezone="US/Eastern",
                    ),
                    id="pipeline_job",
                    name=job_name,
                )
                logger.info("%s job added (at :00 and :30 during market hours, staggered with discovery)", job_name)
            else:
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

    if discover:
        def _discover_job() -> None:
            logger.info("Running scheduled discovery")
            try:
                run_discover_and_scan(demo=demo)
            except Exception:
                logger.exception("Discovery job failed")

        if anytime:
            from apscheduler.triggers.interval import IntervalTrigger
            scheduler.scheduler.add_job(
                _discover_job,
                trigger=IntervalTrigger(minutes=30),
                id="discovery_job",
                name="Discovery (anytime)",
            )
            logger.info("Discovery job added (every 30 min, anytime mode)")
        else:
            from apscheduler.triggers.cron import CronTrigger
            scheduler.scheduler.add_job(
                _discover_job,
                trigger=CronTrigger(
                    day_of_week="mon-fri",
                    hour="9-15",
                    minute="15,45",  # :15 and :45 — stagger with ingestion :00, pipeline :30
                    timezone="US/Eastern",
                ),
                id="discovery_job",
                name="Discovery",
            )
            logger.info("Discovery job added (at :15 and :45 during market hours)")

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

    if args.discover_only:
        run_discover_only()
        return

    tickers = [t.strip().upper() for t in args.tickers.split(",")]
    logger.info("OutlierQ ingestion — tickers: %s", tickers)

    # Mode banners
    if args.demo:
        print("\n\u26a0\ufe0f  DEMO MODE \u2014 Detection thresholds lowered. Signals may not reflect real outlier events.\n")
    if args.anytime:
        print("\U0001f550 ANYTIME MODE \u2014 Scheduler running regardless of market hours.\n")

    detect = args.detect or args.signals or args.discover
    signals = args.signals or args.discover

    if args.once:
        if args.discover:
            run_discover_and_scan(demo=args.demo)
        else:
            run_once(tickers, detect=detect, signals=signals, demo=args.demo)
    else:
        run_scheduled(
            tickers,
            detect=detect,
            signals=signals,
            demo=args.demo,
            anytime=args.anytime,
            discover=args.discover,
        )


if __name__ == "__main__":
    main()

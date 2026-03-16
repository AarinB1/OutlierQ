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
    python scripts/run_ingestion.py --autopilot --demo --anytime   # fully autonomous
    python scripts/run_ingestion.py --ml-status
    python scripts/run_ingestion.py --train-ml
    python scripts/run_ingestion.py --once --signals --use-ml --tickers AAPL,TSLA
    python scripts/run_ingestion.py --trading-scheduler --tickers SPY,AAPL,TSLA  # paper trading bot
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
    parser.add_argument(
        "--autopilot",
        action="store_true",
        help="Run fully autonomous: discover, ingest, and generate signals on a schedule (implies --signals --detect --discover)",
    )
    parser.add_argument(
        "--train-ml",
        action="store_true",
        help="Train ML model from labeled historical signals and exit",
    )
    parser.add_argument(
        "--ml-status",
        action="store_true",
        help="Print ML model status/readiness and exit",
    )
    parser.add_argument(
        "--use-ml",
        action="store_true",
        help="Use ML-enhanced ensemble classifier during pipeline runs",
    )
    # Trading module commands
    parser.add_argument(
        "--train-trading",
        action="store_true",
        help="Train LSTM/Transformer/Hybrid trading models",
    )
    parser.add_argument(
        "--backtest-trading",
        action="store_true",
        help="Run backtest with a trading strategy (use --tickers and --strategy)",
    )
    parser.add_argument(
        "--trading-status",
        action="store_true",
        help="Print trading model status and recent results",
    )
    parser.add_argument(
        "--tune-trading",
        action="store_true",
        help="Run Optuna hyperparameter tuning for trading models",
    )
    parser.add_argument(
        "--trading-scheduler",
        action="store_true",
        help="Run trading scheduler: weekly retrain, 15m signals, hourly snapshots",
    )
    parser.add_argument(
        "--trading-api",
        action="store_true",
        help="Start the FastAPI server with trading routes (same as --api)",
    )
    parser.add_argument(
        "--strategy",
        type=str,
        default="momentum",
        help="Trading strategy for backtesting (momentum, mean_reversion, breakout)",
    )
    return parser.parse_args()


def run_detection(tickers: list[str], demo: bool = False, use_ml: bool = False) -> None:
    """Run the anomaly detection pipeline and print results."""
    from src.detection import AnomalyPipeline

    pipeline = AnomalyPipeline(demo=demo, use_ml=use_ml)
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


def run_full_pipeline(tickers: list[str], demo: bool = False, use_ml: bool = False) -> None:
    """Run the full pipeline: detection + classification + signal generation."""
    from src.detection import AnomalyPipeline

    pipeline = AnomalyPipeline(demo=demo, use_ml=use_ml)
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


def run_ml_status() -> None:
    """Print ML model readiness and trained-model status."""
    from src.ml.model import OutlierQModel
    from src.ml.trainer import ModelTrainer

    trainer = ModelTrainer()
    readiness = trainer.check_readiness()
    model = OutlierQModel()
    loaded = model.load()

    print(f"\n{'='*60}")
    print("  ML MODEL STATUS")
    print(f"{'='*60}")
    print(f"  Ready to train:          {readiness['ready_to_train']}")
    print(f"  Signals with outcomes:   {readiness['signals_with_outcomes']}/30")
    print(
        "  Profit / Loss / Expired: "
        f"{readiness['profit_count']} / {readiness['loss_count']} / {readiness['expired_count']}"
    )
    print(f"  Status:                  {readiness['message']}")

    if loaded:
        metrics = model.training_metrics
        print("\n  Trained model:           YES")
        print(f"  Accuracy:                {float(metrics.get('accuracy', 0.0)):.3f}")
        print(f"  Precision:               {float(metrics.get('precision', 0.0)):.3f}")
        print(f"  Recall:                  {float(metrics.get('recall', 0.0)):.3f}")
        print(f"  F1 score:                {float(metrics.get('f1_score', 0.0)):.3f}")
        print(f"  Training samples:        {int(metrics.get('n_samples', 0))}")
        top = metrics.get("feature_importances_top10", [])
        if top:
            print("\n  Top Features:")
            for name, importance in top:
                print(f"    - {name}: {float(importance):.4f}")
    else:
        print("\n  Trained model:           NO")
        print("  No saved model found at .cache/ml_model.pkl")
    print()


def run_train_ml() -> None:
    """Train ML model if readiness criteria are met."""
    from src.ml.trainer import ModelTrainer

    trainer = ModelTrainer()
    readiness = trainer.check_readiness()

    print(f"\n{'='*60}")
    print("  ML READINESS CHECK")
    print(f"{'='*60}")
    print(f"  Signals with outcomes: {readiness['signals_with_outcomes']}/30")
    print(
        "  Profit / Loss / Expired: "
        f"{readiness['profit_count']} / {readiness['loss_count']} / {readiness['expired_count']}"
    )
    print(f"  {readiness['message']}")

    if not readiness["ready_to_train"]:
        needed = max(0, 30 - int(readiness["signals_with_outcomes"]))
        print(f"\nNeed {needed} more evaluated signals before ML training.\n")
        return

    result = trainer.train()
    if "error" in result:
        print(f"\nTraining failed: {result['error']}")
        print(result.get("details", {}))
        print()
        return

    print("\nModel training complete:")
    print(f"  Accuracy:   {float(result.get('accuracy', 0.0)):.3f}")
    print(f"  Precision:  {float(result.get('precision', 0.0)):.3f}")
    print(f"  Recall:     {float(result.get('recall', 0.0)):.3f}")
    print(f"  F1 score:   {float(result.get('f1_score', 0.0)):.3f}")
    print(f"  Samples:    {int(result.get('n_samples', 0))}")
    print("  Saved to:   .cache/ml_model.pkl")
    top = result.get("feature_importances_top10", [])
    if top:
        print("\nTop feature importances:")
        for name, importance in top:
            print(f"  - {name}: {float(importance):.4f}")
    print()


def _discovery_orchestrator(demo: bool = False, use_ml: bool = False):
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
    pipeline = AnomalyPipeline(demo=demo, use_ml=use_ml)
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


def run_discover_only(use_ml: bool = False) -> None:
    """Run discovery and print results; do not run pipeline."""
    orch = _discovery_orchestrator(use_ml=use_ml)
    discoveries = orch.discover()
    _print_discoveries(discoveries)
    print("Exiting (--discover-only). Use --discover to also run the pipeline.\n")


def run_discover_and_scan(demo: bool = False, use_ml: bool = False) -> None:
    """Run discovery, print discovered tickers, then feed into pipeline."""
    orch = _discovery_orchestrator(demo=demo, use_ml=use_ml)
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
    use_ml: bool = False,
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
        run_full_pipeline(tickers, demo=demo, use_ml=use_ml)
    elif detect:
        run_detection(tickers, demo=demo, use_ml=use_ml)


ACTIVE_TICKERS_CACHE_TTL = 300  # 5 minutes
_active_tickers_cache: list[str] = []
_active_tickers_ts: float = 0


def _get_active_tickers_cached(orch) -> list[str]:
    import time
    global _active_tickers_cache, _active_tickers_ts
    now = time.time()
    if _active_tickers_cache and (now - _active_tickers_ts) < ACTIVE_TICKERS_CACHE_TTL:
        return _active_tickers_cache
    _active_tickers_cache = orch.get_active_tickers()
    _active_tickers_ts = now
    return _active_tickers_cache


def _invalidate_active_tickers_cache() -> None:
    """Clear cache so next cycle picks up newly discovered tickers."""
    global _active_tickers_cache, _active_tickers_ts
    _active_tickers_cache = []
    _active_tickers_ts = 0


def run_autopilot(demo: bool = False, anytime: bool = False, use_ml: bool = False) -> None:
    """Run fully autonomous: discovery, ingestion, pipeline on schedule; status every hour."""
    from datetime import datetime, timedelta, timezone
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.interval import IntervalTrigger

    from src.db.tables import Signal
    from src.discovery.discovery_db import DiscoveredTicker

    print("\n🚀 AUTOPILOT MODE — OutlierQ is running autonomously. Discovering and monitoring all stocks.\n")
    orch = _discovery_orchestrator(demo=demo, use_ml=use_ml)

    # Heartbeat for API /api/status
    _cache_dir = Path(__file__).resolve().parent.parent / ".cache"
    _cache_dir.mkdir(parents=True, exist_ok=True)
    _heartbeat = _cache_dir / "autopilot_status.json"
    def _write_heartbeat() -> None:
        import json
        _heartbeat.write_text(json.dumps({
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "tickers_monitored": len(_get_active_tickers_cached(orch)),
        }))

    _write_heartbeat()

    # Initial discovery + scan
    try:
        signals = orch.discover_and_scan()
        logger.info("Initial autopilot scan: %d signals generated", len(signals))
        _invalidate_active_tickers_cache()
    except Exception:
        logger.exception("Initial autopilot discover_and_scan failed")

    scheduler = BlockingScheduler()

    def discovery_job() -> None:
        try:
            orch.discover_and_store_only()
            _invalidate_active_tickers_cache()
        except Exception:
            logger.exception("Autopilot discovery job failed")

    def ingestion_job() -> None:
        tickers = _get_active_tickers_cached(orch)
        if not tickers:
            return
        try:
            news = NewsFetcher()
            articles = news.fetch_batch(tickers)
            news.store_articles(articles)
        except Exception:
            logger.exception("Autopilot ingestion job failed")

    def pipeline_job() -> None:
        tickers = _get_active_tickers_cached(orch)
        if not tickers:
            return
        try:
            orch.pipeline.full_pipeline(tickers)
        except Exception:
            logger.exception("Autopilot pipeline job failed")

    def feedback_job() -> None:
        try:
            from src.signals.feedback_tracker import FeedbackTracker
            FeedbackTracker().evaluate_all_pending()
        except Exception:
            logger.exception("Autopilot feedback job failed")

    def status_job() -> None:
        try:
            from src.db.database import get_session
            now = datetime.now(timezone.utc)
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            with get_session() as s:
                n_tickers = len(_get_active_tickers_cached(orch))
                signals_today = s.query(Signal).filter(Signal.created_at >= today_start).count()
                discoveries_today = s.query(DiscoveredTicker).filter(DiscoveredTicker.discovered_at >= today_start).count()
            logger.info(
                "AUTOPILOT STATUS: monitoring %d tickers, %d signals generated today, %d discoveries today",
                n_tickers, signals_today, discoveries_today,
            )
            _write_heartbeat()
        except Exception:
            logger.exception("Autopilot status job failed")

    scheduler.add_job(discovery_job, trigger=IntervalTrigger(minutes=30), id="autopilot_discovery", name="Discovery")
    scheduler.add_job(ingestion_job, trigger=IntervalTrigger(minutes=15), id="autopilot_ingestion", name="News ingestion")
    run_date_5min = datetime.now(timezone.utc) + timedelta(minutes=5)
    scheduler.add_job(
        pipeline_job,
        trigger=IntervalTrigger(minutes=15),
        id="autopilot_pipeline",
        name="Full pipeline",
        next_run_time=run_date_5min,
    )
    scheduler.add_job(feedback_job, trigger=IntervalTrigger(hours=6), id="autopilot_feedback", name="Feedback evaluation")
    scheduler.add_job(status_job, trigger=IntervalTrigger(hours=1), id="autopilot_status", name="Status")

    logger.info(
        "Autopilot scheduler: discovery every 30 min, ingestion every 15 min, pipeline every 15 min (offset 5), feedback every 6 h, status every 1 h"
    )
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown(wait=False)
        logger.info("Autopilot stopped by user.")


def run_scheduled(
    tickers: list[str],
    detect: bool = False,
    signals: bool = False,
    demo: bool = False,
    anytime: bool = False,
    discover: bool = False,
    use_ml: bool = False,
) -> None:
    """Start the APScheduler-based ingestion loop."""
    from src.ingestion.scheduler import IngestionScheduler

    scheduler = IngestionScheduler(tickers=tickers, anytime=anytime)

    if signals or detect:
        job_fn = (
            lambda: run_full_pipeline(tickers, demo=demo, use_ml=use_ml)
        ) if signals else (
            lambda: run_detection(tickers, demo=demo, use_ml=use_ml)
        )
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
                run_discover_and_scan(demo=demo, use_ml=use_ml)
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


def run_train_trading() -> None:
    """Train LSTM, Transformer, and Hybrid trading models."""
    from src.trading.training.trainer import TradingTrainer

    print(f"\n{'='*60}")
    print("  TRAINING TRADING MODELS")
    print(f"{'='*60}")

    trainer = TradingTrainer()
    results = trainer.train_all_models(ticker="SPY", period="2y")

    if "error" in results:
        print(f"\nTraining failed: {results['error']}\n")
        return

    for model_name, result in results.items():
        print(f"\n  {model_name.upper()}:")
        print(f"    Val Accuracy:  {result.get('best_val_acc', 0):.3f}")
        print(f"    Test Accuracy: {result.get('test_acc', 0):.3f}")
        print(f"    Epochs:        {result.get('epochs_trained', 0)}")
        print(f"    Time:          {result.get('training_time_seconds', 0):.1f}s")

    print(f"\n  Models saved to .cache/trading_models/")
    print()


def run_backtest_trading(ticker: str, strategy_name: str) -> None:
    """Run a trading backtest and print results."""
    from src.trading.backtesting.backtest_engine import BacktestEngine
    from src.trading.features.feature_pipeline import FeaturePipeline
    from src.trading.strategies.momentum_strategy import MomentumStrategy
    from src.trading.strategies.mean_reversion_strategy import MeanReversionStrategy
    from src.trading.strategies.breakout_strategy import BreakoutStrategy

    strategy_map = {
        "momentum": MomentumStrategy,
        "mean_reversion": MeanReversionStrategy,
        "breakout": BreakoutStrategy,
    }

    StrategyClass = strategy_map.get(strategy_name)
    if not StrategyClass:
        print(f"Unknown strategy: {strategy_name}. Options: {', '.join(strategy_map.keys())}")
        return

    print(f"\n{'='*60}")
    print(f"  BACKTEST: {strategy_name} on {ticker}")
    print(f"{'='*60}")

    pipeline = FeaturePipeline()
    features_df = pipeline.build_features(ticker, period="1y", include_sentiment=False)
    if features_df.empty:
        print(f"No data for {ticker}\n")
        return

    strategy = StrategyClass()
    engine = BacktestEngine()
    result = engine.run(features_df, strategy, ticker)

    m = result.metrics
    print(f"\n  Sharpe Ratio:    {m.sharpe_ratio:.2f}")
    print(f"  Sortino Ratio:   {m.sortino_ratio:.2f}")
    print(f"  Total Return:    {m.total_return_pct:.1f}%")
    print(f"  Max Drawdown:    {m.max_drawdown_pct:.1f}%")
    print(f"  Win Rate:        {m.win_rate:.1%}")
    print(f"  Profit Factor:   {m.profit_factor:.2f}")
    print(f"  Total Trades:    {m.total_trades}")
    print(f"  Avg Trade P&L:   {m.avg_trade_pnl:.2f}%")
    print(f"  Best Trade:      {m.best_trade_pnl:.2f}%")
    print(f"  Worst Trade:     {m.worst_trade_pnl:.2f}%")
    print()


def run_trading_status() -> None:
    """Print trading model and system status."""
    from pathlib import Path

    print(f"\n{'='*60}")
    print("  TRADING MODULE STATUS")
    print(f"{'='*60}")

    model_dir = Path(".cache/trading_models")
    if model_dir.exists():
        models = list(model_dir.glob("*_model.pt"))
        print(f"\n  Saved models: {len(models)}")
        for m in models:
            size_mb = m.stat().st_size / (1024 * 1024)
            print(f"    - {m.name} ({size_mb:.1f} MB)")
    else:
        print("\n  No trained trading models found.")
        print("  Run: python scripts/run_ingestion.py --train-trading")

    try:
        from src.db.database import get_session
        from src.db.trading_tables import TradeSignal, BacktestRun, ModelCheckpoint

        with get_session() as s:
            n_signals = s.query(TradeSignal).count()
            n_backtests = s.query(BacktestRun).count()
            n_checkpoints = s.query(ModelCheckpoint).count()

        print(f"\n  Database:")
        print(f"    Trade signals:     {n_signals}")
        print(f"    Backtest runs:     {n_backtests}")
        print(f"    Model checkpoints: {n_checkpoints}")
    except Exception as e:
        print(f"\n  Database check failed: {e}")

    print()


def run_tune_trading() -> None:
    """Run Optuna tuning for trading models."""
    from src.trading.training.hyperparameter_tuner import HyperparameterTuner

    print(f"\n{'='*60}")
    print("  TUNING TRADING MODEL HYPERPARAMETERS")
    print(f"{'='*60}")
    tuner = HyperparameterTuner(n_trials=20)
    result = tuner.run()
    if "error" in result:
        print(f"\nTuning failed: {result['error']}\n")
        return
    print(f"\n  Best Val Sharpe (proxy): {result.get('best_val_sharpe', 0.0):.3f}")
    print(f"  Trials:                  {result.get('n_trials', 0)}")
    print(f"  Best Params:             {result.get('best_params', {})}\n")


def run_trading_scheduler(tickers: list[str]) -> None:
    """Run the paper-trading bot on a schedule."""
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.cron import CronTrigger
    from src.trading.paper_trading_bot import PaperTradingBot
    from src.trading.training.trainer import TradingTrainer

    print("\n📈 PAPER TRADING BOT — signals every 15m, monitoring every 1m, EOD summary at 4:05 PM ET.\n")

    bot = PaperTradingBot(tickers=tickers)
    scheduler = BlockingScheduler()

    def signal_job() -> None:
        try:
            bot.run_signal_cycle()
        except Exception:
            logger.exception("Paper trading signal job failed")

    def monitor_job() -> None:
        try:
            bot.run_monitor_cycle()
        except Exception:
            logger.exception("Paper trading monitor job failed")

    def eod_job() -> None:
        try:
            bot.end_of_day_summary()
            bot.export_trades("paper_trades.csv")
        except Exception:
            logger.exception("Paper trading EOD job failed")

    def retrain_job() -> None:
        logger.info("Weekly model retrain started")
        try:
            TradingTrainer().train_all_models(ticker="SPY", period="2y")
        except Exception:
            logger.exception("Weekly retrain job failed")

    scheduler.add_job(
        signal_job,
        trigger=CronTrigger(
            day_of_week="mon-fri", hour="9-15", minute="*/15",
            timezone="US/Eastern",
        ),
        id="paper_signal_15m",
        name="Paper trading signals every 15m",
    )
    scheduler.add_job(
        monitor_job,
        trigger=CronTrigger(
            day_of_week="mon-fri", hour="9-16", minute="*",
            timezone="US/Eastern",
        ),
        id="paper_monitor_1m",
        name="Paper trading monitor every 1m",
    )
    scheduler.add_job(
        eod_job,
        trigger=CronTrigger(
            day_of_week="mon-fri", hour=16, minute=5,
            timezone="US/Eastern",
        ),
        id="paper_eod",
        name="Paper trading EOD summary",
    )
    scheduler.add_job(
        retrain_job,
        trigger=CronTrigger(day_of_week="sun", hour=12, minute=0, timezone="UTC"),
        id="paper_retrain_weekly",
        name="Weekly model retrain",
    )

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown(wait=False)
        logger.info("Paper trading bot stopped by user.")


def main() -> None:
    args = parse_args()

    level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(format=LOG_FORMAT, level=level)

    # Standalone modes
    init_db()

    if args.api or args.trading_api:
        run_api()
        return

    if args.train_trading:
        run_train_trading()
        return

    if args.tune_trading:
        run_tune_trading()
        return

    if args.trading_scheduler:
        tickers = [t.strip().upper() for t in args.tickers.split(",")]
        run_trading_scheduler(tickers=tickers)
        return

    if args.backtest_trading:
        tickers = [t.strip().upper() for t in args.tickers.split(",")]
        run_backtest_trading(tickers[0], args.strategy)
        return

    if args.trading_status:
        run_trading_status()
        return

    if args.ml_status:
        run_ml_status()
        return

    if args.train_ml:
        run_train_ml()
        return

    if args.evaluate:
        run_evaluate()
        return

    if args.reclassify:
        run_reclassify()
        return

    if args.discover_only:
        run_discover_only(use_ml=args.use_ml)
        return

    tickers = [t.strip().upper() for t in args.tickers.split(",")]
    detect = args.detect or args.signals or args.discover or args.autopilot
    signals = args.signals or args.discover or args.autopilot

    if args.autopilot:
        logger.info("OutlierQ autopilot — no fixed ticker list")
        if args.demo:
            print("\n\u26a0\ufe0f  DEMO MODE \u2014 Detection thresholds lowered.\n")
        if args.anytime:
            print("\U0001f550 ANYTIME MODE \u2014 Scheduler running regardless of market hours.\n")
        run_autopilot(demo=args.demo, anytime=args.anytime, use_ml=args.use_ml)
        return

    logger.info("OutlierQ ingestion — tickers: %s", tickers)
    if args.use_ml:
        from src.ml.model import OutlierQModel

        model = OutlierQModel()
        if not model.load():
            print("\n--use-ml requires a trained model at .cache/ml_model.pkl. Run --train-ml first.\n")
            return
        print("\nUsing ML-enhanced classifier (ensemble mode)\n")
    if args.demo:
        print("\n\u26a0\ufe0f  DEMO MODE \u2014 Detection thresholds lowered. Signals may not reflect real outlier events.\n")
    if args.anytime:
        print("\U0001f550 ANYTIME MODE \u2014 Scheduler running regardless of market hours.\n")

    if args.once:
        if args.discover:
            run_discover_and_scan(demo=args.demo, use_ml=args.use_ml)
        else:
            run_once(
                tickers,
                detect=detect,
                signals=signals,
                demo=args.demo,
                use_ml=args.use_ml,
            )
    else:
        run_scheduled(
            tickers,
            detect=detect,
            signals=signals,
            demo=args.demo,
            anytime=args.anytime,
            discover=args.discover,
            use_ml=args.use_ml,
        )


if __name__ == "__main__":
    main()

"""Discovery orchestrator — combines scanners and feeds results into the anomaly pipeline."""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT
from src.db.database import get_session
from src.discovery.discovery_db import store_discovery, was_recently_scanned
from src.discovery.news_scanner import BroadNewsScanner
from src.discovery.volume_screener import VolumeScreener

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

DEDUP_HOURS = 2.0
CONFIDENCE_SINGLE = 0.5
CONFIDENCE_MULTI = 0.8


class DiscoveryOrchestrator:
    """Combines discovery sources and feeds discovered tickers into the anomaly pipeline."""

    def __init__(
        self,
        db_session: Session | None,
        finnhub_client: Any,
        market_fetcher: Any,
        pipeline: Any,  # AnomalyPipeline
        signal_engine: Any,  # SignalEngine
    ) -> None:
        self.db_session = db_session
        self.finnhub_client = finnhub_client
        self.market_fetcher = market_fetcher
        self.pipeline = pipeline
        self.signal_engine = signal_engine
        self.news_scanner = BroadNewsScanner(finnhub_client, db_session)
        self.volume_screener = VolumeScreener(market_fetcher, db_session)

    def discover(self, session: Session | None = None) -> list[dict]:
        """Run all scanners, merge results, dedupe by recent scan, return unified discovery list."""
        news_results = self.news_scanner.scan()
        volume_results = self.volume_screener.screen()

        # Merge by ticker
        merged: dict[str, dict] = {}
        for r in news_results:
            t = r["ticker"].upper()
            merged[t] = {
                "ticker": t,
                "discovery_methods": ["news_scanner"],
                "discovery_confidence": CONFIDENCE_SINGLE,
                "mention_count": r.get("mention_count"),
                "volume_ratio": None,
                "price_change_pct": None,
                "sample_headlines": r.get("sample_headlines") or [],
                "discovered_at": r.get("discovered_at", datetime.now(timezone.utc)),
            }
        for r in volume_results:
            t = r["ticker"].upper()
            if t in merged:
                merged[t]["discovery_methods"].append("volume_screener")
                merged[t]["discovery_confidence"] = CONFIDENCE_MULTI
                merged[t]["volume_ratio"] = r.get("volume_ratio")
                merged[t]["price_change_pct"] = r.get("price_change_pct")
                if not merged[t].get("sample_headlines"):
                    merged[t]["sample_headlines"] = []
            else:
                merged[t] = {
                    "ticker": t,
                    "discovery_methods": ["volume_screener"],
                    "discovery_confidence": CONFIDENCE_SINGLE,
                    "mention_count": None,
                    "volume_ratio": r.get("volume_ratio"),
                    "price_change_pct": r.get("price_change_pct"),
                    "sample_headlines": [],
                    "discovered_at": r.get("discovered_at", datetime.now(timezone.utc)),
                }

        # Dedupe: skip if scanned in last 2 hours
        def run(s: Session) -> list[dict]:
            out: list[dict] = []
            for t, data in merged.items():
                if was_recently_scanned(s, t, within_hours=DEDUP_HOURS):
                    continue
                out.append(data)
            return out

        if session is not None:
            return run(session)
        with get_session() as s:
            return run(s)

    def feed_discoveries(self, discoveries: list[dict], session: Session | None = None) -> list[Any]:
        """Store discovery records, ingest news for discovered tickers, run full pipeline. Call after discover()."""
        from src.ingestion.news_fetcher import NewsFetcher
        from src.discovery.discovery_db import DiscoveredTicker, store_discovery

        if not discoveries:
            return []

        def _run(s: Session) -> list[Any]:
            tickers = [d["ticker"] for d in discoveries]
            news_fetcher = NewsFetcher()
            discovery_rows: list[DiscoveredTicker] = []
            for d in discoveries:
                method = "both" if len(d["discovery_methods"]) >= 2 else d["discovery_methods"][0]
                row = store_discovery(s, {
                    "ticker": d["ticker"],
                    "discovery_method": method,
                    "discovery_confidence": d["discovery_confidence"],
                    "mention_count": d.get("mention_count"),
                    "volume_ratio": d.get("volume_ratio"),
                    "sample_headlines": d.get("sample_headlines"),
                    "discovered_at": d.get("discovered_at"),
                    "scanned": True,
                    "signal_generated": False,
                })
                discovery_rows.append(row)
            s.flush()
            try:
                articles = news_fetcher.fetch_batch(tickers)
                news_fetcher.store_articles(articles)
            except Exception as e:
                logger.warning("News fetch for discovered tickers failed: %s", e)
            signals = self.pipeline.full_pipeline(tickers, session=s)
            signal_tickers = {sig.ticker for sig in signals}
            for row in discovery_rows:
                if row.ticker in signal_tickers:
                    row.signal_generated = True
            s.flush()
            return signals

        if session is not None:
            return _run(session)
        with get_session() as s:
            return _run(s)

    def discover_and_scan(self, session: Session | None = None) -> list[Any]:
        """Discover tickers, ingest news, run full pipeline, return generated signals."""
        discoveries = self.discover(session=session)
        if not discoveries:
            logger.info("Discovery: 0 tickers found -> nothing to scan")
            return []
        from_both = sum(1 for d in discoveries if len(d["discovery_methods"]) >= 2)
        from_news_only = sum(1 for d in discoveries if d["discovery_methods"] == ["news_scanner"])
        from_volume_only = sum(1 for d in discoveries if d["discovery_methods"] == ["volume_screener"])
        logger.info(
            "Discovery: %d tickers found (%d from news, %d from volume, %d from both) -> feeding pipeline",
            len(discoveries), from_news_only, from_volume_only, from_both,
        )
        signals = self.feed_discoveries(discoveries, session=session)
        logger.info(
            "Discovery: %d tickers found (%d from news, %d from volume, %d from both) -> %d signals generated",
            len(discoveries), from_news_only, from_volume_only, from_both, len(signals),
        )
        return signals

    def discover_and_scan_loop(self, interval_minutes: int = 30) -> None:
        """Run discover_and_scan on a recurring interval (for scheduled mode)."""
        import time
        while True:
            try:
                self.discover_and_scan()
            except Exception:
                logger.exception("Discovery loop iteration failed")
            time.sleep(interval_minutes * 60)
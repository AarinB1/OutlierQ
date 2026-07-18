"""FastAPI REST API for the OutlierQ dashboard.

Serves signal, event, and accuracy data to the React frontend.
"""

import logging
import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT
from src.db.database import SessionLocal, init_db
from src.db.tables import Article, Event, Signal
from src.data.stock_data import StockDataService
from src.detection.edgar_monitor import EdgarMonitor
from src.detection.options_flow import OptionsFlowDetector
from src.discovery.discovery_db import DiscoveredTicker
from src.ingestion.market_fetcher import MarketFetcher
from src.indicators.technical import TechnicalAnalyzer
from src.signals.feedback_tracker import FeedbackTracker

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)

app = FastAPI(title="OutlierQ API", version="1.0.0")

# CORS for React dev servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount trading API routes
from src.api.trading_routes import router as trading_router
app.include_router(trading_router)

# Mount prediction market routes
from src.api.prediction_routes import router as prediction_router
app.include_router(prediction_router)

# WebSocket manager
from src.api.websocket_manager import ws_manager


def get_db() -> Session:
    """FastAPI dependency for database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
def startup() -> None:
    init_db()


# ── WebSocket ─────────────────────────────────────────────────────────


@app.websocket("/ws/signals")
async def websocket_signals(websocket: WebSocket) -> None:
    """Real-time signal stream via WebSocket."""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; client can send pings
            data = await websocket.receive_text()
            # Echo back as heartbeat
            await websocket.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


# ── Health ────────────────────────────────────────────────────────────


@app.get("/api/health")
def health(db: Session = Depends(get_db)) -> dict:
    signals_count = db.query(Signal).count()
    events_count = db.query(Event).count()
    last_signal = (
        db.query(Signal).order_by(Signal.created_at.desc()).first()
    )
    last_scan = last_signal.created_at.isoformat() if last_signal and last_signal.created_at else None
    return {
        "status": "ok",
        "signals_count": signals_count,
        "events_count": events_count,
        "last_scan": last_scan,
    }


# ── Signals ───────────────────────────────────────────────────────────


@app.get("/api/signals")
def list_signals(
    ticker: Optional[str] = None,
    direction: Optional[str] = None,
    sort_by: str = Query("time", regex="^(confidence|time|ticker)$"),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[dict]:
    SORT_COLUMNS = {
        "confidence": Signal.confidence,
        "time": Signal.suggested_expiry,
        "ticker": Signal.ticker,
    }
    sort_col = SORT_COLUMNS[sort_by]
    order = sort_col.asc() if sort_order == "asc" else sort_col.desc()

    query = db.query(Signal).order_by(order)
    if ticker:
        query = query.filter(Signal.ticker == ticker.upper())
    if direction:
        query = query.filter(Signal.direction == direction)
    signals = query.offset(offset).limit(limit).all()

    # Batch-fetch linked events in one query instead of one per signal.
    event_ids = {sig.event_id for sig in signals if sig.event_id}
    events_by_id = {
        e.id: e
        for e in db.query(Event).filter(Event.id.in_(event_ids)).all()
    } if event_ids else {}
    return [_signal_to_dict(sig, events_by_id.get(sig.event_id)) for sig in signals]


@app.get("/api/signals/{signal_id}")
def get_signal(signal_id: str, db: Session = Depends(get_db)) -> dict:
    sig = db.query(Signal).filter(Signal.id == signal_id).first()
    if not sig:
        raise HTTPException(status_code=404, detail="Signal not found")

    event = db.query(Event).filter(Event.id == sig.event_id).first()
    result = _signal_to_dict(sig, event)

    # Include linked articles
    if event and event.article_ids:
        articles = db.query(Article).filter(Article.id.in_(event.article_ids)).all()
        result["articles"] = [
            {
                "id": a.id,
                "headline": a.headline,
                "source": a.source,
                "url": a.url,
                "published_at": a.published_at.isoformat() if a.published_at else None,
                "sentiment_score": a.sentiment_score,
            }
            for a in articles
        ]
    return result


@app.get("/api/stream")
async def stream_signals() -> StreamingResponse:
    """SSE stream of newly created signals for realtime dashboard updates."""

    async def _event_generator():
        last_seen = datetime.now(timezone.utc) - timedelta(seconds=5)
        while True:
            try:
                with SessionLocal() as db:
                    rows = (
                        db.query(Signal)
                        .filter(Signal.created_at >= last_seen)
                        .order_by(Signal.created_at.asc())
                        .all()
                    )
                    for sig in rows:
                        event = db.query(Event).filter(Event.id == sig.event_id).first()
                        payload = _signal_to_dict(sig, event)
                        yield f"event: signal\ndata: {json.dumps(payload)}\n\n"
                        if sig.created_at:
                            # SQLite returns naive datetimes; comparing them to the
                            # aware last_seen raised TypeError and killed the stream.
                            created = _as_utc(sig.created_at)
                            last_seen = max(last_seen, created + timedelta(microseconds=1))
                yield ": keepalive\n\n"
                await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("SSE stream loop failed")
                await asyncio.sleep(1.0)

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# ── Events ────────────────────────────────────────────────────────────


@app.get("/api/events")
def list_events(
    ticker: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[dict]:
    query = db.query(Event).order_by(Event.detected_at.desc())
    if ticker:
        query = query.filter(Event.ticker == ticker.upper())
    if event_type:
        query = query.filter(Event.event_type == event_type)
    events = query.offset(offset).limit(limit).all()

    return [_event_to_dict(e) for e in events]


# ── Stats ─────────────────────────────────────────────────────────────


@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)) -> dict:
    tracker = FeedbackTracker()
    return tracker.get_accuracy_stats(session=db)


@app.get("/api/stats/confusion")
def get_confusion(db: Session = Depends(get_db)) -> dict:
    tracker = FeedbackTracker()
    return tracker.get_confusion_matrix(session=db)


# ── ML ────────────────────────────────────────────────────────────────


@app.get("/api/ml/readiness")
def ml_readiness(db: Session = Depends(get_db)) -> dict:
    from src.ml.trainer import ModelTrainer

    trainer = ModelTrainer()
    return trainer.check_readiness(session=db)


@app.post("/api/ml/train")
def ml_train(db: Session = Depends(get_db)) -> dict:
    from src.ml.trainer import ModelTrainer

    trainer = ModelTrainer()
    result = trainer.train(session=db)
    if "error" in result:
        return result
    return result


@app.get("/api/ml/status")
def ml_status(db: Session = Depends(get_db)) -> dict:
    from src.ml.model import OutlierQModel
    from src.ml.trainer import ModelTrainer

    trainer = ModelTrainer()
    readiness = trainer.check_readiness(session=db)
    model = OutlierQModel()
    is_trained = model.load()
    importances = model.get_feature_importances()[:10] if is_trained else []
    recent_eval = trainer.evaluate_on_recent(session=db, n=20) if is_trained else {
        "n_evaluated": 0,
        "model_accuracy": 0.0,
        "keyword_accuracy": 0.0,
        "comparison": [],
    }
    metrics = model.training_metrics if is_trained else {}
    return {
        "is_trained": is_trained,
        "training_metrics": metrics,
        "feature_importances": importances,
        "training_data_size": int(metrics.get("n_samples", 0)) if metrics else 0,
        "readiness_check": readiness,
        "recent_comparison": recent_eval,
    }


# ── Tickers ───────────────────────────────────────────────────────────


@app.get("/api/tickers")
def list_tickers(db: Session = Depends(get_db)) -> list[dict]:
    from sqlalchemy import case, func

    rows = (
        db.query(
            Signal.ticker,
            func.count(Signal.id),
            func.sum(case((Signal.outcome == "profit", 1), else_=0)),
            func.sum(case((Signal.outcome.isnot(None), 1), else_=0)),
            func.max(Signal.created_at),
        )
        .group_by(Signal.ticker)
        .all()
    )
    return [
        {
            "ticker": ticker,
            "total_signals": total,
            "win_rate": (wins or 0) / total_eval if total_eval else 0.0,
            "last_signal_date": last_sig.isoformat() if last_sig else None,
        }
        for ticker, total, wins, total_eval, last_sig in rows
    ]


# ── Ticker data (per-ticker endpoints) ────────────────────────────────

_stock_svc = StockDataService()
_options_flow = OptionsFlowDetector(market_fetcher=MarketFetcher())
_technical = TechnicalAnalyzer(market_fetcher=MarketFetcher())
_edgar = EdgarMonitor()


@app.get("/api/ticker/{ticker}/price-history")
def ticker_price_history(
    ticker: str,
    period: str = Query("3mo", description="1d, 5d, 1mo, 3mo, 6mo, 1y, 5y, max"),
    interval: str = Query("1d", description="1m, 5m, 15m, 1h, 1d, 1wk, 1mo"),
) -> dict:
    data = _stock_svc.get_price_history(ticker.upper(), period=period, interval=interval)
    return {"ticker": ticker.upper(), "period": period, "interval": interval, "data": data}


@app.get("/api/ticker/{ticker}/intraday")
def ticker_intraday(ticker: str) -> list[dict]:
    return _stock_svc.get_intraday(ticker.upper())


@app.get("/api/ticker/{ticker}/info")
def ticker_info(ticker: str) -> dict:
    return _stock_svc.get_info(ticker.upper())


@app.get("/api/ticker/{ticker}/stats")
def ticker_stats(ticker: str) -> dict:
    return _stock_svc.get_stats(ticker.upper())


@app.get("/api/ticker/{ticker}/chart-data")
def ticker_chart_data(
    ticker: str,
    period: str = Query("6mo", pattern="^(1d|1w|5d|1mo|3mo|6mo|1y|2y|5y|max)$"),
    db: Session = Depends(get_db),
) -> dict:
    yf_period = {"1w": "5d"}.get(period, period)
    data = _stock_svc.get_chart_data(ticker.upper(), period=yf_period, session=db)
    data["indicators"] = _technical.get_ticker_indicators(ticker.upper())
    return data


@app.get("/api/ticker/{ticker}/summary")
def ticker_summary(ticker: str, db: Session = Depends(get_db)) -> dict:
    return _stock_svc.get_summary(ticker.upper(), session=db)


@app.get("/api/ticker/{ticker}/options-flow")
def ticker_options_flow(ticker: str) -> dict:
    result = _options_flow.scan_ticker(ticker.upper())
    if result is None:
        return {"ticker": ticker.upper(), "unusual_activity": False}
    return result


@app.get("/api/ticker/{ticker}/indicators")
def ticker_indicators(ticker: str) -> dict | None:
    return _technical.get_ticker_indicators(ticker.upper())


@app.get("/api/ticker/{ticker}/edgar")
def ticker_edgar(ticker: str) -> dict:
    result = _edgar.scan_ticker(ticker.upper())
    if result is None:
        return {"ticker": ticker.upper(), "significant_findings": False}
    return {**result, "significant_findings": True}


# ── Actions ───────────────────────────────────────────────────────────


@app.post("/api/evaluate")
def evaluate(db: Session = Depends(get_db)) -> dict:
    tracker = FeedbackTracker()
    results = tracker.evaluate_all_pending(session=db)
    db.commit()
    return {"evaluated": len(results), "results": results}


# ── Active tickers & status ───────────────────────────────────────────


@app.get("/api/active-tickers")
def active_tickers(db: Session = Depends(get_db)) -> dict:
    """Return tickers OutlierQ is currently monitoring, grouped by source."""
    from datetime import timedelta
    from src.db.tables import Event
    from src.discovery.discovery_db import DiscoveredTicker

    now = datetime.now(timezone.utc)
    events_cutoff = now - timedelta(hours=48)
    discovered_cutoff = now - timedelta(hours=24)

    from_events = {row[0] for row in db.query(Event.ticker).filter(Event.detected_at >= events_cutoff).distinct().all()}
    from_discovered = {
        row[0] for row in
        db.query(DiscoveredTicker.ticker).filter(
            DiscoveredTicker.discovered_at >= discovered_cutoff
        ).distinct().all()
    }
    all_active = list(from_events | from_discovered)

    # Per-ticker discovery method (last 24h)
    ticker_method: dict[str, set[str]] = {}
    for row in db.query(DiscoveredTicker.ticker, DiscoveredTicker.discovery_method).filter(
        DiscoveredTicker.discovered_at >= discovered_cutoff
    ).all():
        t, m = row[0], row[1]
        ticker_method.setdefault(t, set()).add(m)

    manual = [t for t in all_active if t not in ticker_method]
    news_scanner = [t for t, methods in ticker_method.items() if methods == {"news_scanner"}]
    volume_screener = [t for t, methods in ticker_method.items() if methods == {"volume_screener"}]
    both = [t for t, methods in ticker_method.items() if "both" in methods or len(methods) > 1]

    return {
        "tickers": all_active,
        "by_source": {
            "manual": manual,
            "news_scanner": news_scanner,
            "volume_screener": volume_screener,
            "both": both,
        },
        "count": len(all_active),
    }


@app.get("/api/status")
def status(db: Session = Depends(get_db)) -> dict:
    """Return autopilot status: monitoring count, signals today, last scan, etc."""
    from datetime import timedelta
    from pathlib import Path

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    signals_today = db.query(Signal).filter(Signal.created_at >= today_start).count()
    discoveries_today = db.query(DiscoveredTicker).filter(
        DiscoveredTicker.discovered_at >= today_start
    ).count()

    last_signal = db.query(Signal).order_by(Signal.created_at.desc()).first()
    last_scan = last_signal.created_at.isoformat() if last_signal and last_signal.created_at else None

    # Active ticker count (same logic as active-tickers)
    events_cutoff = now - timedelta(hours=48)
    discovered_cutoff = now - timedelta(hours=24)
    from_disc = db.query(DiscoveredTicker.ticker).filter(
        DiscoveredTicker.discovered_at >= discovered_cutoff
    ).distinct().all()
    from_disc_set = set(row[0] for row in from_disc)
    from_ev = db.query(Event.ticker).filter(Event.detected_at >= events_cutoff).distinct().all()
    from_ev_set = set(row[0] for row in from_ev)
    tickers_monitored = len(from_ev_set | from_disc_set)

    heartbeat_path = Path(__file__).resolve().parent.parent.parent / ".cache" / "autopilot_status.json"
    is_autopilot_running = False
    next_scan = None
    if heartbeat_path.exists():
        try:
            import json
            data = json.loads(heartbeat_path.read_text())
            ts = data.get("last_updated")
            if ts:
                try:
                    last_updated = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    if (now - last_updated).total_seconds() < 7200:  # 2 hours
                        is_autopilot_running = True
                    next_scan = data.get("next_scan")
                except (ValueError, TypeError):
                    pass
        except Exception:
            pass

    return {
        "is_autopilot_running": is_autopilot_running,
        "tickers_monitored": tickers_monitored,
        "signals_today": signals_today,
        "discoveries_today": discoveries_today,
        "last_scan": last_scan,
        "next_scan": next_scan,
    }


# ── Discoveries ───────────────────────────────────────────────────────


@app.get("/api/discoveries")
def list_discoveries(
    method: Optional[str] = Query(None, description="Filter: news, volume, both"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Return recent discovered tickers, newest first."""
    query = db.query(DiscoveredTicker).order_by(DiscoveredTicker.discovered_at.desc())
    if method:
        query = query.filter(DiscoveredTicker.discovery_method == method)
    rows = query.offset(offset).limit(limit).all()
    return [
        {
            "id": r.id,
            "ticker": r.ticker,
            "discovery_method": r.discovery_method,
            "discovery_confidence": r.discovery_confidence,
            "mention_count": r.mention_count,
            "volume_ratio": r.volume_ratio,
            "sample_headlines": r.sample_headlines or [],
            "discovered_at": r.discovered_at.isoformat() if r.discovered_at else None,
            "scanned": r.scanned,
            "signal_generated": r.signal_generated,
        }
        for r in rows
    ]


@app.get("/api/discoveries/stats")
def discovery_stats(db: Session = Depends(get_db)) -> dict:
    """Return discovery stats: total discovered, how many led to signals, top sources."""
    from datetime import timedelta
    from sqlalchemy import func

    total = db.query(DiscoveredTicker).count()
    with_signals = db.query(DiscoveredTicker).filter(DiscoveredTicker.signal_generated == True).count()
    today_start = datetime.now(timezone.utc) - timedelta(days=1)
    today_count = db.query(DiscoveredTicker).filter(DiscoveredTicker.discovered_at >= today_start).count()
    today_signals = (
        db.query(DiscoveredTicker)
        .filter(DiscoveredTicker.discovered_at >= today_start, DiscoveredTicker.signal_generated == True)
        .count()
    )
    by_method = (
        db.query(DiscoveredTicker.discovery_method, func.count(DiscoveredTicker.id))
        .group_by(DiscoveredTicker.discovery_method)
        .all()
    )
    return {
        "total_discovered": total,
        "total_led_to_signals": with_signals,
        "discovered_today": today_count,
        "led_to_signals_today": today_signals,
        "by_method": {m: c for m, c in by_method},
    }


@app.post("/api/discover")
def trigger_discover(db: Session = Depends(get_db)) -> dict:
    """Trigger a discovery scan on-demand. Returns discovered tickers."""
    import finnhub
    from config.settings import FINNHUB_API_KEY
    from src.detection import AnomalyPipeline
    from src.discovery.orchestrator import DiscoveryOrchestrator
    from src.ingestion.market_fetcher import MarketFetcher
    from src.signals.signal_engine import SignalEngine

    if not FINNHUB_API_KEY:
        raise HTTPException(status_code=503, detail="FINNHUB_API_KEY not set")
    client = finnhub.Client(api_key=FINNHUB_API_KEY)
    market = MarketFetcher()
    pipeline = AnomalyPipeline()
    engine = SignalEngine(market_fetcher=market)
    orch = DiscoveryOrchestrator(
        db_session=db,
        finnhub_client=client,
        market_fetcher=market,
        pipeline=pipeline,
        signal_engine=engine,
    )
    discoveries = orch.discover(session=db)
    from src.discovery.discovery_db import store_discovery
    for d in discoveries:
        method = "both" if len(d.get("discovery_methods", [])) >= 2 else (d.get("discovery_methods") or ["unknown"])[0]
        store_discovery(db, {
            "ticker": d["ticker"],
            "discovery_method": method,
            "discovery_confidence": d.get("discovery_confidence", 0.5),
            "mention_count": d.get("mention_count"),
            "volume_ratio": d.get("volume_ratio"),
            "sample_headlines": d.get("sample_headlines"),
            "scanned": False,
            "signal_generated": False,
        })
    db.commit()
    return {
        "discovered": len(discoveries),
        "tickers": [
            {
                "ticker": d["ticker"],
                "discovery_methods": d.get("discovery_methods", []),
                "discovery_confidence": d.get("discovery_confidence"),
                "mention_count": d.get("mention_count"),
                "volume_ratio": d.get("volume_ratio"),
                "sample_headlines": d.get("sample_headlines", [])[:3],
            }
            for d in discoveries
        ],
    }


@app.post("/api/scan")
def scan(body: dict, db: Session = Depends(get_db)) -> dict:
    from src.detection import AnomalyPipeline

    tickers = body.get("tickers", [])
    if not tickers:
        raise HTTPException(status_code=400, detail="No tickers provided")

    pipeline = AnomalyPipeline()
    signals = pipeline.full_pipeline(tickers, session=db)
    db.commit()

    return {
        "signals_generated": len(signals),
        "signals": [
            {
                "ticker": s.ticker,
                "direction": s.direction,
                "strike": s.suggested_strike,
                "expiry": s.suggested_expiry,
                "confidence": s.confidence,
            }
            for s in signals
        ],
    }


# ── MiroFish runtime toggle ───────────────────────────────────────────


@app.post("/api/mirofish/toggle")
def toggle_mirofish():
    """Flip the MiroFish enabled state on/off. Takes effect on the next pipeline cycle."""
    from config.runtime import toggle_mirofish as _toggle
    new_state = _toggle()
    logger.info("MiroFish toggled to %s via API", new_state)
    return {"mirofish_enabled": new_state}


@app.get("/api/mirofish/status")
def mirofish_status():
    """Return the current MiroFish enabled state."""
    from config.runtime import is_mirofish_enabled
    return {"mirofish_enabled": is_mirofish_enabled()}


# ── Helpers ───────────────────────────────────────────────────────────


def _as_utc(dt: datetime) -> datetime:
    """Interpret naive datetimes (as returned by SQLite) as UTC."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _signal_to_dict(sig: Signal, event: Event | None = None) -> dict:
    d = {
        "id": sig.id,
        "ticker": sig.ticker,
        "direction": sig.direction,
        "suggested_strike": sig.suggested_strike,
        "suggested_expiry": sig.suggested_expiry,
        "confidence": sig.confidence,
        "outcome": sig.outcome,
        "outcome_pnl": sig.outcome_pnl,
        "entry_price": sig.entry_price,
        "entry_iv": sig.entry_iv,
        "raw_confidence": sig.raw_confidence,
        "created_at": sig.created_at.isoformat() if sig.created_at else None,
        "event_id": sig.event_id,
        "exploratory": getattr(sig, "exploratory", False) or False,
        "discovery_source": getattr(sig, "discovery_source", None),
        "simulation_enhanced": getattr(sig, "simulation_enhanced", False) or False,
    }
    if event:
        d["event"] = _event_to_dict(event)
    return d


def _event_to_dict(event: Event) -> dict:
    return {
        "id": event.id,
        "ticker": event.ticker,
        "event_type": event.event_type,
        "direction": event.direction,
        "confidence": event.confidence,
        "detected_at": event.detected_at.isoformat() if event.detected_at else None,
        "article_ids": event.article_ids,
        "metadata": event.metadata_json,
    }

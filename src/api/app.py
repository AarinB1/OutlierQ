"""FastAPI REST API for the OutlierQ dashboard.

Serves signal, event, and accuracy data to the React frontend.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT
from src.db.database import SessionLocal, init_db
from src.db.tables import Article, Event, Signal
from src.ingestion.market_fetcher import MarketFetcher
from src.signals.feedback_tracker import FeedbackTracker

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)

app = FastAPI(title="OutlierQ API", version="1.0.0")

# CORS for React dev servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[dict]:
    query = db.query(Signal).order_by(Signal.created_at.desc())
    if ticker:
        query = query.filter(Signal.ticker == ticker.upper())
    if direction:
        query = query.filter(Signal.direction == direction)
    signals = query.offset(offset).limit(limit).all()

    results = []
    for sig in signals:
        event = db.query(Event).filter(Event.id == sig.event_id).first()
        results.append(_signal_to_dict(sig, event))
    return results


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


# ── Tickers ───────────────────────────────────────────────────────────


@app.get("/api/tickers")
def list_tickers(db: Session = Depends(get_db)) -> list[dict]:
    tickers = db.query(Signal.ticker).distinct().all()
    results = []
    for (ticker,) in tickers:
        signals = db.query(Signal).filter(Signal.ticker == ticker).all()
        wins = sum(1 for s in signals if s.outcome == "profit")
        total_eval = sum(1 for s in signals if s.outcome is not None)
        last_sig = max(
            (s.created_at for s in signals if s.created_at),
            default=None,
        )
        results.append({
            "ticker": ticker,
            "total_signals": len(signals),
            "win_rate": wins / total_eval if total_eval > 0 else 0.0,
            "last_signal_date": last_sig.isoformat() if last_sig else None,
        })
    return results


# ── Actions ───────────────────────────────────────────────────────────


@app.post("/api/evaluate")
def evaluate(db: Session = Depends(get_db)) -> dict:
    tracker = FeedbackTracker()
    results = tracker.evaluate_all_pending(session=db)
    db.commit()
    return {"evaluated": len(results), "results": results}


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


# ── Helpers ───────────────────────────────────────────────────────────


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
        "created_at": sig.created_at.isoformat() if sig.created_at else None,
        "event_id": sig.event_id,
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

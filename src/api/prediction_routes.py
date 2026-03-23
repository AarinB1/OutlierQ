"""FastAPI routes for the prediction market module."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from src.db.database import SessionLocal
from src.predictions.polymarket_fetcher import PolymarketFetcher
from src.predictions.kalshi_fetcher import KalshiFetcher
from src.predictions.market_matcher import MarketMatcher
from src.predictions.prediction_engine import PredictionEngine
from src.predictions.prediction_tracker import PredictionTracker
from src.predictions.prediction_db import Prediction, PredictionMarket

router = APIRouter(prefix="/api/predictions", tags=["predictions"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/markets")
def get_markets(
    platform: Optional[str] = Query(None, pattern="^(polymarket|kalshi)$"),
    limit: int = Query(50, ge=1, le=200),
    min_volume: float = Query(10000),
    db: Session = Depends(get_db),
):
    """Fetch active prediction markets from one or both platforms."""
    markets = []

    if platform in (None, "polymarket"):
        poly = PolymarketFetcher()
        markets.extend(poly.fetch_active_markets(limit=limit, min_volume=min_volume))

    if platform in (None, "kalshi"):
        kalshi = KalshiFetcher()
        markets.extend(kalshi.fetch_active_markets(limit=limit, min_volume=int(min_volume)))

    # Sort combined by volume
    markets.sort(key=lambda m: m.get("volume", 0), reverse=True)
    return {"markets": markets[:limit], "count": len(markets)}


@router.post("/scan")
def scan_for_predictions(
    body: dict,
    db: Session = Depends(get_db),
):
    """Run the full prediction pipeline: fetch markets, match events, generate predictions.

    Body:
        tickers: list[str] -- tickers to scan (uses recent events from DB)
        platform: optional "polymarket" | "kalshi" | null (both)
        min_edge: optional float (default 0.05)
    """
    from src.db.tables import Event
    from src.signals.feedback_tracker import FeedbackTracker

    platform = body.get("platform")
    min_edge = body.get("min_edge", 0.05)

    # 1. Fetch markets
    markets = []
    if platform in (None, "polymarket"):
        markets.extend(PolymarketFetcher().fetch_active_markets(limit=100))
    if platform in (None, "kalshi"):
        markets.extend(KalshiFetcher().fetch_active_markets(limit=100))

    if not markets:
        return {"predictions": [], "count": 0, "message": "No markets available"}

    # 2. Get recent events from DB (last 48 hours)
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(hours=48)
    recent_events = (
        db.query(Event)
        .filter(Event.detected_at >= cutoff)
        .order_by(Event.detected_at.desc())
        .limit(50)
        .all()
    )

    events = [
        {
            "ticker": e.ticker,
            "event_type": e.event_type,
            "direction": e.direction,
            "confidence": e.confidence,
            "headlines": [e.headline] if hasattr(e, "headline") and e.headline else [],
        }
        for e in recent_events
    ]

    if not events:
        return {"predictions": [], "count": 0, "message": "No recent events detected"}

    # 3. Match
    matcher = MarketMatcher()
    matches = matcher.match_events_to_markets(events, markets)

    # 4. Generate predictions
    tracker_stats = FeedbackTracker().get_accuracy_stats()
    engine = PredictionEngine(min_edge=min_edge)
    predictions = engine.generate_predictions(matches, accuracy_stats=tracker_stats)

    # 5. Store
    pred_tracker = PredictionTracker(db)
    stored = []
    for p in predictions:
        record = pred_tracker.store_prediction(p)
        stored.append({**p, "id": record.id})
    db.commit()

    return {"predictions": stored, "count": len(stored)}


@router.get("/history")
def get_prediction_history(
    limit: int = Query(50, ge=1, le=200),
    platform: Optional[str] = Query(None),
    resolved_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Fetch past predictions with optional filters."""
    query = db.query(Prediction).order_by(Prediction.created_at.desc())
    if platform:
        query = query.filter(Prediction.platform == platform)
    if resolved_only:
        query = query.filter(Prediction.actual_outcome.isnot(None))

    preds = query.limit(limit).all()
    return {
        "predictions": [
            {
                "id": p.id,
                "market_id": p.market_id,
                "platform": p.platform,
                "question": p.question,
                "predicted_outcome": p.predicted_outcome,
                "predicted_probability": p.predicted_probability,
                "market_probability": p.market_probability,
                "edge": p.edge,
                "confidence": p.confidence,
                "matched_event_type": p.matched_event_type,
                "matched_tickers": p.matched_tickers,
                "actual_outcome": p.actual_outcome,
                "is_correct": p.is_correct,
                "pnl_if_bet": p.pnl_if_bet,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "resolved_at": p.resolved_at.isoformat() if p.resolved_at else None,
            }
            for p in preds
        ],
        "count": len(preds),
    }


@router.get("/stats")
def get_prediction_stats(db: Session = Depends(get_db)):
    """Get accuracy statistics for all resolved predictions."""
    tracker = PredictionTracker(db)
    return tracker.get_accuracy_stats()

"""FastAPI routes for the prediction market module."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from src.db.database import SessionLocal
from src.predictions.polymarket_fetcher import PolymarketFetcher
from src.predictions.kalshi_fetcher import KalshiFetcher
from src.predictions.market_matcher import MarketMatcher
from src.predictions.prediction_engine import PredictionEngine
from src.predictions.prediction_tracker import PredictionTracker
from src.predictions.prediction_db import Prediction, PredictionMarket, ArbitrageOpportunity
from src.predictions.arbitrage_detector import ArbitrageDetector

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
    cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    recent_events = (
        db.query(Event)
        .filter(Event.detected_at >= cutoff)
        .order_by(Event.detected_at.desc())
        .limit(50)
        .all()
    )

    from src.predictions.market_matcher import build_event_dicts
    events = build_event_dicts(recent_events, db)

    if not events:
        return {"predictions": [], "count": 0, "message": "No recent events detected"}

    # 3. Match
    matcher = MarketMatcher()
    matches = matcher.match_events_to_markets(events, markets)

    # 4. Generate predictions
    tracker_stats = FeedbackTracker().get_accuracy_stats()
    engine = PredictionEngine(min_edge=min_edge)

    # 4b. Run MiroFish simulations if enabled
    sim_results: dict = {}
    try:
        from config.runtime import is_mirofish_enabled
        if is_mirofish_enabled():
            from src.predictions.prediction_simulator import submit_prediction_simulations
            from src.simulation.mirofish_client import MirofishClient

            # Build initial predictions without simulation (need them for seeding)
            initial_predictions = engine.generate_predictions(matches, accuracy_stats=tracker_stats)

            if initial_predictions:
                # Build event/article maps for seeding
                events_by_market = {}
                articles_by_ticker = {}
                for match in matches:
                    mid = match["market"]["market_id"]
                    events_by_market[mid] = match["event"]
                    ticker = match["event"].get("ticker", "")
                    if ticker and ticker not in articles_by_ticker:
                        # Fetch articles for this ticker
                        from src.db.tables import Article
                        ticker_articles = (
                            db.query(Article)
                            .filter(Article.ticker == ticker)
                            .order_by(Article.published_at.desc())
                            .limit(10)
                            .all()
                        )
                        articles_by_ticker[ticker] = [
                            {"headline": a.headline, "summary": a.summary, "source": a.source}
                            for a in ticker_articles
                        ]

                client = MirofishClient()
                sim_results = submit_prediction_simulations(
                    initial_predictions,
                    events_by_match=events_by_market,
                    articles_by_ticker=articles_by_ticker,
                    client=client,
                )
    except Exception:
        import logging
        logging.getLogger(__name__).debug("MiroFish prediction enrichment skipped", exc_info=True)

    # Now generate final predictions with simulation data
    predictions = engine.generate_predictions(
        matches, accuracy_stats=tracker_stats, simulation_results=sim_results,
    )

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
                "simulation_enhanced": p.simulation_enhanced or False,
                "sim_estimated_probability": p.sim_estimated_probability,
                "sim_consensus_strength": p.sim_consensus_strength,
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


# ── Arbitrage Endpoints ──────────────────────────────────────────────


@router.post("/arbitrage/scan")
def scan_arbitrage(
    body: dict = {},
    db: Session = Depends(get_db),
):
    """Scan for cross-platform arbitrage opportunities.

    Body (all optional):
        min_spread: float (default 0.03)
        min_volume: float (default 5000)
        min_match_score: float (default 0.55)
        limit: int (default 100)
    """
    min_spread = body.get("min_spread", 0.03)
    min_volume = body.get("min_volume", 5000)
    min_match_score = body.get("min_match_score", 0.55)
    limit = body.get("limit", 100)

    # Fetch from both platforms
    poly_markets = PolymarketFetcher().fetch_active_markets(limit=limit, min_volume=min_volume)
    kalshi_markets = KalshiFetcher().fetch_active_markets(limit=limit, min_volume=int(min_volume))

    if not poly_markets or not kalshi_markets:
        return {
            "opportunities": [],
            "count": 0,
            "message": f"Insufficient markets: polymarket={len(poly_markets)}, kalshi={len(kalshi_markets)}",
        }

    # Detect arbitrage
    detector = ArbitrageDetector(
        min_spread=min_spread,
        min_match_score=min_match_score,
        min_volume=min_volume,
    )
    opportunities = detector.detect(poly_markets, kalshi_markets)

    # Store in DB
    stored = []
    for opp in opportunities:
        record = ArbitrageOpportunity(**opp)
        db.add(record)
        db.flush()
        stored.append({**opp, "id": record.id})
    db.commit()

    return {
        "opportunities": stored,
        "count": len(stored),
        "poly_markets_scanned": len(poly_markets),
        "kalshi_markets_scanned": len(kalshi_markets),
    }


@router.get("/arbitrage/history")
def get_arbitrage_history(
    status: Optional[str] = Query(None, pattern="^(open|closed|expired|false_positive)$"),
    min_spread: float = Query(0.0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Fetch past arbitrage opportunities."""
    query = (
        db.query(ArbitrageOpportunity)
        .filter(ArbitrageOpportunity.spread >= min_spread)
        .order_by(ArbitrageOpportunity.detected_at.desc())
    )
    if status:
        query = query.filter(ArbitrageOpportunity.status == status)

    opps = query.limit(limit).all()
    return {
        "opportunities": [
            {
                "id": o.id,
                "poly_market_id": o.poly_market_id,
                "poly_question": o.poly_question,
                "poly_yes_price": o.poly_yes_price,
                "poly_volume": o.poly_volume,
                "kalshi_market_id": o.kalshi_market_id,
                "kalshi_question": o.kalshi_question,
                "kalshi_yes_price": o.kalshi_yes_price,
                "kalshi_volume": o.kalshi_volume,
                "spread": o.spread,
                "spread_pct": o.spread_pct,
                "direction": o.direction,
                "match_score": o.match_score,
                "match_method": o.match_method,
                "theoretical_profit": o.theoretical_profit,
                "status": o.status,
                "detected_at": o.detected_at.isoformat() if o.detected_at else None,
            }
            for o in opps
        ],
        "count": len(opps),
    }


@router.patch("/arbitrage/{opp_id}/status")
def update_arbitrage_status(
    opp_id: int,
    body: dict,
    db: Session = Depends(get_db),
):
    """Mark an arbitrage opportunity as closed, expired, or false_positive."""
    opp = db.query(ArbitrageOpportunity).filter(ArbitrageOpportunity.id == opp_id).first()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    new_status = body.get("status")
    if new_status not in ("open", "closed", "expired", "false_positive"):
        raise HTTPException(status_code=400, detail="Invalid status")

    opp.status = new_status
    if new_status in ("closed", "expired", "false_positive"):
        opp.closed_at = datetime.now(timezone.utc)
    opp.notes = body.get("notes", opp.notes)
    db.commit()
    return {"id": opp.id, "status": opp.status}

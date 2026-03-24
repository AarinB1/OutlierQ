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


# ── Execution Endpoints ─────────────────────────────────────────────


@router.post("/execute")
def execute_predictions(body: dict, db: Session = Depends(get_db)):
    """Execute pending predictions (place bets via paper or live mode).

    Body:
        mode: str ("paper"|"kalshi_demo"|"kalshi_live"|"polymarket") — default "paper"
        prediction_ids: list[int] (optional) — specific predictions to execute;
            if omitted, executes all unexecuted predictions from the last 24 hours.
    """
    from src.predictions.execution.executor import PredictionExecutor
    from config.settings import (
        PREDICTION_EXECUTION_MODE, PREDICTION_BANKROLL, PREDICTION_MAX_BET_PCT,
        PREDICTION_KELLY_FRACTION, PREDICTION_MAX_POSITIONS, PREDICTION_EXECUTION_MIN_EDGE,
        KALSHI_API_KEY_ID, KALSHI_PRIVATE_KEY_PATH_EXEC,
        POLYMARKET_PRIVATE_KEY, POLYMARKET_FUNDER_ADDRESS, POLYMARKET_SIGNATURE_TYPE,
    )
    from datetime import timedelta

    mode = body.get("mode", PREDICTION_EXECUTION_MODE)
    prediction_ids = body.get("prediction_ids")

    # Fetch predictions to execute
    if prediction_ids:
        preds = db.query(Prediction).filter(Prediction.id.in_(prediction_ids)).all()
    else:
        cutoff = datetime.utcnow() - timedelta(hours=24)
        preds = (
            db.query(Prediction)
            .filter(Prediction.created_at >= cutoff, Prediction.actual_outcome.is_(None))
            .order_by(Prediction.created_at.desc())
            .limit(50)
            .all()
        )

    if not preds:
        return {"results": [], "count": 0, "message": "No predictions to execute"}

    pred_dicts = [
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
        }
        for p in preds
    ]

    bankroll_config = {
        "initial_bankroll": body.get("bankroll", PREDICTION_BANKROLL),
        "max_bet_pct": PREDICTION_MAX_BET_PCT,
        "kelly_fraction": PREDICTION_KELLY_FRACTION,
        "max_open_positions": PREDICTION_MAX_POSITIONS,
        "min_edge": PREDICTION_EXECUTION_MIN_EDGE,
    }
    kalshi_config = {
        "api_key_id": KALSHI_API_KEY_ID,
        "private_key_path": KALSHI_PRIVATE_KEY_PATH_EXEC,
    }
    polymarket_config = {
        "private_key": POLYMARKET_PRIVATE_KEY,
        "funder_address": POLYMARKET_FUNDER_ADDRESS,
        "signature_type": POLYMARKET_SIGNATURE_TYPE,
    }

    executor = PredictionExecutor(
        mode=mode,
        bankroll_config=bankroll_config,
        kalshi_config=kalshi_config if mode.startswith("kalshi") else None,
        polymarket_config=polymarket_config if mode == "polymarket" else None,
        db_session=db,
    )

    results = executor.execute_predictions(pred_dicts)
    db.commit()
    return {"results": results, "count": len(results), "mode": mode}


@router.get("/positions")
def get_positions(mode: str = "paper", db: Session = Depends(get_db)):
    """Get open prediction market positions."""
    from src.predictions.execution.execution_db import PredictionPosition

    mode_filter = "paper" if mode == "paper" else "live"
    positions = (
        db.query(PredictionPosition)
        .filter(PredictionPosition.mode == mode_filter)
        .all()
    )
    return {
        "positions": [
            {
                "id": p.id,
                "market_id": p.market_id,
                "platform": p.platform,
                "question": p.question,
                "side": p.side,
                "contracts": p.contracts,
                "avg_price": p.avg_price,
                "cost_basis": p.cost_basis,
                "current_price": p.current_price,
                "unrealized_pnl": p.unrealized_pnl,
                "mode": p.mode,
                "opened_at": p.opened_at.isoformat() if p.opened_at else None,
            }
            for p in positions
        ],
        "count": len(positions),
    }


@router.get("/bankroll")
def get_bankroll(mode: str = "paper", db: Session = Depends(get_db)):
    """Get current bankroll state and performance."""
    from src.predictions.execution.executor import PredictionExecutor
    from config.settings import PREDICTION_BANKROLL

    executor = PredictionExecutor(
        mode=mode,
        bankroll_config={"initial_bankroll": PREDICTION_BANKROLL},
        db_session=db,
    )
    return executor.get_portfolio_summary()


@router.post("/resolve")
def resolve_positions(body: dict, db: Session = Depends(get_db)):
    """Manually resolve positions.

    Body:
        market_id: str
        outcome: "yes" | "no"
        mode: str (default "paper")
    """
    from src.predictions.execution.executor import PredictionExecutor
    from config.settings import PREDICTION_BANKROLL

    market_id = body.get("market_id")
    outcome = body.get("outcome")
    mode = body.get("mode", "paper")

    if not market_id or outcome not in ("yes", "no"):
        raise HTTPException(status_code=400, detail="market_id and outcome (yes/no) required")

    executor = PredictionExecutor(
        mode=mode,
        bankroll_config={"initial_bankroll": PREDICTION_BANKROLL},
        db_session=db,
    )
    results = executor.resolve_markets([{"market_id": market_id, "outcome": outcome}])
    db.commit()

    if not results:
        raise HTTPException(status_code=404, detail="No open position found for this market")

    return results[0]


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
        opp.closed_at = datetime.utcnow()
    opp.notes = body.get("notes", opp.notes)
    db.commit()
    return {"id": opp.id, "status": opp.status}

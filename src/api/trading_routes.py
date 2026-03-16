"""FastAPI routes for the short-term trading module.

Mounted on the existing FastAPI app via include_router.
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT
from src.db.database import SessionLocal
from src.db.trading_tables import (
    BacktestRun,
    MarketRegime,
    ModelCheckpoint,
    PortfolioState,
    TradeExecution,
    TradeSignal,
)

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

router = APIRouter(prefix="/api/trading", tags=["trading"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Trading Signals ──────────────────────────────────────────────────


@router.get("/signals")
def list_trading_signals(
    ticker: Optional[str] = None,
    direction: Optional[str] = None,
    strategy: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[dict]:
    query = db.query(TradeSignal).order_by(TradeSignal.created_at.desc())
    if ticker:
        query = query.filter(TradeSignal.ticker == ticker.upper())
    if direction:
        query = query.filter(TradeSignal.direction == direction.upper())
    if strategy:
        query = query.filter(TradeSignal.strategy_name == strategy)
    if status:
        query = query.filter(TradeSignal.status == status)

    signals = query.offset(offset).limit(limit).all()
    return [_trade_signal_to_dict(s) for s in signals]


@router.get("/signals/{signal_id}")
def get_trading_signal(signal_id: str, db: Session = Depends(get_db)) -> dict:
    sig = db.query(TradeSignal).filter(TradeSignal.id == signal_id).first()
    if not sig:
        raise HTTPException(status_code=404, detail="Trading signal not found")
    return _trade_signal_to_dict(sig)


@router.patch("/signals/{signal_id}/status")
def update_signal_status(signal_id: str, body: dict, db: Session = Depends(get_db)) -> dict:
    sig = db.query(TradeSignal).filter(TradeSignal.id == signal_id).first()
    if not sig:
        raise HTTPException(status_code=404, detail="Signal not found")
    new_status = body.get("status")
    if new_status not in ("pending", "active", "closed", "cancelled"):
        raise HTTPException(status_code=400, detail="Invalid status")
    sig.status = new_status
    db.commit()
    return _trade_signal_to_dict(sig)


# ── Backtesting ──────────────────────────────────────────────────────


@router.post("/backtest")
def run_backtest(body: dict, db: Session = Depends(get_db)) -> dict:
    """Run a backtest with the given configuration."""
    from src.trading.backtesting.backtest_engine import BacktestEngine
    from src.trading.features.feature_pipeline import FeaturePipeline
    from src.trading.strategies.momentum_strategy import MomentumStrategy
    from src.trading.strategies.mean_reversion_strategy import MeanReversionStrategy
    from src.trading.strategies.breakout_strategy import BreakoutStrategy

    ticker = body.get("ticker", "SPY")
    strategy_name = body.get("strategy", "momentum")
    period = body.get("period", "1y")
    initial_capital = body.get("initial_capital", 100000)

    strategy_map = {
        "momentum": MomentumStrategy,
        "mean_reversion": MeanReversionStrategy,
        "breakout": BreakoutStrategy,
    }

    StrategyClass = strategy_map.get(strategy_name)
    if not StrategyClass:
        raise HTTPException(status_code=400, detail=f"Unknown strategy: {strategy_name}")

    strategy = StrategyClass()
    if body.get("params"):
        strategy.set_parameters(body["params"])

    pipeline = FeaturePipeline()
    features_df = pipeline.build_features(ticker, period=period, include_sentiment=False)
    if features_df.empty:
        raise HTTPException(status_code=400, detail=f"No data available for {ticker}")

    engine = BacktestEngine(initial_capital=initial_capital)
    result = engine.run(features_df, strategy, ticker)

    equity_curve = result.equity_curve
    if not isinstance(equity_curve, pd.Series):
        equity_curve = pd.Series(equity_curve)

    peak = equity_curve.cummax()
    drawdown = (equity_curve - peak) / peak * 100

    monthly = equity_curve.resample("ME").last().pct_change().dropna() * 100

    # Store in DB
    bt_run = BacktestRun(
        strategy_name=strategy_name,
        ticker=ticker,
        initial_capital=initial_capital,
        final_capital=equity_curve.iloc[-1] if len(equity_curve) > 0 else initial_capital,
        sharpe=result.metrics.sharpe_ratio,
        sortino=result.metrics.sortino_ratio,
        max_drawdown=result.metrics.max_drawdown_pct,
        win_rate=result.metrics.win_rate,
        total_trades=result.metrics.total_trades,
        profit_factor=result.metrics.profit_factor,
        total_return_pct=result.metrics.total_return_pct,
        config_json=result.config,
    )
    db.add(bt_run)
    db.commit()

    return {
        "id": bt_run.id,
        "metrics": asdict(result.metrics),
        "equity_curve": {
            "dates": [str(d) for d in equity_curve.index],
            "values": equity_curve.values.tolist(),
        },
        "drawdown_curve": {
            "dates": [str(d) for d in drawdown.index],
            "values": drawdown.values.tolist(),
        },
        "monthly_returns": [
            {"month": d.strftime("%Y-%m"), "return_pct": round(v, 2)}
            for d, v in monthly.items()
        ],
        "trades": result.trades[:100],
        "config": result.config,
    }


@router.get("/backtest/{backtest_id}")
def get_backtest(backtest_id: str, db: Session = Depends(get_db)) -> dict:
    bt = db.query(BacktestRun).filter(BacktestRun.id == backtest_id).first()
    if not bt:
        raise HTTPException(status_code=404, detail="Backtest not found")
    return {
        "id": bt.id,
        "strategy_name": bt.strategy_name,
        "ticker": bt.ticker,
        "initial_capital": bt.initial_capital,
        "final_capital": bt.final_capital,
        "sharpe": bt.sharpe,
        "sortino": bt.sortino,
        "max_drawdown": bt.max_drawdown,
        "win_rate": bt.win_rate,
        "total_trades": bt.total_trades,
        "profit_factor": bt.profit_factor,
        "total_return_pct": bt.total_return_pct,
        "config": bt.config_json,
        "created_at": bt.created_at.isoformat() if bt.created_at else None,
    }


@router.get("/backtests")
def list_backtests(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[dict]:
    runs = db.query(BacktestRun).order_by(BacktestRun.created_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "strategy_name": r.strategy_name,
            "ticker": r.ticker,
            "sharpe": r.sharpe,
            "total_return_pct": r.total_return_pct,
            "max_drawdown": r.max_drawdown,
            "win_rate": r.win_rate,
            "total_trades": r.total_trades,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in runs
    ]


# ── Portfolio ────────────────────────────────────────────────────────


@router.get("/portfolio")
def get_portfolio(db: Session = Depends(get_db)) -> dict:
    latest = (
        db.query(PortfolioState)
        .order_by(PortfolioState.timestamp.desc())
        .first()
    )
    if not latest:
        return {
            "cash": 100000.0,
            "total_value": 100000.0,
            "positions": [],
            "daily_pnl": 0.0,
            "cumulative_pnl": 0.0,
            "max_drawdown": 0.0,
            "positions_count": 0,
        }
    return {
        "cash": latest.cash,
        "total_value": latest.total_value,
        "positions": latest.positions_json or [],
        "daily_pnl": latest.daily_pnl,
        "cumulative_pnl": latest.cumulative_pnl,
        "max_drawdown": latest.max_drawdown,
        "timestamp": latest.timestamp.isoformat() if latest.timestamp else None,
        "positions_count": len(latest.positions_json or []),
    }


@router.get("/portfolio/history")
def get_portfolio_history(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Return portfolio snapshots over the last N days for equity timeline."""
    from datetime import timedelta

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    snapshots = (
        db.query(PortfolioState)
        .filter(PortfolioState.timestamp >= cutoff)
        .order_by(PortfolioState.timestamp.asc())
        .all()
    )
    return [
        {
            "timestamp": s.timestamp.isoformat() if s.timestamp else None,
            "cash": s.cash,
            "total_value": s.total_value,
            "daily_pnl": s.daily_pnl,
            "cumulative_pnl": s.cumulative_pnl,
            "max_drawdown": s.max_drawdown,
        }
        for s in snapshots
    ]


@router.get("/executions")
def list_executions(
    ticker: Optional[str] = None,
    strategy: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Return closed trade executions."""
    query = db.query(TradeExecution).order_by(TradeExecution.exit_time.desc())
    if ticker:
        query = query.filter(TradeExecution.ticker == ticker.upper())
    if strategy:
        query = query.filter(TradeExecution.strategy_name == strategy)
    executions = query.offset(offset).limit(limit).all()
    return [
        {
            "id": e.id,
            "signal_id": e.signal_id,
            "ticker": e.ticker,
            "direction": e.direction,
            "entry_time": e.entry_time.isoformat() if e.entry_time else None,
            "exit_time": e.exit_time.isoformat() if e.exit_time else None,
            "entry_price": e.entry_price,
            "exit_price": e.exit_price,
            "quantity": e.quantity,
            "pnl_dollars": e.pnl_dollars,
            "pnl_percent": e.pnl_percent,
            "fees": e.fees,
            "slippage": e.slippage,
            "exit_reason": e.exit_reason,
            "strategy_name": e.strategy_name,
        }
        for e in executions
    ]


# ── Models ───────────────────────────────────────────────────────────


@router.get("/models")
def list_models(db: Session = Depends(get_db)) -> list[dict]:
    """Return model checkpoints, deduplicated by model_name (latest version only)."""
    from sqlalchemy import func

    subq = (
        db.query(
            ModelCheckpoint.model_name,
            func.max(ModelCheckpoint.version).label("max_version"),
        )
        .group_by(ModelCheckpoint.model_name)
        .subquery()
    )

    checkpoints = (
        db.query(ModelCheckpoint)
        .join(
            subq,
            (ModelCheckpoint.model_name == subq.c.model_name)
            & (ModelCheckpoint.version == subq.c.max_version),
        )
        .order_by(ModelCheckpoint.model_name.asc())
        .all()
    )

    return [
        {
            "id": m.id,
            "model_name": m.model_name,
            "model_type": m.model_type,
            "version": m.version,
            "val_accuracy": m.val_accuracy,
            "val_sharpe": m.val_sharpe,
            "trained_at": m.trained_at.isoformat() if m.trained_at else None,
            "hyperparameters": m.hyperparameters,
            "feature_names": m.feature_names,
            "model_path": m.model_path,
            "is_trained": m.model_path is not None and m.val_accuracy is not None,
        }
        for m in checkpoints
    ]


@router.get("/models/{model_name}/history")
def get_model_history(model_name: str, db: Session = Depends(get_db)) -> list[dict]:
    """Return version history for a specific model."""
    checkpoints = (
        db.query(ModelCheckpoint)
        .filter(ModelCheckpoint.model_name == model_name)
        .order_by(ModelCheckpoint.version.desc())
        .limit(10)
        .all()
    )
    if not checkpoints:
        raise HTTPException(status_code=404, detail=f"Model '{model_name}' not found")
    return [
        {
            "id": m.id,
            "version": m.version,
            "val_accuracy": m.val_accuracy,
            "val_sharpe": m.val_sharpe,
            "trained_at": m.trained_at.isoformat() if m.trained_at else None,
            "hyperparameters": m.hyperparameters,
        }
        for m in checkpoints
    ]


@router.post("/models/train")
def trigger_model_training(body: dict, db: Session = Depends(get_db)) -> dict:
    """Trigger training for a specific model type.

    Body: { "model_type": "lstm" | "transformer" | "hybrid" | "all" }
    """
    model_type = body.get("model_type", "all")

    try:
        from src.trading.training.trainer import TradingTrainer

        trainer = TradingTrainer()

        ticker = body.get("ticker", "SPY")
        period = body.get("period", "2y")

        result = trainer.train_all_models(ticker=ticker, period=period)
        return {
            "status": "completed",
            "model_type": model_type,
            "result": result if isinstance(result, dict) else str(result),
        }
    except Exception as e:
        logger.exception("Model training failed")
        return {
            "status": "failed",
            "model_type": model_type,
            "error": str(e),
        }


# ── Regime ───────────────────────────────────────────────────────────


@router.get("/regime")
def get_current_regime(db: Session = Depends(get_db)) -> dict:
    latest = (
        db.query(MarketRegime)
        .order_by(MarketRegime.timestamp.desc())
        .first()
    )
    if not latest:
        return {"regime": "sideways", "confidence": 0.5, "vix_level": None}
    return {
        "regime": latest.regime,
        "confidence": latest.confidence,
        "vix_level": latest.vix_level,
        "vix_percentile": latest.vix_percentile,
        "timestamp": latest.timestamp.isoformat() if latest.timestamp else None,
    }


@router.get("/regime/history")
def get_regime_history(
    days: int = 90, db: Session = Depends(get_db)
) -> list[dict]:
    """Return historical market regimes for the last N days."""
    if days <= 0:
        days = 30
    from datetime import datetime, timedelta

    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(MarketRegime)
        .filter(MarketRegime.timestamp >= cutoff)
        .order_by(MarketRegime.timestamp.asc())
        .all()
    )
    return [
        {
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "regime": r.regime,
            "confidence": r.confidence,
            "vix_level": r.vix_level,
            "vix_percentile": r.vix_percentile,
        }
        for r in rows
    ]


# ── Metrics ──────────────────────────────────────────────────────────


@router.get("/metrics")
def get_trading_metrics(db: Session = Depends(get_db)) -> dict:
    """Return aggregate trading metrics."""
    total_signals = db.query(TradeSignal).count()
    active_signals = db.query(TradeSignal).filter(TradeSignal.status == "active").count()
    closed_signals = db.query(TradeSignal).filter(TradeSignal.status == "closed").count()

    executions = db.query(TradeExecution).all()
    total_pnl = sum(e.pnl_dollars or 0 for e in executions)
    winning = sum(1 for e in executions if (e.pnl_dollars or 0) > 0)
    total_exec = len(executions)

    return {
        "total_signals": total_signals,
        "active_signals": active_signals,
        "closed_signals": closed_signals,
        "total_executions": total_exec,
        "total_pnl": total_pnl,
        "win_rate": winning / total_exec if total_exec > 0 else 0.0,
    }


@router.get("/risk/summary")
def get_risk_summary(db: Session = Depends(get_db)) -> dict:
    """Return aggregate risk summary computed from current portfolio and executions."""
    # Use latest portfolio snapshot to derive exposures
    latest_state = (
        db.query(PortfolioState)
        .order_by(PortfolioState.timestamp.desc())
        .first()
    )

    sector_exposure: dict[str, float] = {}
    ticker_exposure: dict[str, float] = {}
    total_gross = 0.0

    if latest_state and latest_state.positions_json:
        for pos in latest_state.positions_json:
            ticker = pos.get("ticker") or "UNKNOWN"
            sector = pos.get("sector") or "Unknown"
            quantity = pos.get("quantity") or 0
            mark_price = pos.get("mark_price") or pos.get("entry_price") or 0
            value = float(quantity) * float(mark_price)
            total_gross += abs(value)
            sector_exposure[sector] = sector_exposure.get(sector, 0.0) + value
            ticker_exposure[ticker] = ticker_exposure.get(ticker, 0.0) + value

    max_ticker = max((abs(v) for v in ticker_exposure.values()), default=0.0)
    max_ticker_pct = (max_ticker / total_gross) if total_gross > 0 else 0.0

    # Realized PnL from executions
    executions = db.query(TradeExecution).all()
    realized_pnl = sum(e.pnl_dollars or 0 for e in executions)

    return {
        "total_gross_exposure": total_gross,
        "max_single_name_exposure_pct": max_ticker_pct,
        "realized_pnl": realized_pnl,
        "sector_exposure": sector_exposure,
        "ticker_exposure": ticker_exposure,
    }


@router.get("/risk/limits")
def get_risk_limits() -> dict:
    """Return static risk limits configuration."""
    return {
        "max_gross_exposure": 2.0,  # 200% of equity
        "max_single_name_pct": 0.10,  # 10% per name
        "max_sector_pct": 0.30,  # 30% per sector
        "max_drawdown_pct": 0.20,  # 20% peak-to-trough
        "max_leverage": 2.0,
    }


# ── Generate signals on demand ───────────────────────────────────────


@router.post("/generate-signals")
def generate_signals_endpoint(body: dict, db: Session = Depends(get_db)) -> dict:
    """Generate trading signals for given tickers."""
    from src.trading.signals.trade_signal_engine import TradeSignalEngine
    from src.trading.strategies.momentum_strategy import MomentumStrategy
    from src.trading.strategies.mean_reversion_strategy import MeanReversionStrategy
    from src.trading.strategies.breakout_strategy import BreakoutStrategy

    tickers = body.get("tickers", ["SPY"])
    period = body.get("period", "1y")

    engine = TradeSignalEngine()
    engine.register_strategy(MomentumStrategy())
    engine.register_strategy(MeanReversionStrategy())
    engine.register_strategy(BreakoutStrategy())

    signals = engine.generate_signals(tickers, period=period)
    signal_ids = engine.store_signals(signals)

    return {
        "generated": len(signals),
        "signal_ids": signal_ids,
        "signals": [
            {
                "ticker": s.ticker,
                "direction": s.direction,
                "strategy": s.strategy_name,
                "confidence": s.confidence,
                "entry_price": s.entry_price,
                "target_price": s.target_price,
                "stop_loss": s.stop_loss,
            }
            for s in signals
        ],
    }


# ── Helpers ──────────────────────────────────────────────────────────


def _trade_signal_to_dict(sig: TradeSignal) -> dict:
    return {
        "id": sig.id,
        "ticker": sig.ticker,
        "direction": sig.direction,
        "strategy_name": sig.strategy_name,
        "model_name": sig.model_name,
        "entry_price": sig.entry_price,
        "target_price": sig.target_price,
        "stop_loss": sig.stop_loss,
        "confidence": sig.confidence,
        "timeframe": sig.timeframe,
        "status": sig.status,
        "pnl": sig.pnl,
        "created_at": sig.created_at.isoformat() if sig.created_at else None,
        "metadata": sig.metadata_json,
    }

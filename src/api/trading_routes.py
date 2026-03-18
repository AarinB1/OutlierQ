"""FastAPI routes for the short-term trading module."""

from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT
from src.db.database import SessionLocal
from src.db.trading_tables import (
    BacktestRun,
    MarketRegime,
    ModelCheckpoint,
    PortfolioState,
    StrategyConfig,
    TradeExecution,
    TradeJournal,
    TradeSignal,
    UserSettings,
    Watchlist,
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


def _normalize_strategy_name(strategy: str | None) -> str | None:
    if not strategy:
        return None
    return strategy.strip().lower().replace(" ", "_")


def _setting_value(db: Session, key: str, default: Any = None) -> Any:
    row = db.query(UserSettings).filter(UserSettings.key == key).first()
    if not row:
        return default
    return row.value_json


def _set_setting_value(db: Session, key: str, value: Any) -> None:
    row = db.query(UserSettings).filter(UserSettings.key == key).first()
    if row:
        row.value_json = value
    else:
        db.add(UserSettings(key=key, value_json=value))


def _is_demo_enabled(db: Session) -> bool:
    return bool(_setting_value(db, "demo_mode", False))


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
    normalized_strategy = _normalize_strategy_name(strategy)
    if normalized_strategy:
        query = query.filter(TradeSignal.strategy_name == normalized_strategy)
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
    db.refresh(sig)
    return _trade_signal_to_dict(sig)


# ── Backtesting ──────────────────────────────────────────────────────


@router.get("/strategies/defaults")
def get_strategy_defaults() -> dict:
    """Return default parameters for each strategy."""
    from src.trading.strategies.breakout_strategy import BreakoutStrategy
    from src.trading.strategies.mean_reversion_strategy import MeanReversionStrategy
    from src.trading.strategies.momentum_strategy import MomentumStrategy

    return {
        "momentum": MomentumStrategy().get_parameters(),
        "mean_reversion": MeanReversionStrategy().get_parameters(),
        "breakout": BreakoutStrategy().get_parameters(),
    }


@router.get("/strategies/configs")
def list_strategy_configs(db: Session = Depends(get_db)) -> list[dict]:
    configs = db.query(StrategyConfig).order_by(StrategyConfig.updated_at.desc()).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "strategy_name": c.strategy_name,
            "regime": c.regime,
            "params": c.params_json,
            "toggles": c.toggles_json,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in configs
    ]


@router.post("/strategies/configs")
def save_strategy_config(body: dict, db: Session = Depends(get_db)) -> dict:
    name = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Config name is required")

    existing = db.query(StrategyConfig).filter(StrategyConfig.name == name).first()
    if existing:
        existing.strategy_name = body.get("strategy_name", existing.strategy_name)
        existing.regime = body.get("regime", existing.regime)
        existing.params_json = body.get("params", existing.params_json)
        existing.toggles_json = body.get("toggles", existing.toggles_json)
        db.commit()
        db.refresh(existing)
        return {"id": existing.id, "name": existing.name, "status": "updated"}

    config = StrategyConfig(
        name=name,
        strategy_name=body.get("strategy_name", "ensemble"),
        regime=body.get("regime"),
        params_json=body.get("params"),
        toggles_json=body.get("toggles"),
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return {"id": config.id, "name": config.name, "status": "created"}


@router.delete("/strategies/configs/{config_id}")
def delete_strategy_config(config_id: str, db: Session = Depends(get_db)) -> dict:
    config = db.query(StrategyConfig).filter(StrategyConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    db.delete(config)
    db.commit()
    return {"deleted": config_id}


@router.post("/backtest")
def run_backtest(body: dict, db: Session = Depends(get_db)) -> dict:
    """Run a backtest with the given configuration."""
    from datetime import datetime as dt

    from src.trading.backtesting.backtest_engine import BacktestEngine
    from src.trading.features.feature_pipeline import FeaturePipeline
    from src.trading.strategies.breakout_strategy import BreakoutStrategy
    from src.trading.strategies.ensemble_strategy import EnsembleStrategy
    from src.trading.strategies.mean_reversion_strategy import MeanReversionStrategy
    from src.trading.strategies.momentum_strategy import MomentumStrategy

    ticker = str(body.get("ticker", "SPY")).upper()
    strategy_name = _normalize_strategy_name(
        body.get("strategy_name") or body.get("strategy") or "momentum"
    ) or "momentum"
    period = body.get("period", "1y")
    start_date = body.get("start_date")
    end_date = body.get("end_date")
    benchmark = body.get("benchmark", "SPY")
    initial_capital = body.get("initial_capital", 100000)
    shared_params = body.get("params") or {}
    strategy_params = body.get("strategy_params") or {}
    toggles = body.get("toggles") or {}

    strategy_map = {
        "momentum": MomentumStrategy,
        "mean_reversion": MeanReversionStrategy,
        "breakout": BreakoutStrategy,
    }

    def apply_parameters(strategy_obj: Any) -> None:
        per_strategy = strategy_params.get(strategy_obj.name)
        if isinstance(per_strategy, dict):
            strategy_obj.set_parameters(per_strategy)
        if isinstance(shared_params, dict):
            filtered = {k: v for k, v in shared_params.items() if hasattr(strategy_obj, k)}
            if filtered:
                strategy_obj.set_parameters(filtered)

    if strategy_name == "ensemble":
        enabled = {
            "momentum": toggles.get("momentum", True),
            "mean_reversion": toggles.get("mean_reversion", True),
            "breakout": toggles.get("breakout", True),
        }
        ensemble = EnsembleStrategy()
        for name, StrategyClass in strategy_map.items():
            if not enabled.get(name, False):
                continue
            strategy_obj = StrategyClass()
            apply_parameters(strategy_obj)
            ensemble.register_strategy(strategy_obj)
        if not ensemble.strategies:
            raise HTTPException(status_code=400, detail="Enable at least one strategy")
        strategy = ensemble
    else:
        StrategyClass = strategy_map.get(strategy_name)
        if not StrategyClass:
            raise HTTPException(status_code=400, detail=f"Unknown strategy: {strategy_name}")
        strategy = StrategyClass()
        apply_parameters(strategy)

    pipeline = FeaturePipeline()
    features_df = pipeline.build_features(
        ticker,
        period=period,
        start_date=start_date,
        end_date=end_date,
        include_sentiment=False,
    )
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

    # Benchmark buy-and-hold for comparison
    bench_equity = pd.Series(dtype=float)
    if benchmark:
        bench_df = pipeline.build_features(
            benchmark,
            period=period,
            start_date=start_date,
            end_date=end_date,
            include_sentiment=False,
        )
        if not bench_df.empty:
            # Align benchmark to strategy dates (reindex and ffill)
            bench_close = bench_df["close"].reindex(equity_curve.index).ffill().bfill()
            bench_equity = (bench_close / bench_close.iloc[0]) * initial_capital

    # Parse dates for DB storage
    bt_start = None
    bt_end = None
    if start_date:
        try:
            bt_start = dt.fromisoformat(start_date.replace("Z", "+00:00"))
        except ValueError:
            pass
    if end_date:
        try:
            bt_end = dt.fromisoformat(end_date.replace("Z", "+00:00"))
        except ValueError:
            pass

    # Store in DB
    bt_run = BacktestRun(
        strategy_name=strategy_name,
        ticker=ticker,
        start_date=bt_start,
        end_date=bt_end,
        initial_capital=initial_capital,
        final_capital=equity_curve.iloc[-1] if len(equity_curve) > 0 else initial_capital,
        sharpe=result.metrics.sharpe_ratio,
        sortino=result.metrics.sortino_ratio,
        max_drawdown=result.metrics.max_drawdown_pct,
        win_rate=result.metrics.win_rate,
        total_trades=result.metrics.total_trades,
        profit_factor=result.metrics.profit_factor,
        total_return_pct=result.metrics.total_return_pct,
        config_json={
            **result.config,
            "regime": body.get("regime"),
            "toggles": toggles,
            "params": shared_params,
            "strategy_params": strategy_params,
        },
    )
    db.add(bt_run)
    db.commit()
    db.refresh(bt_run)

    response = {
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
        "config": bt_run.config_json,
    }

    if not bench_equity.empty:
        response["benchmark_curve"] = {
            "dates": [str(d) for d in bench_equity.index],
            "values": bench_equity.values.tolist(),
            "ticker": benchmark,
        }
        # Add benchmark final return for quick comparison
        bench_return = (bench_equity.iloc[-1] - initial_capital) / initial_capital * 100
        response["benchmark_return_pct"] = round(bench_return, 2)

    return response


@router.post("/backtest/compare")
def compare_backtests(body: dict, db: Session = Depends(get_db)) -> dict:
    """Run multiple strategies on the same ticker/date range and return results for comparison."""
    from src.trading.backtesting.backtest_engine import BacktestEngine
    from src.trading.features.feature_pipeline import FeaturePipeline
    from src.trading.strategies.momentum_strategy import MomentumStrategy
    from src.trading.strategies.mean_reversion_strategy import MeanReversionStrategy
    from src.trading.strategies.breakout_strategy import BreakoutStrategy

    strategies_requested = body.get("strategies", ["momentum", "mean_reversion", "breakout"])
    ticker = body.get("ticker", "SPY")
    start_date = body.get("start_date")
    end_date = body.get("end_date")
    period = body.get("period", "1y")
    initial_capital = body.get("initial_capital", 100000)
    benchmark = body.get("benchmark", "SPY")

    pipeline = FeaturePipeline()
    features_df = pipeline.build_features(
        ticker,
        period=period,
        start_date=start_date,
        end_date=end_date,
        include_sentiment=False,
    )
    if features_df.empty:
        raise HTTPException(status_code=400, detail=f"No data available for {ticker}")

    strategy_map = {
        "momentum": MomentumStrategy,
        "mean_reversion": MeanReversionStrategy,
        "breakout": BreakoutStrategy,
    }

    results = []
    for strat_name in strategies_requested:
        StrategyClass = strategy_map.get(strat_name)
        if not StrategyClass:
            continue
        strategy = StrategyClass()
        if body.get("params"):
            strategy.set_parameters(body["params"])
        engine = BacktestEngine(initial_capital=initial_capital)
        result = engine.run(features_df.copy(), strategy, ticker)
        equity = result.equity_curve
        if not isinstance(equity, pd.Series):
            equity = pd.Series(equity)
        results.append({
            "strategy": strat_name,
            "metrics": asdict(result.metrics),
            "equity_curve": {
                "dates": [str(d) for d in equity.index],
                "values": equity.values.tolist(),
            },
            "trades": result.trades[:50],
        })

    # Benchmark curve
    bench_equity = pd.Series(dtype=float)
    if benchmark:
        bench_df = pipeline.build_features(
            benchmark,
            period=period,
            start_date=start_date,
            end_date=end_date,
            include_sentiment=False,
        )
        if not bench_df.empty and results:
            first_dates = pd.DatetimeIndex(results[0]["equity_curve"]["dates"])
            bench_close = bench_df["close"].reindex(first_dates).ffill().bfill()
            if not bench_close.empty and bench_close.iloc[0] > 0:
                bench_equity = (bench_close / bench_close.iloc[0]) * initial_capital

    out = {"ticker": ticker, "results": results}
    if not bench_equity.empty:
        out["benchmark_curve"] = {
            "dates": [str(d) for d in bench_equity.index],
            "values": bench_equity.values.tolist(),
            "ticker": benchmark,
        }
    return out


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


@router.get("/backtest/{backtest_id}/export")
def export_backtest(
    backtest_id: str,
    format: str = Query("csv", pattern="^(csv|json)$"),
    db: Session = Depends(get_db),
):
    """Export backtest results as CSV or JSON."""
    import csv
    import io

    from fastapi.responses import StreamingResponse

    bt = db.query(BacktestRun).filter(BacktestRun.id == backtest_id).first()
    if not bt:
        raise HTTPException(status_code=404, detail="Backtest not found")

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "strategy", "ticker", "sharpe", "total_return_pct", "max_drawdown",
            "win_rate", "total_trades", "profit_factor",
        ])
        writer.writerow([
            bt.strategy_name,
            bt.ticker or "",
            bt.sharpe,
            bt.total_return_pct,
            bt.max_drawdown,
            bt.win_rate,
            bt.total_trades,
            bt.profit_factor,
        ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=backtest_{backtest_id}.csv"},
        )

    return {
        "id": bt.id,
        "strategy_name": bt.strategy_name,
        "ticker": bt.ticker,
        "sharpe": bt.sharpe,
        "total_return_pct": bt.total_return_pct,
        "max_drawdown": bt.max_drawdown,
        "win_rate": bt.win_rate,
        "total_trades": bt.total_trades,
        "profit_factor": bt.profit_factor,
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
    latest = db.query(PortfolioState).order_by(PortfolioState.timestamp.desc()).first()
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
    normalized_strategy = _normalize_strategy_name(strategy)
    if normalized_strategy:
        query = query.filter(TradeExecution.strategy_name == normalized_strategy)
    executions = query.offset(offset).limit(limit).all()
    return [_trade_execution_to_dict(e) for e in executions]


# ── Models ───────────────────────────────────────────────────────────


@router.get("/models")
def list_models(db: Session = Depends(get_db)) -> list[dict]:
    """Return model checkpoints, deduplicated by model_name (latest version only)."""
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
    """Trigger training for a specific model type."""
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
    latest = db.query(MarketRegime).order_by(MarketRegime.timestamp.desc()).first()
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
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Return regime history for the last N days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    records = (
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
        for r in records
    ]


# ── Metrics / Risk ───────────────────────────────────────────────────


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
    """Compute and return a comprehensive risk summary."""
    latest_portfolio = db.query(PortfolioState).order_by(PortfolioState.timestamp.desc()).first()

    cash = latest_portfolio.cash if latest_portfolio else 100000.0
    total_value = latest_portfolio.total_value if latest_portfolio else 100000.0
    positions = (latest_portfolio.positions_json or []) if latest_portfolio else []
    max_drawdown = latest_portfolio.max_drawdown if latest_portfolio else 0.0
    daily_pnl = latest_portfolio.daily_pnl if latest_portfolio else 0.0
    cumulative_pnl = latest_portfolio.cumulative_pnl if latest_portfolio else 0.0

    concentration = []
    for pos in positions:
        ticker = pos.get("ticker", "UNKNOWN")
        qty = pos.get("quantity", 0)
        price = pos.get("current_price", pos.get("entry_price", 0))
        pos_value = qty * price
        weight = (pos_value / total_value * 100) if total_value > 0 else 0
        concentration.append(
            {
                "ticker": ticker,
                "direction": pos.get("direction", "BUY"),
                "value": pos_value,
                "weight_pct": round(weight, 2),
            }
        )
    concentration.sort(key=lambda x: x["weight_pct"], reverse=True)

    from src.trading.risk.risk_manager import SECTOR_MAP

    sector_exposure: dict[str, float] = {}
    for pos in positions:
        ticker = pos.get("ticker", "").upper()
        sector = SECTOR_MAP.get(ticker, "other")
        qty = pos.get("quantity", 0)
        price = pos.get("current_price", pos.get("entry_price", 0))
        sector_exposure[sector] = sector_exposure.get(sector, 0) + qty * price
    sector_pcts = {
        sector: round(val / total_value * 100, 2) if total_value > 0 else 0
        for sector, val in sector_exposure.items()
    }

    cash_pct = round(cash / total_value * 100, 2) if total_value > 0 else 100.0
    active_signals = db.query(TradeSignal).filter(TradeSignal.status == "active").count()
    pending_signals = db.query(TradeSignal).filter(TradeSignal.status == "pending").count()

    executions = db.query(TradeExecution).all()
    total_exec = len(executions)
    winning = sum(1 for e in executions if (e.pnl_dollars or 0) > 0)
    losing = sum(1 for e in executions if (e.pnl_dollars or 0) < 0)
    win_rate = winning / total_exec if total_exec > 0 else 0.0

    total_exposure_value = sum(
        pos.get("quantity", 0) * pos.get("current_price", pos.get("entry_price", 0))
        for pos in positions
    )
    exposure_pct = round(total_exposure_value / total_value * 100, 2) if total_value > 0 else 0.0

    risk_limits = {
        "max_positions": 5,
        "current_positions": len(positions),
        "max_drawdown_limit_pct": 10.0,
        "current_drawdown_pct": round(max_drawdown * 100, 2) if max_drawdown else 0.0,
        "daily_loss_limit_pct": 2.0,
        "current_daily_loss_pct": (
            round(abs(daily_pnl) / total_value * 100, 2)
            if total_value > 0 and daily_pnl < 0
            else 0.0
        ),
        "max_sector_positions": 3,
    }

    return {
        "total_value": total_value,
        "cash": cash,
        "cash_pct": cash_pct,
        "daily_pnl": daily_pnl,
        "cumulative_pnl": cumulative_pnl,
        "max_drawdown_pct": round(max_drawdown * 100, 2) if max_drawdown else 0.0,
        "exposure_pct": exposure_pct,
        "position_count": len(positions),
        "active_signals": active_signals,
        "pending_signals": pending_signals,
        "win_rate": round(win_rate * 100, 2),
        "total_trades": total_exec,
        "winning_trades": winning,
        "losing_trades": losing,
        "concentration": concentration,
        "sector_exposure": sector_pcts,
        "risk_limits": risk_limits,
    }


@router.get("/risk/limits")
def get_risk_limits() -> dict:
    """Return current risk limit configuration."""
    return {
        "max_positions": 5,
        "max_same_sector": 3,
        "max_drawdown_pct": 10.0,
        "min_reward_risk_ratio": 1.5,
        "daily_loss_limit_pct": 2.0,
        "no_entry_minutes_before_close": 15,
    }


# ── Charts ───────────────────────────────────────────────────────────


@router.get("/chart-data/{ticker}")
def get_chart_data(
    ticker: str,
    period: str = Query("6mo", pattern="^(1mo|3mo|6mo|1y|2y)$"),
    db: Session = Depends(get_db),
) -> dict:
    """Return OHLCV data and signal markers for charting."""
    import yfinance as yf

    hist = yf.Ticker(ticker.upper()).history(period=period)
    if hist.empty:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    ohlcv = [
        {
            "time": int(row.Index.timestamp()),
            "open": round(row.Open, 2),
            "high": round(row.High, 2),
            "low": round(row.Low, 2),
            "close": round(row.Close, 2),
            "volume": int(row.Volume),
        }
        for row in hist.itertuples()
    ]

    signals = (
        db.query(TradeSignal)
        .filter(TradeSignal.ticker == ticker.upper())
        .order_by(TradeSignal.created_at.desc())
        .limit(50)
        .all()
    )
    markers = [
        {
            "time": int(s.created_at.timestamp()) if s.created_at else None,
            "position": "aboveBar" if s.direction in ("SHORT", "SELL") else "belowBar",
            "color": "#00d68f" if s.direction == "BUY" else "#ff3d5a",
            "shape": "arrowUp" if s.direction == "BUY" else "arrowDown",
            "text": f"{s.strategy_name} {s.direction} ({int(s.confidence * 100)}%)",
            "id": s.id,
            "direction": s.direction,
            "confidence": s.confidence,
            "entry_price": s.entry_price,
            "target_price": s.target_price,
            "stop_loss": s.stop_loss,
        }
        for s in signals
        if s.created_at
    ]

    return {"ticker": ticker.upper(), "ohlcv": ohlcv, "markers": markers}


# ── Generate signals on demand ───────────────────────────────────────


@router.get("/demo-status")
def get_demo_status(db: Session = Depends(get_db)) -> dict:
    return {"demo_mode": _is_demo_enabled(db)}


@router.post("/demo-toggle")
def toggle_demo_mode(body: dict | None = None, db: Session = Depends(get_db)) -> dict:
    current = _is_demo_enabled(db)
    next_value = body.get("demo_mode") if isinstance(body, dict) and "demo_mode" in body else (not current)
    _set_setting_value(db, "demo_mode", bool(next_value))
    db.commit()
    return {"demo_mode": bool(next_value)}


@router.post("/generate-signals")
@router.post("/generate")
@router.post("/signals/generate")
def generate_signals_endpoint(
    body: dict,
    demo: bool = Query(False),
    db: Session = Depends(get_db),
) -> dict:
    """Generate trading signals for given tickers."""
    from src.trading.signals.trade_signal_engine import TradeSignalEngine
    from src.trading.strategies.breakout_strategy import BreakoutStrategy
    from src.trading.strategies.mean_reversion_strategy import MeanReversionStrategy
    from src.trading.strategies.momentum_strategy import MomentumStrategy

    tickers = body.get("tickers")
    if not tickers and body.get("ticker"):
        tickers = [body["ticker"]]
    tickers = [str(t).upper() for t in (tickers or ["SPY"])]
    period = body.get("period", "1y")
    effective_demo = bool(demo or _is_demo_enabled(db))

    engine = TradeSignalEngine()
    engine.register_strategy(MomentumStrategy())
    engine.register_strategy(MeanReversionStrategy())
    engine.register_strategy(BreakoutStrategy())

    signals = engine.generate_signals(tickers, period=period)
    min_confidence = float(_setting_value(db, "min_signal_confidence", 0.5) or 0.5)
    signals = [signal for signal in signals if (signal.confidence or 0) >= min_confidence]
    signal_ids = engine.store_signals(signals)

    return {
        "generated": len(signals),
        "signal_ids": signal_ids,
        "demo_mode": effective_demo,
        "signals": [
            {
                "ticker": s.ticker,
                "direction": s.direction,
                "strategy": s.strategy_name,
                "strategy_name": s.strategy_name,
                "confidence": s.confidence,
                "entry_price": s.entry_price,
                "target_price": s.target_price,
                "stop_loss": s.stop_loss,
            }
            for s in signals
        ],
    }


# ── Watchlists ───────────────────────────────────────────────────────


@router.get("/watchlists")
def list_watchlists(db: Session = Depends(get_db)) -> list[dict]:
    wls = db.query(Watchlist).order_by(Watchlist.updated_at.desc()).all()
    return [
        {
            "id": w.id,
            "name": w.name,
            "tickers": w.tickers_json or [],
            "created_at": w.created_at.isoformat() if w.created_at else None,
        }
        for w in wls
    ]


@router.post("/watchlists")
def create_watchlist(body: dict, db: Session = Depends(get_db)) -> dict:
    name = body.get("name", "Untitled")
    tickers = [str(t).upper() for t in body.get("tickers", [])]
    wl = Watchlist(name=name, tickers_json=tickers)
    db.add(wl)
    db.commit()
    db.refresh(wl)
    return {"id": wl.id, "name": wl.name}


@router.put("/watchlists/{watchlist_id}")
def update_watchlist(watchlist_id: str, body: dict, db: Session = Depends(get_db)) -> dict:
    wl = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    if "name" in body:
        wl.name = body["name"]
    if "tickers" in body:
        wl.tickers_json = [str(t).upper() for t in body["tickers"]]
    db.commit()
    db.refresh(wl)
    return {"id": wl.id, "name": wl.name, "tickers": wl.tickers_json}


@router.delete("/watchlists/{watchlist_id}")
def delete_watchlist(watchlist_id: str, db: Session = Depends(get_db)) -> dict:
    wl = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    db.delete(wl)
    db.commit()
    return {"deleted": watchlist_id}


@router.post("/watchlists/{watchlist_id}/scan")
def scan_watchlist(watchlist_id: str, db: Session = Depends(get_db)) -> dict:
    """Generate signals for all tickers in a watchlist."""
    from src.trading.signals.trade_signal_engine import TradeSignalEngine
    from src.trading.strategies.breakout_strategy import BreakoutStrategy
    from src.trading.strategies.mean_reversion_strategy import MeanReversionStrategy
    from src.trading.strategies.momentum_strategy import MomentumStrategy

    wl = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    tickers = wl.tickers_json or []
    if not tickers:
        return {"generated": 0, "signal_ids": [], "signals": []}

    engine = TradeSignalEngine()
    engine.register_strategy(MomentumStrategy())
    engine.register_strategy(MeanReversionStrategy())
    engine.register_strategy(BreakoutStrategy())
    signals = engine.generate_signals(tickers)
    min_confidence = float(_setting_value(db, "min_signal_confidence", 0.5) or 0.5)
    signals = [signal for signal in signals if (signal.confidence or 0) >= min_confidence]
    signal_ids = engine.store_signals(signals)
    return {"generated": len(signals), "signal_ids": signal_ids}


# ── Journal ──────────────────────────────────────────────────────────


@router.get("/journal")
def list_journal_entries(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[dict]:
    entries = (
        db.query(TradeJournal)
        .order_by(TradeJournal.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_trade_journal_to_dict(e) for e in entries]


@router.post("/journal")
def create_journal_entry(body: dict, db: Session = Depends(get_db)) -> dict:
    entry = TradeJournal(
        execution_id=body.get("execution_id"),
        ticker=body.get("ticker", ""),
        direction=body.get("direction"),
        entry_price=body.get("entry_price"),
        exit_price=body.get("exit_price"),
        pnl_dollars=body.get("pnl_dollars"),
        setup_notes=body.get("setup_notes"),
        review_notes=body.get("review_notes"),
        tags_json=body.get("tags", []),
        rating=body.get("rating"),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"id": entry.id, "status": "created"}


@router.patch("/journal/{entry_id}")
def update_journal_entry(entry_id: str, body: dict, db: Session = Depends(get_db)) -> dict:
    entry = db.query(TradeJournal).filter(TradeJournal.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")

    field_map = {
        "execution_id": "execution_id",
        "ticker": "ticker",
        "direction": "direction",
        "entry_price": "entry_price",
        "exit_price": "exit_price",
        "pnl_dollars": "pnl_dollars",
        "setup_notes": "setup_notes",
        "review_notes": "review_notes",
        "tags": "tags_json",
        "rating": "rating",
    }
    for body_key, attr_name in field_map.items():
        if body_key in body:
            setattr(entry, attr_name, body[body_key])

    db.commit()
    db.refresh(entry)
    return {"id": entry.id, "status": "updated"}


@router.delete("/journal/{entry_id}")
def delete_journal_entry(entry_id: str, db: Session = Depends(get_db)) -> dict:
    entry = db.query(TradeJournal).filter(TradeJournal.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    db.delete(entry)
    db.commit()
    return {"deleted": entry_id}


@router.get("/journal/stats")
def get_journal_stats(db: Session = Depends(get_db)) -> dict:
    entries = db.query(TradeJournal).all()
    total = len(entries)
    if total == 0:
        return {"total_entries": 0, "avg_rating": 0, "total_pnl": 0, "tag_counts": {}}
    rated_entries = [e.rating for e in entries if e.rating]
    avg_rating = sum(rated_entries) / len(rated_entries) if rated_entries else 0
    total_pnl = sum(e.pnl_dollars or 0 for e in entries)
    tag_counts: dict[str, int] = {}
    for e in entries:
        for tag in (e.tags_json or []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    return {
        "total_entries": total,
        "avg_rating": round(avg_rating, 1),
        "total_pnl": round(total_pnl, 2),
        "tag_counts": tag_counts,
    }


# ── Settings / Notifications ────────────────────────────────────────


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)) -> dict:
    rows = db.query(UserSettings).all()
    settings = {row.key: row.value_json for row in rows}
    defaults = {
        "notifications_enabled": True,
        "notify_on_signal": True,
        "notify_on_backtest_complete": True,
        "notify_on_drawdown_breach": True,
        "min_signal_confidence": 0.5,
        "drawdown_alert_threshold": 5.0,
        "email": None,
        "watched_tickers_only": False,
    }
    return {**defaults, **settings}


@router.put("/settings")
def update_settings(body: dict, db: Session = Depends(get_db)) -> dict:
    for key, value in body.items():
        _set_setting_value(db, key, value)
    db.commit()
    return {"status": "updated", "keys": list(body.keys())}


# ── Performance ──────────────────────────────────────────────────────


@router.get("/performance")
def get_performance_attribution(db: Session = Depends(get_db)) -> dict:
    """Break down P&L and win rate by strategy, direction, and exit reason."""
    executions = db.query(TradeExecution).all()
    if not executions:
        return {
            "by_strategy": {},
            "by_direction": {},
            "by_exit_reason": {},
            "rolling_accuracy": [],
            "total_executions": 0,
        }

    by_strategy: dict[str, dict] = {}
    for e in executions:
        key = e.strategy_name or "unknown"
        if key not in by_strategy:
            by_strategy[key] = {
                "total": 0,
                "wins": 0,
                "losses": 0,
                "total_pnl": 0.0,
                "trades": [],
            }
        by_strategy[key]["total"] += 1
        pnl = e.pnl_dollars or 0
        by_strategy[key]["total_pnl"] += pnl
        if pnl > 0:
            by_strategy[key]["wins"] += 1
        elif pnl < 0:
            by_strategy[key]["losses"] += 1
        by_strategy[key]["trades"].append(pnl)

    for key, data in by_strategy.items():
        data["win_rate"] = round(data["wins"] / data["total"] * 100, 1) if data["total"] > 0 else 0
        data["avg_pnl"] = round(data["total_pnl"] / data["total"], 2) if data["total"] > 0 else 0
        del data["trades"]

    by_direction: dict[str, dict] = {}
    for e in executions:
        key = e.direction or "unknown"
        if key not in by_direction:
            by_direction[key] = {"total": 0, "wins": 0, "total_pnl": 0.0}
        by_direction[key]["total"] += 1
        pnl = e.pnl_dollars or 0
        by_direction[key]["total_pnl"] += pnl
        if pnl > 0:
            by_direction[key]["wins"] += 1
    for key, data in by_direction.items():
        data["win_rate"] = round(data["wins"] / data["total"] * 100, 1) if data["total"] > 0 else 0

    by_exit: dict[str, dict] = {}
    for e in executions:
        key = e.exit_reason or "unknown"
        if key not in by_exit:
            by_exit[key] = {"total": 0, "total_pnl": 0.0}
        by_exit[key]["total"] += 1
        by_exit[key]["total_pnl"] += e.pnl_dollars or 0

    sorted_exec = sorted(
        executions,
        key=lambda e: e.exit_time or datetime.min.replace(tzinfo=timezone.utc),
    )
    rolling: list[dict] = []
    window = 20
    for i in range(window, len(sorted_exec) + 1):
        batch = sorted_exec[i - window : i]
        wins = sum(1 for e in batch if (e.pnl_dollars or 0) > 0)
        rolling.append(
            {
                "trade_index": i,
                "accuracy": round(wins / window * 100, 1),
                "timestamp": batch[-1].exit_time.isoformat() if batch[-1].exit_time else None,
            }
        )

    return {
        "by_strategy": by_strategy,
        "by_direction": by_direction,
        "by_exit_reason": by_exit,
        "rolling_accuracy": rolling,
        "total_executions": len(executions),
    }


# ── Helpers ──────────────────────────────────────────────────────────


# ── Strategy Defaults & Configs ───────────────────────────────────


@router.get("/strategies/defaults")
def get_strategy_defaults() -> dict:
    """Return default parameters for each strategy."""
    from src.trading.strategies.momentum_strategy import MomentumStrategy
    from src.trading.strategies.mean_reversion_strategy import MeanReversionStrategy
    from src.trading.strategies.breakout_strategy import BreakoutStrategy

    return {
        "momentum": MomentumStrategy().get_parameters(),
        "mean_reversion": MeanReversionStrategy().get_parameters(),
        "breakout": BreakoutStrategy().get_parameters(),
    }


@router.get("/strategies/configs")
def list_strategy_configs(db: Session = Depends(get_db)) -> list[dict]:
    configs = db.query(StrategyConfig).order_by(StrategyConfig.updated_at.desc()).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "strategy_name": c.strategy_name,
            "regime": c.regime,
            "params": c.params_json,
            "toggles": c.toggles_json,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in configs
    ]


@router.post("/strategies/configs")
def save_strategy_config(body: dict, db: Session = Depends(get_db)) -> dict:
    name = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Config name is required")
    existing = db.query(StrategyConfig).filter(StrategyConfig.name == name).first()
    if existing:
        existing.strategy_name = body.get("strategy_name", existing.strategy_name)
        existing.regime = body.get("regime", existing.regime)
        existing.params_json = body.get("params", existing.params_json)
        existing.toggles_json = body.get("toggles", existing.toggles_json)
        db.commit()
        return {"id": existing.id, "name": existing.name, "status": "updated"}
    config = StrategyConfig(
        name=name,
        strategy_name=body.get("strategy_name", "ensemble"),
        regime=body.get("regime"),
        params_json=body.get("params"),
        toggles_json=body.get("toggles"),
    )
    db.add(config)
    db.commit()
    return {"id": config.id, "name": config.name, "status": "created"}


@router.delete("/strategies/configs/{config_id}")
def delete_strategy_config(config_id: str, db: Session = Depends(get_db)) -> dict:
    config = db.query(StrategyConfig).filter(StrategyConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    db.delete(config)
    db.commit()
    return {"deleted": config_id}


# ── Chart Data ───────────────────────────────────────────────────


@router.get("/chart-data/{ticker}")
def get_chart_data(
    ticker: str,
    period: str = Query("6mo", pattern="^(1mo|3mo|6mo|1y|2y)$"),
    db: Session = Depends(get_db),
) -> dict:
    """Return OHLCV data and signal markers for charting."""
    import yfinance as yf

    hist = yf.Ticker(ticker.upper()).history(period=period)
    if hist.empty:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    ohlcv = [
        {
            "time": int(row.Index.timestamp()),
            "open": round(row.Open, 2),
            "high": round(row.High, 2),
            "low": round(row.Low, 2),
            "close": round(row.Close, 2),
            "volume": int(row.Volume),
        }
        for row in hist.itertuples()
    ]

    signals = (
        db.query(TradeSignal)
        .filter(TradeSignal.ticker == ticker.upper())
        .order_by(TradeSignal.created_at.desc())
        .limit(50)
        .all()
    )
    markers = [
        {
            "time": int(s.created_at.timestamp()) if s.created_at else None,
            "position": "aboveBar" if s.direction in ("SHORT", "SELL") else "belowBar",
            "color": "#00d68f" if s.direction == "BUY" else "#ff3d5a",
            "shape": "arrowUp" if s.direction == "BUY" else "arrowDown",
            "text": f"{s.strategy_name} {s.direction} ({int(s.confidence * 100)}%)",
            "id": s.id,
            "direction": s.direction,
            "confidence": s.confidence,
            "entry_price": s.entry_price,
            "target_price": s.target_price,
            "stop_loss": s.stop_loss,
        }
        for s in signals
        if s.created_at
    ]

    return {"ticker": ticker.upper(), "ohlcv": ohlcv, "markers": markers}


# ── Watchlists ───────────────────────────────────────────────────


@router.get("/watchlists")
def list_watchlists(db: Session = Depends(get_db)) -> list[dict]:
    wls = db.query(Watchlist).order_by(Watchlist.updated_at.desc()).all()
    return [
        {"id": w.id, "name": w.name, "tickers": w.tickers_json, "created_at": w.created_at.isoformat() if w.created_at else None}
        for w in wls
    ]


@router.post("/watchlists")
def create_watchlist(body: dict, db: Session = Depends(get_db)) -> dict:
    name = body.get("name", "Untitled")
    tickers = body.get("tickers", [])
    wl = Watchlist(name=name, tickers_json=tickers)
    db.add(wl)
    db.commit()
    return {"id": wl.id, "name": wl.name}


@router.put("/watchlists/{watchlist_id}")
def update_watchlist(watchlist_id: str, body: dict, db: Session = Depends(get_db)) -> dict:
    wl = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    if "name" in body:
        wl.name = body["name"]
    if "tickers" in body:
        wl.tickers_json = body["tickers"]
    db.commit()
    return {"id": wl.id, "name": wl.name, "tickers": wl.tickers_json}


@router.delete("/watchlists/{watchlist_id}")
def delete_watchlist(watchlist_id: str, db: Session = Depends(get_db)) -> dict:
    wl = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    db.delete(wl)
    db.commit()
    return {"deleted": watchlist_id}


@router.post("/watchlists/{watchlist_id}/scan")
def scan_watchlist(watchlist_id: str, db: Session = Depends(get_db)) -> dict:
    """Generate signals for all tickers in a watchlist."""
    wl = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    tickers = wl.tickers_json or []
    if not tickers:
        return {"generated": 0, "signals": []}
    from src.trading.signals.trade_signal_engine import TradeSignalEngine
    from src.trading.strategies.momentum_strategy import MomentumStrategy
    from src.trading.strategies.mean_reversion_strategy import MeanReversionStrategy
    from src.trading.strategies.breakout_strategy import BreakoutStrategy

    engine = TradeSignalEngine()
    engine.register_strategy(MomentumStrategy())
    engine.register_strategy(MeanReversionStrategy())
    engine.register_strategy(BreakoutStrategy())
    signals = engine.generate_signals(tickers)
    signal_ids = engine.store_signals(signals)
    return {"generated": len(signals), "signal_ids": signal_ids}


# ── Trade Journal ────────────────────────────────────────────────


@router.get("/journal")
def list_journal_entries(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[dict]:
    entries = db.query(TradeJournal).order_by(TradeJournal.created_at.desc()).offset(offset).limit(limit).all()
    return [
        {
            "id": e.id, "execution_id": e.execution_id, "ticker": e.ticker,
            "direction": e.direction, "entry_price": e.entry_price, "exit_price": e.exit_price,
            "pnl_dollars": e.pnl_dollars, "setup_notes": e.setup_notes, "review_notes": e.review_notes,
            "tags": e.tags_json or [], "rating": e.rating,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]


@router.post("/journal")
def create_journal_entry(body: dict, db: Session = Depends(get_db)) -> dict:
    entry = TradeJournal(
        execution_id=body.get("execution_id"),
        ticker=body.get("ticker", ""),
        direction=body.get("direction"),
        entry_price=body.get("entry_price"),
        exit_price=body.get("exit_price"),
        pnl_dollars=body.get("pnl_dollars"),
        setup_notes=body.get("setup_notes"),
        review_notes=body.get("review_notes"),
        tags_json=body.get("tags", []),
        rating=body.get("rating"),
    )
    db.add(entry)
    db.commit()
    return {"id": entry.id, "status": "created"}


@router.patch("/journal/{entry_id}")
def update_journal_entry(entry_id: str, body: dict, db: Session = Depends(get_db)) -> dict:
    entry = db.query(TradeJournal).filter(TradeJournal.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    for field in ("setup_notes", "review_notes", "rating"):
        if field in body:
            setattr(entry, field, body[field])
    if "tags" in body:
        entry.tags_json = body["tags"]
    db.commit()
    return {"id": entry.id, "status": "updated"}


@router.delete("/journal/{entry_id}")
def delete_journal_entry(entry_id: str, db: Session = Depends(get_db)) -> dict:
    entry = db.query(TradeJournal).filter(TradeJournal.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    db.delete(entry)
    db.commit()
    return {"deleted": entry_id}


@router.get("/journal/stats")
def get_journal_stats(db: Session = Depends(get_db)) -> dict:
    entries = db.query(TradeJournal).all()
    total = len(entries)
    if total == 0:
        return {"total_entries": 0, "avg_rating": 0, "total_pnl": 0, "tag_counts": {}}
    rated = [e for e in entries if e.rating]
    avg_rating = sum(e.rating for e in rated) / max(1, len(rated))
    total_pnl = sum(e.pnl_dollars or 0 for e in entries)
    tag_counts: dict[str, int] = {}
    for e in entries:
        for tag in (e.tags_json or []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    return {"total_entries": total, "avg_rating": round(avg_rating, 1), "total_pnl": round(total_pnl, 2), "tag_counts": tag_counts}


# ── User Settings ────────────────────────────────────────────────


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)) -> dict:
    rows = db.query(UserSettings).all()
    settings = {row.key: row.value_json for row in rows}
    defaults = {
        "notifications_enabled": True,
        "notify_on_signal": True,
        "notify_on_backtest_complete": True,
        "notify_on_drawdown_breach": True,
        "min_signal_confidence": 0.5,
        "drawdown_alert_threshold": 5.0,
        "email": None,
        "watched_tickers_only": False,
    }
    return {**defaults, **settings}


@router.put("/settings")
def update_settings(body: dict, db: Session = Depends(get_db)) -> dict:
    for key, value in body.items():
        existing = db.query(UserSettings).filter(UserSettings.key == key).first()
        if existing:
            existing.value_json = value
        else:
            db.add(UserSettings(key=key, value_json=value))
    db.commit()
    return {"status": "updated", "keys": list(body.keys())}


# ── Demo Mode ────────────────────────────────────────────────────


_demo_mode = False


@router.get("/demo-status")
def get_demo_status() -> dict:
    return {"demo_mode": _demo_mode}


@router.post("/demo-toggle")
def toggle_demo_mode() -> dict:
    global _demo_mode
    _demo_mode = not _demo_mode
    return {"demo_mode": _demo_mode}


# ── Performance Attribution ──────────────────────────────────────


@router.get("/performance")
def get_performance_attribution(db: Session = Depends(get_db)) -> dict:
    """Break down P&L and win rate by strategy, direction, and exit reason."""
    executions = db.query(TradeExecution).all()
    if not executions:
        return {"by_strategy": {}, "by_direction": {}, "by_exit_reason": {}, "rolling_accuracy": [], "total_executions": 0}

    by_strategy: dict[str, dict] = {}
    for e in executions:
        key = e.strategy_name or "unknown"
        if key not in by_strategy:
            by_strategy[key] = {"total": 0, "wins": 0, "losses": 0, "total_pnl": 0.0}
        by_strategy[key]["total"] += 1
        pnl = e.pnl_dollars or 0
        by_strategy[key]["total_pnl"] += pnl
        if pnl > 0:
            by_strategy[key]["wins"] += 1
        elif pnl < 0:
            by_strategy[key]["losses"] += 1

    for data in by_strategy.values():
        data["win_rate"] = round(data["wins"] / data["total"] * 100, 1) if data["total"] > 0 else 0
        data["avg_pnl"] = round(data["total_pnl"] / data["total"], 2) if data["total"] > 0 else 0

    by_direction: dict[str, dict] = {}
    for e in executions:
        key = e.direction or "unknown"
        if key not in by_direction:
            by_direction[key] = {"total": 0, "wins": 0, "total_pnl": 0.0}
        by_direction[key]["total"] += 1
        pnl = e.pnl_dollars or 0
        by_direction[key]["total_pnl"] += pnl
        if pnl > 0:
            by_direction[key]["wins"] += 1
    for data in by_direction.values():
        data["win_rate"] = round(data["wins"] / data["total"] * 100, 1) if data["total"] > 0 else 0

    by_exit: dict[str, dict] = {}
    for e in executions:
        key = e.exit_reason or "unknown"
        if key not in by_exit:
            by_exit[key] = {"total": 0, "total_pnl": 0.0}
        by_exit[key]["total"] += 1
        by_exit[key]["total_pnl"] += e.pnl_dollars or 0

    sorted_exec = sorted(executions, key=lambda e: e.exit_time or datetime.min.replace(tzinfo=timezone.utc))
    rolling: list[dict] = []
    window = 20
    for i in range(window, len(sorted_exec) + 1):
        batch = sorted_exec[i - window:i]
        wins = sum(1 for e in batch if (e.pnl_dollars or 0) > 0)
        rolling.append({
            "trade_index": i,
            "accuracy": round(wins / window * 100, 1),
            "timestamp": batch[-1].exit_time.isoformat() if batch[-1].exit_time else None,
        })

    return {
        "by_strategy": by_strategy,
        "by_direction": by_direction,
        "by_exit_reason": by_exit,
        "rolling_accuracy": rolling,
        "total_executions": len(executions),
    }


# ── Portfolio Backtest ───────────────────────────────────────────


@router.post("/backtest/portfolio")
def run_portfolio_backtest(body: dict) -> dict:
    """Run a backtest across multiple tickers with portfolio-level constraints."""
    from dataclasses import asdict

    from src.trading.backtesting.portfolio_backtest import PortfolioBacktestEngine
    from src.trading.strategies.breakout_strategy import BreakoutStrategy
    from src.trading.strategies.mean_reversion_strategy import MeanReversionStrategy
    from src.trading.strategies.momentum_strategy import MomentumStrategy

    tickers = body.get("tickers", [])
    if not tickers:
        raise HTTPException(status_code=400, detail="No tickers provided")

    strategy_name = body.get("strategy", "momentum")
    period = body.get("period", "1y")
    start_date = body.get("start_date")
    end_date = body.get("end_date")
    initial_capital = body.get("initial_capital", 100_000)
    max_positions = body.get("max_positions", 10)

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

    engine = PortfolioBacktestEngine(
        initial_capital=initial_capital,
        max_positions=max_positions,
    )
    result = engine.run(
        tickers=tickers,
        strategy=strategy,
        start_date=start_date,
        end_date=end_date,
        period=period,
    )

    equity = result.equity_curve
    return {
        "metrics": asdict(result.metrics),
        "equity_curve": {
            "dates": [str(d) for d in equity.index],
            "values": equity.values.tolist(),
        },
        "per_ticker_metrics": {
            t: asdict(m) for t, m in result.per_ticker_metrics.items()
        },
        "per_ticker_equity": {
            t: {
                "dates": [str(d) for d in eq.index],
                "values": eq.values.tolist(),
            }
            for t, eq in result.per_ticker_equity.items()
        },
        "correlation_matrix": (
            result.correlation_matrix.to_dict() if not result.correlation_matrix.empty else {}
        ),
        "trades": result.trades[:200],
    }


# ── DSL Strategy Backtest ───────────────────────────────────────


@router.post("/backtest/dsl")
def run_dsl_backtest(body: dict) -> dict:
    """Run a backtest using custom DSL rules."""
    from dataclasses import asdict

    from src.trading.backtesting.backtest_engine import BacktestEngine
    from src.trading.features.feature_pipeline import FeaturePipeline
    from src.trading.strategies.dsl_parser import DSLStrategy

    rules_text = body.get("rules", "")
    if not rules_text:
        raise HTTPException(status_code=400, detail="No DSL rules provided")

    ticker = body.get("ticker", "SPY")
    period = body.get("period", "1y")
    start_date = body.get("start_date")
    end_date = body.get("end_date")
    initial_capital = body.get("initial_capital", 100_000)

    try:
        strategy = DSLStrategy.from_rules(rules_text)
    except (SyntaxError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"DSL parse error: {e}")

    pipeline = FeaturePipeline()
    features_df = pipeline.build_features(
        ticker,
        period=period,
        start_date=start_date,
        end_date=end_date,
        include_sentiment=False,
    )
    if features_df.empty:
        raise HTTPException(status_code=400, detail=f"No data for {ticker}")

    missing = strategy.validate_columns(list(features_df.columns))
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown columns in DSL: {', '.join(missing)}",
        )

    bt_engine = BacktestEngine(initial_capital=initial_capital)
    result = bt_engine.run(features_df, strategy, ticker)

    equity = result.equity_curve
    if not isinstance(equity, pd.Series):
        equity = pd.Series(equity)

    return {
        "metrics": asdict(result.metrics),
        "equity_curve": {
            "dates": [str(d) for d in equity.index],
            "values": equity.values.tolist(),
        },
        "trades": result.trades[:100],
        "config": result.config,
    }


# ── Trade Replay ────────────────────────────────────────────────


@router.post("/backtest/replay")
def trade_replay(body: dict) -> dict:
    """Return bar-by-bar replay data for a strategy on a ticker."""
    from src.trading.features.feature_pipeline import FeaturePipeline
    from src.trading.strategies.breakout_strategy import BreakoutStrategy
    from src.trading.strategies.mean_reversion_strategy import MeanReversionStrategy
    from src.trading.strategies.momentum_strategy import MomentumStrategy

    ticker = body.get("ticker", "SPY")
    strategy_name = body.get("strategy", "momentum")
    period = body.get("period", "6mo")
    start_date = body.get("start_date")
    end_date = body.get("end_date")

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
    features_df = pipeline.build_features(
        ticker,
        period=period,
        start_date=start_date,
        end_date=end_date,
        include_sentiment=False,
    )
    if features_df.empty:
        raise HTTPException(status_code=400, detail=f"No data for {ticker}")

    signals_df = strategy.generate_signals(features_df)

    bars: list[dict] = []
    for i, (idx, row) in enumerate(features_df.iterrows()):
        bar: dict = {
            "index": i,
            "date": str(idx),
            "open": float(row.get("open", 0)),
            "high": float(row.get("high", 0)),
            "low": float(row.get("low", 0)),
            "close": float(row.get("close", 0)),
            "volume": float(row.get("volume", 0)),
        }
        if idx in signals_df.index:
            sig_row = signals_df.loc[idx]
            bar["signal"] = int(sig_row.get("signal", 0))
        else:
            bar["signal"] = 0

        for col in ("rsi_14", "sma_20", "sma_50", "sma_200", "macd", "bb_upper", "bb_lower"):
            if col in row.index:
                val = row[col]
                bar[col] = float(val) if pd.notna(val) else None
        bars.append(bar)

    return {
        "ticker": ticker,
        "strategy": strategy_name,
        "total_bars": len(bars),
        "bars": bars,
    }


# ── Options Greeks ──────────────────────────────────────────────


@router.post("/options/greeks")
def compute_greeks(body: dict) -> dict:
    """Compute Black-Scholes Greeks for given parameters."""
    from src.signals.options_pricer import price_option

    S = body.get("spot_price")
    K = body.get("strike_price")
    T = body.get("time_to_expiry")
    r = body.get("risk_free_rate", 0.05)
    sigma = body.get("volatility")
    option_type = body.get("option_type", "call")

    if not all([S, K, T, sigma]):
        raise HTTPException(
            status_code=400,
            detail="Required: spot_price, strike_price, time_to_expiry, volatility",
        )

    result = price_option(
        S=float(S), K=float(K), T=float(T),
        r=float(r), sigma=float(sigma),
        option_type=option_type,
    )
    return result


# ── Helpers ──────────────────────────────────────────────────────


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


def _trade_execution_to_dict(execution: TradeExecution) -> dict:
    return {
        "id": execution.id,
        "signal_id": execution.signal_id,
        "ticker": execution.ticker,
        "direction": execution.direction,
        "entry_time": execution.entry_time.isoformat() if execution.entry_time else None,
        "exit_time": execution.exit_time.isoformat() if execution.exit_time else None,
        "entry_price": execution.entry_price,
        "exit_price": execution.exit_price,
        "quantity": execution.quantity,
        "pnl_dollars": execution.pnl_dollars,
        "pnl_percent": execution.pnl_percent,
        "fees": execution.fees,
        "slippage": execution.slippage,
        "exit_reason": execution.exit_reason,
        "strategy_name": execution.strategy_name,
    }


def _trade_journal_to_dict(entry: TradeJournal) -> dict:
    return {
        "id": entry.id,
        "execution_id": entry.execution_id,
        "ticker": entry.ticker,
        "direction": entry.direction,
        "entry_price": entry.entry_price,
        "exit_price": entry.exit_price,
        "pnl_dollars": entry.pnl_dollars,
        "setup_notes": entry.setup_notes,
        "review_notes": entry.review_notes,
        "tags": entry.tags_json or [],
        "rating": entry.rating,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
    }

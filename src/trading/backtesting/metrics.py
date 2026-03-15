"""Performance metrics for backtesting: Sharpe, Sortino, MDD, win rate, etc."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class BacktestMetrics:
    """Complete set of backtest performance metrics."""
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    max_drawdown_pct: float
    max_drawdown_duration_days: int
    win_rate: float
    profit_factor: float
    expectancy: float
    avg_trade_pnl: float
    best_trade_pnl: float
    worst_trade_pnl: float
    total_trades: int
    total_return_pct: float
    cagr: float
    alpha_vs_spy: float
    beta: float
    avg_holding_period_days: float
    total_pnl: float


def compute_metrics(
    equity_curve: pd.Series,
    trades: list[dict],
    benchmark_returns: pd.Series | None = None,
    risk_free_rate: float = 0.05,
    trading_days_per_year: int = 252,
) -> BacktestMetrics:
    """Compute comprehensive backtest metrics from equity curve and trade list."""
    returns = equity_curve.pct_change().dropna()

    sharpe = _sharpe_ratio(returns, risk_free_rate, trading_days_per_year)
    sortino = _sortino_ratio(returns, risk_free_rate, trading_days_per_year)
    mdd_pct, mdd_duration = _max_drawdown(equity_curve)
    calmar = _calmar_ratio(returns, mdd_pct, trading_days_per_year)

    trade_pnls = [t.get("pnl_pct", 0) for t in trades]
    winning = [p for p in trade_pnls if p > 0]
    losing = [p for p in trade_pnls if p < 0]

    win_rate = len(winning) / len(trade_pnls) if trade_pnls else 0.0
    profit_factor = (
        sum(winning) / abs(sum(losing)) if losing else float("inf")
    ) if winning else 0.0

    avg_win = np.mean(winning) if winning else 0.0
    avg_loss = abs(np.mean(losing)) if losing else 0.0
    expectancy = (win_rate * avg_win) - ((1 - win_rate) * avg_loss)

    holding_periods = [t.get("holding_days", 0) for t in trades]

    total_return = (equity_curve.iloc[-1] / equity_curve.iloc[0] - 1) * 100 if len(equity_curve) > 1 else 0
    n_years = len(equity_curve) / trading_days_per_year
    cagr = ((equity_curve.iloc[-1] / equity_curve.iloc[0]) ** (1 / max(n_years, 0.01)) - 1) * 100 if len(equity_curve) > 1 else 0

    alpha, beta = 0.0, 0.0
    if benchmark_returns is not None and len(benchmark_returns) > 1 and len(returns) > 1:
        aligned = pd.concat([returns, benchmark_returns], axis=1).dropna()
        if len(aligned) > 1:
            cov = np.cov(aligned.iloc[:, 0], aligned.iloc[:, 1])
            beta = cov[0][1] / cov[1][1] if cov[1][1] != 0 else 0
            alpha = (returns.mean() - beta * benchmark_returns.mean()) * trading_days_per_year * 100

    return BacktestMetrics(
        sharpe_ratio=sharpe,
        sortino_ratio=sortino,
        calmar_ratio=calmar,
        max_drawdown_pct=mdd_pct,
        max_drawdown_duration_days=mdd_duration,
        win_rate=win_rate,
        profit_factor=profit_factor,
        expectancy=expectancy,
        avg_trade_pnl=float(np.mean(trade_pnls)) if trade_pnls else 0.0,
        best_trade_pnl=max(trade_pnls) if trade_pnls else 0.0,
        worst_trade_pnl=min(trade_pnls) if trade_pnls else 0.0,
        total_trades=len(trades),
        total_return_pct=total_return,
        cagr=cagr,
        alpha_vs_spy=alpha,
        beta=beta,
        avg_holding_period_days=float(np.mean(holding_periods)) if holding_periods else 0.0,
        total_pnl=sum(t.get("pnl_dollars", 0) for t in trades),
    )


def _sharpe_ratio(
    returns: pd.Series, risk_free_rate: float, trading_days: int,
) -> float:
    if len(returns) < 2 or returns.std() == 0:
        return 0.0
    excess = returns - risk_free_rate / trading_days
    return float(np.sqrt(trading_days) * excess.mean() / excess.std())


def _sortino_ratio(
    returns: pd.Series, risk_free_rate: float, trading_days: int,
) -> float:
    if len(returns) < 2:
        return 0.0
    excess = returns - risk_free_rate / trading_days
    downside = returns[returns < 0]
    if len(downside) < 1 or downside.std() == 0:
        return float("inf") if excess.mean() > 0 else 0.0
    return float(np.sqrt(trading_days) * excess.mean() / downside.std())


def _max_drawdown(equity: pd.Series) -> tuple[float, int]:
    if len(equity) < 2:
        return 0.0, 0
    peak = equity.expanding().max()
    drawdown = (equity - peak) / peak
    mdd_pct = float(drawdown.min()) * 100

    # Duration
    is_dd = drawdown < 0
    if not is_dd.any():
        return 0.0, 0
    groups = (~is_dd).cumsum()
    dd_lengths = is_dd.groupby(groups).sum()
    max_duration = int(dd_lengths.max()) if len(dd_lengths) > 0 else 0

    return abs(mdd_pct), max_duration


def _calmar_ratio(returns: pd.Series, mdd_pct: float, trading_days: int) -> float:
    if mdd_pct == 0:
        return 0.0
    annual_return = returns.mean() * trading_days * 100
    return annual_return / mdd_pct

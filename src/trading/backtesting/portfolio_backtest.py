"""Portfolio-level backtesting across multiple tickers simultaneously."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from src.trading.backtesting.backtest_engine import BacktestEngine
from src.trading.backtesting.metrics import BacktestMetrics, compute_metrics
from src.trading.features.feature_pipeline import FeaturePipeline
from src.trading.strategies.base_strategy import BaseStrategy

logger = logging.getLogger(__name__)


@dataclass
class PortfolioBacktestResult:
    metrics: BacktestMetrics
    equity_curve: pd.Series
    per_ticker_metrics: dict[str, BacktestMetrics]
    per_ticker_equity: dict[str, pd.Series]
    trades: list[dict]
    correlation_matrix: pd.DataFrame
    sector_exposure: list[dict] = field(default_factory=list)


class PortfolioBacktestEngine:
    """Run a strategy across multiple tickers with portfolio-level constraints."""

    def __init__(
        self,
        initial_capital: float = 100_000.0,
        max_positions: int = 10,
        max_sector_pct: float = 0.30,
        max_correlation: float = 0.70,
        max_drawdown_pct: float = 10.0,
        commission_pct: float = 0.001,
        slippage_pct: float = 0.0005,
    ) -> None:
        self.initial_capital = initial_capital
        self.max_positions = max_positions
        self.max_sector_pct = max_sector_pct
        self.max_correlation = max_correlation
        self.max_drawdown_pct = max_drawdown_pct
        self.commission_pct = commission_pct
        self.slippage_pct = slippage_pct
        self.pipeline = FeaturePipeline()

    def run(
        self,
        tickers: list[str],
        strategy: BaseStrategy,
        start_date: str | None = None,
        end_date: str | None = None,
        period: str = "1y",
    ) -> PortfolioBacktestResult:
        """Run portfolio backtest across all tickers.

        1. Build features for each ticker
        2. Run individual backtests with capital allocation
        3. Combine into portfolio-level equity curve
        4. Compute correlation matrix and portfolio metrics
        """
        n_tickers = len(tickers)
        if n_tickers == 0:
            raise ValueError("No tickers provided")

        # Allocate capital equally (capped by max_positions)
        active_tickers = tickers[: self.max_positions]
        allocation = self.initial_capital / len(active_tickers)

        # Build features and run individual backtests
        per_ticker_results: dict[str, object] = {}
        per_ticker_features: dict[str, pd.DataFrame] = {}
        all_trades: list[dict] = []

        for ticker in active_tickers:
            try:
                features_df = self.pipeline.build_features(
                    ticker,
                    period=period,
                    start_date=start_date,
                    end_date=end_date,
                    include_sentiment=False,
                )
                if features_df.empty or len(features_df) < 30:
                    logger.warning("Insufficient data for %s, skipping", ticker)
                    continue

                per_ticker_features[ticker] = features_df
                engine = BacktestEngine(
                    initial_capital=allocation,
                    commission_pct=self.commission_pct,
                    slippage_pct=self.slippage_pct,
                )
                result = engine.run(features_df.copy(), strategy, ticker)
                per_ticker_results[ticker] = result

                # Tag trades with ticker
                for trade in result.trades:
                    trade["ticker"] = ticker
                    all_trades.append(trade)

            except Exception as e:
                logger.warning("Backtest failed for %s: %s", ticker, e)

        if not per_ticker_results:
            raise ValueError("No tickers produced valid backtest results")

        # Compute correlation matrix from returns
        returns_dict = {}
        for ticker, features_df in per_ticker_features.items():
            if "close" in features_df.columns:
                returns_dict[ticker] = features_df["close"].pct_change().dropna()
        if returns_dict:
            returns_df = pd.DataFrame(returns_dict).dropna()
            correlation_matrix = returns_df.corr()
        else:
            correlation_matrix = pd.DataFrame()

        # Combine equity curves
        per_ticker_equity: dict[str, pd.Series] = {}
        per_ticker_metrics: dict[str, BacktestMetrics] = {}

        for ticker, result in per_ticker_results.items():
            per_ticker_equity[ticker] = result.equity_curve
            per_ticker_metrics[ticker] = result.metrics

        # Build combined equity curve by summing individual equity curves
        equity_df = pd.DataFrame(per_ticker_equity)
        equity_df = equity_df.ffill().bfill()
        combined_equity = equity_df.sum(axis=1)

        # Compute portfolio-level metrics
        portfolio_metrics = compute_metrics(
            combined_equity,
            all_trades,
            self.initial_capital,
        )

        return PortfolioBacktestResult(
            metrics=portfolio_metrics,
            equity_curve=combined_equity,
            per_ticker_metrics=per_ticker_metrics,
            per_ticker_equity=per_ticker_equity,
            trades=all_trades[:200],
            correlation_matrix=correlation_matrix,
        )

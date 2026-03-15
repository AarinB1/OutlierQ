"""Walk-forward optimization with rolling train/validate/test windows.

Default: train=252d, val=63d, test=63d, step=21d.
Retrains model at each step and aggregates out-of-sample results.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import pandas as pd

from config.settings import LOG_FORMAT
from src.trading.backtesting.backtest_engine import BacktestEngine, BacktestResult
from src.trading.backtesting.metrics import BacktestMetrics, compute_metrics
from src.trading.strategies.base_strategy import BaseStrategy

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


@dataclass
class WalkForwardResult:
    """Aggregated walk-forward validation results."""
    overall_metrics: BacktestMetrics
    fold_results: list[BacktestResult]
    equity_curve: pd.Series
    n_folds: int


class WalkForwardValidator:
    """Rolling walk-forward backtesting with periodic retraining."""

    def __init__(
        self,
        train_days: int = 252,
        val_days: int = 63,
        test_days: int = 63,
        step_days: int = 21,
        initial_capital: float = 100_000.0,
        commission_pct: float = 0.001,
        slippage_pct: float = 0.0005,
    ) -> None:
        self.train_days = train_days
        self.val_days = val_days
        self.test_days = test_days
        self.step_days = step_days
        self.initial_capital = initial_capital
        self.commission_pct = commission_pct
        self.slippage_pct = slippage_pct

    def run(
        self,
        features_df: pd.DataFrame,
        strategy: BaseStrategy,
        ticker: str = "UNKNOWN",
        retrain_fn: callable | None = None,
    ) -> WalkForwardResult:
        """Run walk-forward validation.

        Args:
            features_df: Complete feature DataFrame.
            strategy: Trading strategy to test.
            ticker: Ticker symbol.
            retrain_fn: Optional function(train_df, val_df) -> None
                        called at each fold to retrain models.
        """
        n = len(features_df)
        min_required = self.train_days + self.val_days + self.test_days

        if n < min_required:
            logger.warning(
                "Not enough data for walk-forward: %d bars < %d required",
                n, min_required,
            )
            engine = BacktestEngine(
                initial_capital=self.initial_capital,
                commission_pct=self.commission_pct,
                slippage_pct=self.slippage_pct,
            )
            single = engine.run(features_df, strategy, ticker)
            return WalkForwardResult(
                overall_metrics=single.metrics,
                fold_results=[single],
                equity_curve=single.equity_curve,
                n_folds=1,
            )

        fold_results = []
        all_trades = []
        equity_segments = []
        start = 0

        fold_num = 0
        while start + min_required <= n:
            fold_num += 1
            train_end = start + self.train_days
            val_end = train_end + self.val_days
            test_end = min(val_end + self.test_days, n)

            train_df = features_df.iloc[start:train_end]
            val_df = features_df.iloc[train_end:val_end]
            test_df = features_df.iloc[val_end:test_end]

            logger.info(
                "Walk-forward fold %d: train[%d:%d], val[%d:%d], test[%d:%d]",
                fold_num, start, train_end, train_end, val_end, val_end, test_end,
            )

            if retrain_fn is not None:
                try:
                    retrain_fn(train_df, val_df)
                except Exception as e:
                    logger.warning("Retrain failed at fold %d: %s", fold_num, e)

            engine = BacktestEngine(
                initial_capital=self.initial_capital,
                commission_pct=self.commission_pct,
                slippage_pct=self.slippage_pct,
            )
            result = engine.run(test_df, strategy, ticker)

            fold_results.append(result)
            all_trades.extend(result.trades)
            equity_segments.append(result.equity_curve)

            start += self.step_days

        # Combine equity curves
        if equity_segments:
            equity_curve = pd.concat(equity_segments)
            equity_curve = equity_curve[~equity_curve.index.duplicated(keep="last")]
            equity_curve = equity_curve.sort_index()
        else:
            equity_curve = pd.Series(dtype=float)

        overall_metrics = compute_metrics(equity_curve, all_trades)

        logger.info(
            "Walk-forward complete: %d folds, %d total trades, Sharpe=%.2f",
            len(fold_results), overall_metrics.total_trades, overall_metrics.sharpe_ratio,
        )

        return WalkForwardResult(
            overall_metrics=overall_metrics,
            fold_results=fold_results,
            equity_curve=equity_curve,
            n_folds=len(fold_results),
        )

"""Trade signal engine: orchestrates data->features->regime->strategies->risk->signals."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from config.settings import LOG_FORMAT
from src.trading.features.feature_pipeline import FeaturePipeline
from src.trading.models.regime_detector import RegimeDetector
from src.trading.risk.risk_manager import RiskManager
from src.trading.strategies.base_strategy import BaseStrategy, TradeSignalData

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class TradeSignalEngine:
    """Orchestrates the full signal generation pipeline.

    Flow: fetch data -> compute features -> classify regime ->
    select strategies -> generate signals -> risk filter -> store.
    """

    def __init__(
        self,
        feature_pipeline: FeaturePipeline | None = None,
        strategies: list[BaseStrategy] | None = None,
        regime_detector: RegimeDetector | None = None,
        risk_manager: RiskManager | None = None,
    ) -> None:
        self.feature_pipeline = feature_pipeline or FeaturePipeline()
        self.strategies = strategies or []
        self.regime_detector = regime_detector or RegimeDetector()
        self.risk_manager = risk_manager or RiskManager()

    def register_strategy(self, strategy: BaseStrategy) -> None:
        self.strategies.append(strategy)

    def generate_signals(
        self,
        tickers: list[str],
        period: str = "1y",
    ) -> list[TradeSignalData]:
        """Generate trading signals for the given tickers.

        Returns a list of risk-validated TradeSignalData objects.
        """
        all_signals: list[TradeSignalData] = []

        for ticker in tickers:
            try:
                signals = self._process_ticker(ticker, period)
                all_signals.extend(signals)
            except Exception as e:
                logger.error("Signal generation failed for %s: %s", ticker, e)

        logger.info(
            "Generated %d signals across %d tickers",
            len(all_signals), len(tickers),
        )
        return all_signals

    def _process_ticker(self, ticker: str, period: str) -> list[TradeSignalData]:
        # Build features
        features_df = self.feature_pipeline.build_features(ticker, period)
        if features_df.empty:
            logger.warning("No features for %s, skipping", ticker)
            return []

        features_df.attrs["ticker"] = ticker

        # Detect regime
        regime_features = self.regime_detector.get_regime_features(features_df)
        if not regime_features.empty:
            regime, regime_conf = self.regime_detector.predict(regime_features)
        else:
            regime, regime_conf = "sideways", 0.5

        logger.info("Regime for %s: %s (conf=%.2f)", ticker, regime, regime_conf)

        # Run strategies
        raw_signals: list[TradeSignalData] = []
        for strategy in self.strategies:
            try:
                sigs = strategy.generate_signals(features_df)
                for s in sigs:
                    s.ticker = ticker
                raw_signals.extend(sigs)
            except Exception as e:
                logger.warning(
                    "Strategy %s failed for %s: %s",
                    strategy.name, ticker, e,
                )

        # Risk filter
        validated = []
        for signal in raw_signals:
            if self.risk_manager.validate_signal(signal):
                validated.append(signal)
            else:
                logger.debug("Signal rejected by risk manager: %s %s", signal.ticker, signal.direction)

        logger.info(
            "%s: %d raw signals -> %d validated",
            ticker, len(raw_signals), len(validated),
        )
        return validated

    def store_signals(self, signals: list[TradeSignalData]) -> list[str]:
        """Store validated signals in the database. Returns list of signal IDs."""
        from src.db.database import get_session
        from src.db.trading_tables import TradeSignal

        ids = []
        with get_session() as session:
            for signal in signals:
                db_signal = TradeSignal(
                    ticker=signal.ticker,
                    direction=signal.direction,
                    strategy_name=signal.strategy_name,
                    model_name=signal.model_name or None,
                    entry_price=signal.entry_price,
                    target_price=signal.target_price,
                    stop_loss=signal.stop_loss,
                    confidence=signal.confidence,
                    timeframe=signal.timeframe,
                    status="pending",
                    metadata_json=signal.metadata,
                )
                session.add(db_signal)
                session.flush()
                ids.append(db_signal.id)

        logger.info("Stored %d signals in database", len(ids))
        return ids

"""Signal aggregator: combines strategy + ML signals with confidence weighting."""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

from config.settings import LOG_FORMAT
from src.trading.strategies.base_strategy import TradeSignalData

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class SignalAggregator:
    """Aggregates signals from multiple sources and produces a final recommendation."""

    def __init__(
        self,
        min_agreement: int = 2,
        min_confidence: float = 0.5,
    ) -> None:
        self.min_agreement = min_agreement
        self.min_confidence = min_confidence

    def aggregate(
        self,
        signals: list[TradeSignalData],
    ) -> list[TradeSignalData]:
        """Aggregate signals by ticker+direction, returning consensus signals."""
        grouped: dict[tuple[str, str], list[TradeSignalData]] = defaultdict(list)
        for s in signals:
            grouped[(s.ticker, s.direction)].append(s)

        result = []
        for (ticker, direction), group in grouped.items():
            if len(group) < self.min_agreement:
                continue

            avg_confidence = sum(s.confidence for s in group) / len(group)
            if avg_confidence < self.min_confidence:
                continue

            # Use the signal with highest confidence as the base
            best = max(group, key=lambda s: s.confidence)
            best.confidence = avg_confidence
            best.metadata["contributing_strategies"] = [s.strategy_name for s in group]
            best.metadata["agreement_count"] = len(group)
            result.append(best)

            logger.info(
                "Aggregated signal: %s %s, %d strategies agree, confidence=%.2f",
                ticker, direction, len(group), avg_confidence,
            )

        return result

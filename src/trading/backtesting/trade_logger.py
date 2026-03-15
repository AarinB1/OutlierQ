"""Trade logger: records all simulated trades for analysis and DB storage."""

from __future__ import annotations

import csv
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


@dataclass
class TradeRecord:
    """A single completed trade."""
    trade_id: str = ""
    ticker: str = ""
    direction: str = ""  # BUY / SHORT
    entry_time: datetime | None = None
    exit_time: datetime | None = None
    entry_price: float = 0.0
    exit_price: float = 0.0
    quantity: int = 0
    pnl_dollars: float = 0.0
    pnl_pct: float = 0.0
    fees: float = 0.0
    slippage: float = 0.0
    exit_reason: str = ""  # target / stop_loss / time_exit / signal_reversal
    strategy_name: str = ""
    model_confidence: float = 0.0
    holding_days: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


class TradeLogger:
    """Accumulates trade records during a backtest or live session."""

    def __init__(self) -> None:
        self.trades: list[TradeRecord] = []

    def log_trade(self, trade: TradeRecord) -> None:
        self.trades.append(trade)

    def to_dicts(self) -> list[dict]:
        """Return all trades as a list of dicts."""
        results = []
        for t in self.trades:
            d = asdict(t)
            d["entry_time"] = str(t.entry_time) if t.entry_time else ""
            d["exit_time"] = str(t.exit_time) if t.exit_time else ""
            # Don't serialize nested metadata that might not be JSON-friendly
            d["metadata"] = str(t.metadata)
            results.append(d)
        return results

    def export_csv(self, path: str | Path) -> None:
        """Export all trades to CSV."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        records = self.to_dicts()
        if not records:
            logger.warning("No trades to export")
            return

        with open(path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=records[0].keys())
            writer.writeheader()
            writer.writerows(records)

        logger.info("Exported %d trades to %s", len(records), path)

    def summary(self) -> dict[str, Any]:
        """Return a summary of all logged trades."""
        if not self.trades:
            return {"total_trades": 0}

        pnls = [t.pnl_pct for t in self.trades]
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p < 0]

        return {
            "total_trades": len(self.trades),
            "winning_trades": len(wins),
            "losing_trades": len(losses),
            "total_pnl_dollars": sum(t.pnl_dollars for t in self.trades),
            "total_fees": sum(t.fees for t in self.trades),
            "avg_pnl_pct": float(sum(pnls) / len(pnls)),
            "avg_holding_days": float(sum(t.holding_days for t in self.trades) / len(self.trades)),
        }

    def clear(self) -> None:
        self.trades.clear()

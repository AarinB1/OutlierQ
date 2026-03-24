"""Paper trading executor — simulates order execution without real money."""

import logging
import uuid
from datetime import datetime
from sqlalchemy.orm import Session

from src.predictions.execution.execution_db import PredictionOrder, PredictionPosition

logger = logging.getLogger(__name__)


class PaperExecutor:
    """Simulates order execution without real money.

    Fills immediately at the current market price (optimistic assumption).
    Tracks positions and P&L identically to live execution.
    """

    def __init__(self, db_session: Session):
        self.db = db_session

    def place_order(
        self,
        market_id: str,
        platform: str,
        side: str,
        contracts: int,
        price: float,
        prediction_id: int,
        question: str = "",
    ) -> PredictionOrder:
        """Simulate placing an order. Always fills immediately at requested price."""
        client_order_id = f"paper-{uuid.uuid4().hex[:12]}"
        cost = contracts * price

        order = PredictionOrder(
            prediction_id=prediction_id,
            market_id=market_id,
            platform=platform,
            mode="paper",
            side=side,
            action="buy",
            contracts=contracts,
            price=price,
            cost=cost,
            platform_order_id=f"paper-{uuid.uuid4().hex[:8]}",
            client_order_id=client_order_id,
            status="filled",
            filled_contracts=contracts,
            filled_price=price,
            filled_at=datetime.utcnow(),
        )
        self.db.add(order)
        self.db.flush()

        # Update or create position
        self._update_position(market_id, platform, side, contracts, price, question)

        logger.info(
            "Paper order filled: %s %d %s @ %.2f on %s (cost=$%.2f)",
            side, contracts, market_id, price, platform, cost,
        )
        return order

    def _update_position(
        self,
        market_id: str,
        platform: str,
        side: str,
        contracts: int,
        price: float,
        question: str,
    ) -> None:
        """Create or update a position after a fill."""
        pos = (
            self.db.query(PredictionPosition)
            .filter(PredictionPosition.market_id == market_id, PredictionPosition.mode == "paper")
            .first()
        )

        if pos is None:
            pos = PredictionPosition(
                market_id=market_id,
                platform=platform,
                question=question,
                side=side,
                contracts=contracts,
                avg_price=price,
                cost_basis=contracts * price,
                current_price=price,
                unrealized_pnl=0.0,
                mode="paper",
            )
            self.db.add(pos)
        else:
            # Average into existing position
            total_contracts = pos.contracts + contracts
            total_cost = pos.cost_basis + (contracts * price)
            pos.avg_price = total_cost / total_contracts if total_contracts > 0 else price
            pos.contracts = total_contracts
            pos.cost_basis = total_cost
            pos.updated_at = datetime.utcnow()

        self.db.flush()

    def check_positions(self) -> list[PredictionPosition]:
        """Return all open paper positions."""
        return (
            self.db.query(PredictionPosition)
            .filter(PredictionPosition.mode == "paper")
            .all()
        )

    def resolve_position(self, market_id: str, actual_outcome: str) -> float | None:
        """Resolve a paper position. Returns realized P&L or None if no position."""
        pos = (
            self.db.query(PredictionPosition)
            .filter(PredictionPosition.market_id == market_id, PredictionPosition.mode == "paper")
            .first()
        )
        if pos is None:
            return None

        # Calculate P&L
        if pos.side == "yes":
            if actual_outcome == "yes":
                pnl = pos.contracts * (1.0 - pos.avg_price)
            else:
                pnl = -(pos.contracts * pos.avg_price)
        else:  # side == "no"
            if actual_outcome == "no":
                pnl = pos.contracts * (1.0 - pos.avg_price)
            else:
                pnl = -(pos.contracts * pos.avg_price)

        # Update orders for this market
        orders = (
            self.db.query(PredictionOrder)
            .filter(
                PredictionOrder.market_id == market_id,
                PredictionOrder.mode == "paper",
                PredictionOrder.pnl.is_(None),
            )
            .all()
        )
        for order in orders:
            order.pnl = pnl * (order.filled_contracts / pos.contracts) if pos.contracts > 0 else 0
            order.exit_reason = "resolved"
            order.resolved_at = datetime.utcnow()

        # Remove position
        self.db.delete(pos)
        self.db.flush()

        logger.info("Paper position resolved: %s -> %s, P&L=$%.2f", market_id, actual_outcome, pnl)
        return round(pnl, 4)

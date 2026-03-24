"""Main execution orchestrator — sizes, places, tracks, and resolves prediction bets."""

import logging
from datetime import datetime
from sqlalchemy.orm import Session

from src.predictions.execution.bankroll import BankrollManager
from src.predictions.execution.execution_db import (
    BankrollSnapshot,
    PredictionOrder,
    PredictionPosition,
)

logger = logging.getLogger(__name__)


class PredictionExecutor:
    """Orchestrates the full execution flow: size -> place -> track -> resolve.

    Modes:
    - "paper": all orders simulated via PaperExecutor (default, safe)
    - "kalshi_demo": real Kalshi orders on demo sandbox (no real money)
    - "kalshi_live": real Kalshi orders with real USD
    - "polymarket": real Polymarket orders with real USDC
    """

    def __init__(
        self,
        mode: str = "paper",
        bankroll_config: dict | None = None,
        kalshi_config: dict | None = None,
        polymarket_config: dict | None = None,
        db_session: Session | None = None,
    ):
        self.mode = mode
        self.bankroll = BankrollManager(**(bankroll_config or {}))
        self.db = db_session
        self.platform_executor = None

        if mode == "paper":
            from src.predictions.execution.paper_executor import PaperExecutor
            if db_session:
                self.platform_executor = PaperExecutor(db_session)
        elif mode in ("kalshi_demo", "kalshi_live"):
            from src.predictions.execution.kalshi_executor import KalshiExecutor
            demo = mode == "kalshi_demo"
            self.platform_executor = KalshiExecutor(demo=demo, **(kalshi_config or {}))
        elif mode == "polymarket":
            from src.predictions.execution.polymarket_executor import PolymarketExecutor
            self.platform_executor = PolymarketExecutor(**(polymarket_config or {}))

        if mode == "kalshi_live":
            logger.warning(
                "*** LIVE TRADING MODE ACTIVE — real USD at risk on Kalshi ***"
            )
        elif mode == "polymarket":
            logger.warning(
                "*** LIVE TRADING MODE ACTIVE — real USDC at risk on Polymarket ***"
            )

    def execute_predictions(self, predictions: list[dict]) -> list[dict]:
        """Size and execute a batch of predictions.

        For each prediction:
        1. Check bankroll limits and calculate bet size
        2. Skip if rejection_reason is set
        3. Place order via the appropriate executor
        4. Record in prediction_orders table
        5. Update prediction_positions table
        6. Take bankroll snapshot

        Returns list of execution result dicts.
        """
        results = []
        current_bankroll = self._get_current_bankroll()
        current_positions = self._get_position_dicts()

        for pred in predictions:
            sizing = self.bankroll.calculate_bet_size(pred, current_bankroll, current_positions)

            if sizing["rejection_reason"]:
                logger.debug(
                    "Skipping %s: %s", pred.get("market_id", "?"), sizing["rejection_reason"]
                )
                results.append({
                    "market_id": pred.get("market_id"),
                    "status": "rejected",
                    "reason": sizing["rejection_reason"],
                    "sizing": sizing,
                })
                continue

            # Place order
            try:
                order = self._place_order(pred, sizing)
                current_bankroll -= sizing["cost"]
                # Add to positions list for subsequent sizing checks
                current_positions.append({
                    "market_id": pred.get("market_id"),
                    "platform": pred.get("platform"),
                    "cost_basis": sizing["cost"],
                })

                results.append({
                    "market_id": pred.get("market_id"),
                    "status": "filled" if self.mode == "paper" else "placed",
                    "contracts": sizing["contracts"],
                    "cost": sizing["cost"],
                    "side": sizing["side"],
                    "price": sizing["price"],
                    "order_id": order.id if hasattr(order, "id") else None,
                })
            except Exception:
                logger.exception("Failed to place order for %s", pred.get("market_id"))
                results.append({
                    "market_id": pred.get("market_id"),
                    "status": "error",
                    "reason": "order_placement_failed",
                })

        # Take bankroll snapshot
        if results and self.db:
            self._take_snapshot()

        logger.info(
            "Executed %d/%d predictions (mode=%s)",
            sum(1 for r in results if r["status"] in ("filled", "placed")),
            len(predictions),
            self.mode,
        )
        return results

    def _place_order(self, prediction: dict, sizing: dict):
        """Place an order through the appropriate executor."""
        market_id = prediction.get("market_id", "")
        platform = prediction.get("platform", "")
        question = prediction.get("question", "")
        prediction_id = prediction.get("id", 0)

        if self.mode == "paper":
            return self.platform_executor.place_order(
                market_id=market_id,
                platform=platform,
                side=sizing["side"],
                contracts=sizing["contracts"],
                price=sizing["price"],
                prediction_id=prediction_id,
                question=question,
            )
        elif self.mode in ("kalshi_demo", "kalshi_live"):
            price_cents = int(sizing["price"] * 100)
            result = self.platform_executor.place_order(
                ticker=market_id,
                side=sizing["side"],
                action="buy",
                contracts=sizing["contracts"],
                price_cents=price_cents,
            )
            # Record in DB if available
            if self.db:
                order = PredictionOrder(
                    prediction_id=prediction_id,
                    market_id=market_id,
                    platform="kalshi",
                    mode="live",
                    side=sizing["side"],
                    action="buy",
                    contracts=sizing["contracts"],
                    price=sizing["price"],
                    cost=sizing["cost"],
                    platform_order_id=result.get("order", {}).get("order_id", ""),
                    status=result.get("order", {}).get("status", "pending"),
                )
                self.db.add(order)
                self.db.flush()
                return order
            return result
        elif self.mode == "polymarket":
            token_id = prediction.get("token_id", market_id)
            result = self.platform_executor.place_order(
                token_id=token_id,
                side="BUY",
                amount_dollars=sizing["cost"],
                price=sizing["price"],
            )
            if self.db:
                order = PredictionOrder(
                    prediction_id=prediction_id,
                    market_id=market_id,
                    platform="polymarket",
                    mode="live",
                    side=sizing["side"],
                    action="buy",
                    contracts=sizing["contracts"],
                    price=sizing["price"],
                    cost=sizing["cost"],
                    platform_order_id=str(result.get("orderID", "")),
                    status="placed",
                )
                self.db.add(order)
                self.db.flush()
                return order
            return result

    def sync_positions(self) -> None:
        """Refresh open positions with current market prices.
        Update unrealized P&L on all PredictionPosition rows.
        """
        if not self.db:
            return

        positions = (
            self.db.query(PredictionPosition)
            .filter(PredictionPosition.mode == ("paper" if self.mode == "paper" else "live"))
            .all()
        )

        for pos in positions:
            # In paper mode, we'd need market price from a fetcher
            # For now, unrealized P&L stays at last known value
            if pos.current_price is not None:
                if pos.side == "yes":
                    pos.unrealized_pnl = pos.contracts * (pos.current_price - pos.avg_price)
                else:
                    pos.unrealized_pnl = pos.contracts * (pos.avg_price - pos.current_price)
                pos.updated_at = datetime.utcnow()

        self.db.flush()
        logger.info("Synced %d positions", len(positions))

    def resolve_markets(self, resolved: list[dict]) -> list[dict]:
        """Process market resolutions.

        Args:
            resolved: list of {"market_id": str, "outcome": "yes"|"no"}

        Returns list of resolution result dicts.
        """
        results = []

        if self.mode == "paper" and self.platform_executor:
            for rm in resolved:
                pnl = self.platform_executor.resolve_position(
                    rm["market_id"], rm["outcome"]
                )
                if pnl is not None:
                    results.append({
                        "market_id": rm["market_id"],
                        "outcome": rm["outcome"],
                        "pnl": pnl,
                    })
        elif self.db:
            for rm in resolved:
                pos = (
                    self.db.query(PredictionPosition)
                    .filter(
                        PredictionPosition.market_id == rm["market_id"],
                        PredictionPosition.mode == "live",
                    )
                    .first()
                )
                if not pos:
                    continue

                if pos.side == rm["outcome"]:
                    pnl = pos.contracts * (1.0 - pos.avg_price)
                else:
                    pnl = -(pos.contracts * pos.avg_price)

                # Update orders
                orders = (
                    self.db.query(PredictionOrder)
                    .filter(
                        PredictionOrder.market_id == rm["market_id"],
                        PredictionOrder.mode == "live",
                        PredictionOrder.pnl.is_(None),
                    )
                    .all()
                )
                for order in orders:
                    order.pnl = pnl * (order.filled_contracts / pos.contracts) if pos.contracts > 0 else 0
                    order.exit_reason = "resolved"
                    order.resolved_at = datetime.utcnow()

                self.db.delete(pos)
                self.db.flush()

                results.append({
                    "market_id": rm["market_id"],
                    "outcome": rm["outcome"],
                    "pnl": round(pnl, 4),
                })

        if results and self.db:
            self._take_snapshot()

        logger.info("Resolved %d markets, total P&L: $%.2f", len(results), sum(r["pnl"] for r in results))
        return results

    def get_portfolio_summary(self) -> dict:
        """Return current bankroll state, open positions, and performance stats."""
        bankroll = self._get_current_bankroll()
        positions = self._get_position_dicts()
        deployed = sum(p.get("cost_basis", 0) for p in positions)
        unrealized = sum(p.get("unrealized_pnl", 0) for p in positions)

        # Win/loss from resolved orders
        win_count = 0
        loss_count = 0
        total_realized_pnl = 0.0
        if self.db:
            mode_filter = "paper" if self.mode == "paper" else "live"
            resolved_orders = (
                self.db.query(PredictionOrder)
                .filter(
                    PredictionOrder.mode == mode_filter,
                    PredictionOrder.pnl.isnot(None),
                )
                .all()
            )
            for o in resolved_orders:
                total_realized_pnl += o.pnl or 0
                if (o.pnl or 0) > 0:
                    win_count += 1
                else:
                    loss_count += 1

        return {
            "mode": self.mode,
            "total_bankroll": round(bankroll + deployed + unrealized, 2),
            "available_cash": round(bankroll, 2),
            "deployed_capital": round(deployed, 2),
            "unrealized_pnl": round(unrealized, 2),
            "realized_pnl": round(total_realized_pnl, 2),
            "open_positions": len(positions),
            "win_count": win_count,
            "loss_count": loss_count,
            "win_rate": win_count / max(win_count + loss_count, 1),
        }

    def _get_current_bankroll(self) -> float:
        """Get available cash from the latest snapshot or initial bankroll."""
        if not self.db:
            return self.bankroll.initial_bankroll

        mode_filter = "paper" if self.mode == "paper" else "live"
        latest = (
            self.db.query(BankrollSnapshot)
            .filter(BankrollSnapshot.mode == mode_filter)
            .order_by(BankrollSnapshot.timestamp.desc())
            .first()
        )
        if latest:
            return latest.available_cash
        return self.bankroll.initial_bankroll

    def _get_position_dicts(self) -> list[dict]:
        """Get current positions as plain dicts for bankroll calculations."""
        if not self.db:
            return []

        mode_filter = "paper" if self.mode == "paper" else "live"
        positions = (
            self.db.query(PredictionPosition)
            .filter(PredictionPosition.mode == mode_filter)
            .all()
        )
        return [
            {
                "market_id": p.market_id,
                "platform": p.platform,
                "cost_basis": p.cost_basis,
                "side": p.side,
                "contracts": p.contracts,
                "avg_price": p.avg_price,
                "unrealized_pnl": p.unrealized_pnl or 0,
            }
            for p in positions
        ]

    def _take_snapshot(self) -> None:
        """Record a bankroll snapshot."""
        if not self.db:
            return

        summary = self.get_portfolio_summary()
        snapshot = BankrollSnapshot(
            mode=self.mode if self.mode != "paper" else "paper",
            total_bankroll=summary["total_bankroll"],
            available_cash=summary["available_cash"],
            deployed_capital=summary["deployed_capital"],
            total_pnl=summary["realized_pnl"],
            open_positions=summary["open_positions"],
            win_count=summary["win_count"],
            loss_count=summary["loss_count"],
        )
        self.db.add(snapshot)
        self.db.flush()

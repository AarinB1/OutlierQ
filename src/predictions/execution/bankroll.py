"""Bankroll management and position sizing for binary prediction market contracts."""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


class BankrollManager:
    """Manages bankroll for prediction market betting.

    Binary contract sizing:
    - Buy YES at price p: risk p per contract, profit (1-p) per contract
    - Buy NO at price (1-p): risk (1-p) per contract, profit p per contract
    - Kelly for binary: f* = edge / odds
    """

    def __init__(
        self,
        initial_bankroll: float = 1000.0,
        max_bet_pct: float = 0.05,
        min_bet_dollars: float = 1.0,
        max_bet_dollars: float = 100.0,
        max_open_positions: int = 20,
        max_platform_exposure_pct: float = 0.60,
        kelly_fraction: float = 0.25,
        sizing_method: str = "kelly",
        min_edge: float = 0.05,
    ):
        self.initial_bankroll = initial_bankroll
        self.max_bet_pct = max_bet_pct
        self.min_bet_dollars = min_bet_dollars
        self.max_bet_dollars = max_bet_dollars
        self.max_open_positions = max_open_positions
        self.max_platform_exposure_pct = max_platform_exposure_pct
        self.kelly_fraction = kelly_fraction
        self.sizing_method = sizing_method
        self.min_edge = min_edge

    def calculate_bet_size(
        self,
        prediction: dict,
        current_bankroll: float,
        current_positions: list[dict],
    ) -> dict:
        """Calculate optimal bet size for a prediction.

        Returns:
            {
                "contracts": int,
                "cost": float,
                "side": "yes" | "no",
                "price": float,
                "risk": float,
                "potential_profit": float,
                "kelly_fraction_used": float,
                "rejection_reason": str | None,
            }
        """
        edge = prediction.get("edge", 0)
        market_prob = prediction.get("market_probability", 0.5)
        predicted_outcome = prediction.get("predicted_outcome", "yes")
        confidence = prediction.get("confidence", 0)

        # Determine side and price
        if predicted_outcome == "yes":
            side = "yes"
            price = market_prob
        else:
            side = "no"
            price = 1.0 - market_prob

        # Clamp price to avoid division by zero
        price = max(0.01, min(0.99, price))
        abs_edge = abs(edge)

        # --- Rejection checks ---

        # 1. Position limit
        if len(current_positions) >= self.max_open_positions:
            return self._rejection(side, price, "max_positions_reached")

        # 2. Minimum edge gate
        if abs_edge < self.min_edge:
            return self._rejection(side, price, "edge_too_small")

        # 3. Already have position on this market
        market_id = prediction.get("market_id", "")
        for pos in current_positions:
            if pos.get("market_id") == market_id:
                return self._rejection(side, price, "duplicate_market")

        # 4. Platform exposure check
        platform = prediction.get("platform", "")
        if platform:
            platform_cost = sum(
                pos.get("cost_basis", 0)
                for pos in current_positions
                if pos.get("platform") == platform
            )
            max_platform_dollars = current_bankroll * self.max_platform_exposure_pct
            if platform_cost >= max_platform_dollars:
                return self._rejection(side, price, "platform_exposure_limit")

        # --- Sizing ---
        if self.sizing_method == "kelly":
            kelly_f = self._kelly_binary(abs_edge, price, side)
            bet_fraction = kelly_f * self.kelly_fraction
        elif self.sizing_method == "edge_scaled":
            # Scale linearly with edge, capped at max_bet_pct
            bet_fraction = min(abs_edge * 2, self.max_bet_pct)
        else:  # fixed
            bet_fraction = self.max_bet_pct

        # Clamp to max_bet_pct
        bet_fraction = min(bet_fraction, self.max_bet_pct)

        bet_dollars = current_bankroll * bet_fraction
        bet_dollars = max(self.min_bet_dollars, min(self.max_bet_dollars, bet_dollars))

        # Don't bet more than available bankroll
        if bet_dollars > current_bankroll:
            return self._rejection(side, price, "insufficient_bankroll")

        # Convert to contracts
        contracts = int(bet_dollars / price)
        if contracts < 1:
            return self._rejection(side, price, "bet_too_small_for_one_contract")

        actual_cost = contracts * price
        potential_profit = contracts * (1.0 - price)

        return {
            "contracts": contracts,
            "cost": round(actual_cost, 4),
            "side": side,
            "price": round(price, 4),
            "risk": round(actual_cost, 4),
            "potential_profit": round(potential_profit, 4),
            "kelly_fraction_used": round(bet_fraction, 6),
            "rejection_reason": None,
        }

    @staticmethod
    def _kelly_binary(edge: float, price: float, side: str) -> float:
        """Kelly criterion for binary contracts.

        For YES at price p with edge e: f* = e / (1 - p)
        For NO at price (1-p) with edge e: f* = e / p
        """
        if side == "yes":
            denominator = 1.0 - price
        else:
            denominator = price

        if denominator <= 0:
            return 0.0
        return max(0.0, edge / denominator)

    @staticmethod
    def _rejection(side: str, price: float, reason: str) -> dict:
        return {
            "contracts": 0,
            "cost": 0.0,
            "side": side,
            "price": round(price, 4),
            "risk": 0.0,
            "potential_profit": 0.0,
            "kelly_fraction_used": 0.0,
            "rejection_reason": reason,
        }

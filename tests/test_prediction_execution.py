"""Tests for prediction market execution layer."""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime

from src.predictions.execution.bankroll import BankrollManager


class TestBankrollManager:
    """Tests for BankrollManager position sizing."""

    def setup_method(self):
        self.bm = BankrollManager(
            initial_bankroll=1000.0,
            max_bet_pct=0.05,
            kelly_fraction=0.25,
            min_edge=0.05,
        )

    def test_basic_kelly_sizing(self):
        """Standard bet with edge should size correctly."""
        result = self.bm.calculate_bet_size(
            prediction={
                "edge": 0.10,
                "market_probability": 0.50,
                "predicted_outcome": "yes",
                "confidence": 0.8,
                "market_id": "test-1",
                "platform": "polymarket",
            },
            current_bankroll=1000.0,
            current_positions=[],
        )
        assert result["contracts"] >= 1
        assert result["cost"] <= 50.0  # 5% of $1000
        assert result["rejection_reason"] is None
        assert result["side"] == "yes"

    def test_small_bankroll_sizing(self):
        """With $100 bankroll, bet should be capped at $5 (5%)."""
        bm = BankrollManager(initial_bankroll=100, max_bet_pct=0.05, kelly_fraction=0.25)
        result = bm.calculate_bet_size(
            prediction={
                "edge": 0.10,
                "market_probability": 0.50,
                "predicted_outcome": "yes",
                "confidence": 0.8,
                "market_id": "test-1",
                "platform": "polymarket",
            },
            current_bankroll=100.0,
            current_positions=[],
        )
        assert result["contracts"] >= 1
        assert result["cost"] <= 5.0
        assert result["rejection_reason"] is None

    def test_no_side_prediction(self):
        """NO prediction should use (1 - market_prob) as price."""
        result = self.bm.calculate_bet_size(
            prediction={
                "edge": -0.10,
                "market_probability": 0.60,
                "predicted_outcome": "no",
                "confidence": 0.8,
                "market_id": "test-2",
                "platform": "kalshi",
            },
            current_bankroll=1000.0,
            current_positions=[],
        )
        assert result["side"] == "no"
        assert result["price"] == 0.4  # 1 - 0.60
        assert result["rejection_reason"] is None

    def test_position_limit_rejection(self):
        """Should reject when max positions reached."""
        fake_positions = [{"market_id": f"m{i}"} for i in range(20)]
        result = self.bm.calculate_bet_size(
            prediction={
                "edge": 0.10,
                "market_probability": 0.50,
                "predicted_outcome": "yes",
                "confidence": 0.8,
                "market_id": "new-market",
                "platform": "polymarket",
            },
            current_bankroll=1000.0,
            current_positions=fake_positions,
        )
        assert result["rejection_reason"] == "max_positions_reached"
        assert result["contracts"] == 0

    def test_low_edge_rejection(self):
        """Should reject when edge is below minimum."""
        result = self.bm.calculate_bet_size(
            prediction={
                "edge": 0.02,
                "market_probability": 0.50,
                "predicted_outcome": "yes",
                "confidence": 0.3,
                "market_id": "test-3",
                "platform": "polymarket",
            },
            current_bankroll=1000.0,
            current_positions=[],
        )
        assert result["rejection_reason"] == "edge_too_small"

    def test_duplicate_market_rejection(self):
        """Should reject duplicate market positions."""
        result = self.bm.calculate_bet_size(
            prediction={
                "edge": 0.10,
                "market_probability": 0.50,
                "predicted_outcome": "yes",
                "confidence": 0.8,
                "market_id": "existing-market",
                "platform": "polymarket",
            },
            current_bankroll=1000.0,
            current_positions=[{"market_id": "existing-market", "platform": "polymarket", "cost_basis": 10}],
        )
        assert result["rejection_reason"] == "duplicate_market"

    def test_platform_exposure_limit(self):
        """Should reject when platform exposure limit reached."""
        # Create positions that consume 60% of bankroll on polymarket
        positions = [
            {"market_id": f"pm-{i}", "platform": "polymarket", "cost_basis": 120}
            for i in range(5)
        ]  # 5 * 120 = 600 = 60% of 1000
        result = self.bm.calculate_bet_size(
            prediction={
                "edge": 0.10,
                "market_probability": 0.50,
                "predicted_outcome": "yes",
                "confidence": 0.8,
                "market_id": "new-pm",
                "platform": "polymarket",
            },
            current_bankroll=1000.0,
            current_positions=positions,
        )
        assert result["rejection_reason"] == "platform_exposure_limit"

    def test_fixed_sizing_method(self):
        """Fixed sizing should use max_bet_pct directly."""
        bm = BankrollManager(
            initial_bankroll=1000,
            max_bet_pct=0.05,
            sizing_method="fixed",
        )
        result = bm.calculate_bet_size(
            prediction={
                "edge": 0.10,
                "market_probability": 0.50,
                "predicted_outcome": "yes",
                "confidence": 0.8,
                "market_id": "test-fixed",
                "platform": "polymarket",
            },
            current_bankroll=1000.0,
            current_positions=[],
        )
        assert result["rejection_reason"] is None
        assert result["cost"] <= 50.0

    def test_edge_scaled_sizing(self):
        """Edge-scaled sizing should scale with edge."""
        bm = BankrollManager(
            initial_bankroll=1000,
            max_bet_pct=0.10,
            sizing_method="edge_scaled",
        )
        result = bm.calculate_bet_size(
            prediction={
                "edge": 0.20,
                "market_probability": 0.40,
                "predicted_outcome": "yes",
                "confidence": 0.9,
                "market_id": "test-scaled",
                "platform": "polymarket",
            },
            current_bankroll=1000.0,
            current_positions=[],
        )
        assert result["rejection_reason"] is None
        assert result["contracts"] >= 1

    def test_kelly_binary_yes(self):
        """Kelly for YES bet: f* = edge / (1 - price)."""
        f = BankrollManager._kelly_binary(0.10, 0.50, "yes")
        assert abs(f - 0.20) < 0.001  # 0.10 / 0.50 = 0.20

    def test_kelly_binary_no(self):
        """Kelly for NO bet: f* = edge / price."""
        f = BankrollManager._kelly_binary(0.10, 0.60, "no")
        assert abs(f - 0.1667) < 0.001  # 0.10 / 0.60


class TestPaperExecutor:
    """Tests for PaperExecutor using a mock DB session."""

    def _make_mock_session(self):
        session = MagicMock()
        session.query.return_value.filter.return_value.first.return_value = None
        session.query.return_value.filter.return_value.all.return_value = []
        return session

    def test_place_order(self):
        from src.predictions.execution.paper_executor import PaperExecutor
        session = self._make_mock_session()
        executor = PaperExecutor(session)

        order = executor.place_order(
            market_id="test-market",
            platform="polymarket",
            side="yes",
            contracts=5,
            price=0.60,
            prediction_id=1,
            question="Will X happen?",
        )
        assert order.status == "filled"
        assert order.filled_contracts == 5
        assert order.mode == "paper"
        assert order.cost == 3.0
        assert session.add.called

    def test_resolve_position_win(self):
        from src.predictions.execution.paper_executor import PaperExecutor
        from src.predictions.execution.execution_db import PredictionPosition

        session = self._make_mock_session()
        pos = PredictionPosition(
            market_id="m1", platform="polymarket", side="yes",
            contracts=10, avg_price=0.40, cost_basis=4.0, mode="paper",
        )
        session.query.return_value.filter.return_value.first.return_value = pos
        session.query.return_value.filter.return_value.all.return_value = []

        executor = PaperExecutor(session)
        pnl = executor.resolve_position("m1", "yes")
        assert pnl == 6.0  # 10 * (1.0 - 0.4) = 6.0

    def test_resolve_position_loss(self):
        from src.predictions.execution.paper_executor import PaperExecutor
        from src.predictions.execution.execution_db import PredictionPosition

        session = self._make_mock_session()
        pos = PredictionPosition(
            market_id="m2", platform="kalshi", side="yes",
            contracts=10, avg_price=0.40, cost_basis=4.0, mode="paper",
        )
        session.query.return_value.filter.return_value.first.return_value = pos
        session.query.return_value.filter.return_value.all.return_value = []

        executor = PaperExecutor(session)
        pnl = executor.resolve_position("m2", "no")
        assert pnl == -4.0  # -(10 * 0.4) = -4.0


class TestPredictionExecutor:
    """Tests for the main PredictionExecutor orchestrator."""

    def test_paper_mode_init(self):
        """Paper mode should initialize without API keys."""
        from src.predictions.execution.executor import PredictionExecutor
        executor = PredictionExecutor(mode="paper")
        assert executor.mode == "paper"
        assert executor.bankroll is not None

    def test_execute_rejects_low_edge(self):
        """Predictions with low edge should be rejected."""
        from src.predictions.execution.executor import PredictionExecutor
        executor = PredictionExecutor(mode="paper", bankroll_config={"min_edge": 0.05})

        results = executor.execute_predictions([
            {
                "market_id": "low-edge",
                "platform": "polymarket",
                "edge": 0.02,
                "market_probability": 0.50,
                "predicted_outcome": "yes",
                "confidence": 0.3,
            }
        ])
        assert len(results) == 1
        assert results[0]["status"] == "rejected"
        assert results[0]["reason"] == "edge_too_small"

    def test_portfolio_summary_initial(self):
        """Initial portfolio summary should show starting bankroll."""
        from src.predictions.execution.executor import PredictionExecutor
        executor = PredictionExecutor(
            mode="paper",
            bankroll_config={"initial_bankroll": 500.0},
        )
        summary = executor.get_portfolio_summary()
        assert summary["mode"] == "paper"
        assert summary["available_cash"] == 500.0
        assert summary["open_positions"] == 0

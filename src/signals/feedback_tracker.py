"""Feedback and accuracy tracking for past signals.

Checks whether past signals would have been profitable by comparing
price at signal creation vs price at expiry. Records outcomes and
computes accuracy metrics for the dashboard.
"""

import logging
from collections import defaultdict
from datetime import date, datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT
from src.db.database import get_session
from src.db.tables import Event, Signal
from src.ingestion.market_fetcher import MarketFetcher

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Price change thresholds for outcome classification
_FLAT_THRESHOLD = 0.02  # ±2% is considered flat


class FeedbackTracker:
    """Evaluates past signals against actual price movement."""

    def __init__(self, market_fetcher: MarketFetcher | None = None) -> None:
        self.market_fetcher = market_fetcher or MarketFetcher()

    def evaluate_signal(self, signal: Signal, session: Session) -> dict:
        """Evaluate a single signal against actual price movement.

        Looks up price history covering the signal's lifetime and determines
        if the directional bet was correct.
        """
        ticker = signal.ticker
        direction = signal.direction
        created_at = signal.created_at

        # Parse expiry date
        try:
            expiry_date = date.fromisoformat(signal.suggested_expiry)
        except (ValueError, TypeError):
            logger.warning("Signal %s has invalid expiry '%s'", signal.id, signal.suggested_expiry)
            return self._make_result(signal, 0.0, 0.0, 0.0, "expired", -100.0)

        # Fetch price history covering signal lifetime
        try:
            hist = self.market_fetcher.fetch_price_history(ticker, period="3mo")
        except Exception:
            logger.warning("Cannot fetch price history for %s", ticker)
            return self._make_result(signal, 0.0, 0.0, 0.0, "expired", -100.0)

        if hist.empty:
            return self._make_result(signal, 0.0, 0.0, 0.0, "expired", -100.0)

        # Normalize index to dates for comparison
        hist_dates = hist.copy()
        hist_dates.index = hist_dates.index.date if hasattr(hist_dates.index, 'date') else hist_dates.index

        # Find entry price (closest to signal creation date)
        created_date = created_at.date() if isinstance(created_at, datetime) else created_at
        entry_price = self._find_closest_price(hist, created_date)

        # Find exit price (closest to expiry date)
        exit_price = self._find_closest_price(hist, expiry_date)

        if entry_price is None or exit_price is None or entry_price == 0:
            return self._make_result(signal, 0.0, 0.0, 0.0, "expired", -100.0)

        price_change_pct = (exit_price - entry_price) / entry_price

        # Determine outcome
        if direction == "call":
            if price_change_pct > _FLAT_THRESHOLD:
                outcome = "profit"
            elif price_change_pct < -_FLAT_THRESHOLD:
                outcome = "loss"
            else:
                outcome = "expired"
        else:  # put
            if price_change_pct < -_FLAT_THRESHOLD:
                outcome = "profit"
            elif price_change_pct > _FLAT_THRESHOLD:
                outcome = "loss"
            else:
                outcome = "expired"

        # Estimate P&L (simplified)
        if outcome == "profit":
            pnl = abs(price_change_pct) * 100
        elif outcome == "loss":
            pnl = -80.0
        else:
            pnl = -100.0

        return self._make_result(signal, entry_price, exit_price, price_change_pct, outcome, pnl)

    def evaluate_all_pending(self, session: Session | None = None) -> list[dict]:
        """Find all expired signals without outcomes and evaluate them."""
        today_str = date.today().isoformat()

        def _run(s: Session) -> list[dict]:
            pending = (
                s.query(Signal)
                .filter(
                    Signal.outcome.is_(None),
                    Signal.suggested_expiry.isnot(None),
                    Signal.suggested_expiry <= today_str,
                )
                .all()
            )

            if not pending:
                logger.info("No pending signals to evaluate.")
                return []

            results: list[dict] = []
            for signal in pending:
                result = self.evaluate_signal(signal, s)

                signal.outcome = result["outcome"]
                signal.outcome_pnl = result["estimated_pnl"]
                s.add(signal)

                results.append(result)

            s.flush()
            logger.info("Evaluated %d pending signals.", len(results))
            return results

        if session is not None:
            return _run(session)
        with get_session() as s:
            return _run(s)

    def get_accuracy_stats(self, session: Session | None = None) -> dict:
        """Compute overall accuracy metrics from all evaluated signals."""
        def _run(s: Session) -> dict:
            today_str = date.today().isoformat()

            all_signals = s.query(Signal).all()
            evaluated = [sig for sig in all_signals if sig.outcome is not None]
            pending = [
                sig for sig in all_signals
                if sig.outcome is None and sig.suggested_expiry and sig.suggested_expiry > today_str
            ]

            wins = [sig for sig in evaluated if sig.outcome == "profit"]
            losses = [sig for sig in evaluated if sig.outcome == "loss"]
            expired_flat = [sig for sig in evaluated if sig.outcome == "expired"]

            total = len(evaluated)
            win_rate = len(wins) / total if total > 0 else 0.0
            avg_pnl = (
                sum(sig.outcome_pnl or 0 for sig in evaluated) / total
                if total > 0 else 0.0
            )

            # By event type
            by_event_type: dict[str, dict] = {}
            for sig in evaluated:
                event = s.query(Event).filter(Event.id == sig.event_id).first()
                et = event.event_type if event else "unknown"
                if et not in by_event_type:
                    by_event_type[et] = {"count": 0, "wins": 0, "total_pnl": 0.0}
                by_event_type[et]["count"] += 1
                if sig.outcome == "profit":
                    by_event_type[et]["wins"] += 1
                by_event_type[et]["total_pnl"] += sig.outcome_pnl or 0

            for et, data in by_event_type.items():
                data["win_rate"] = data["wins"] / data["count"] if data["count"] > 0 else 0.0
                data["avg_pnl"] = data["total_pnl"] / data["count"] if data["count"] > 0 else 0.0
                del data["total_pnl"]

            # By direction
            by_direction: dict[str, dict] = {}
            for d in ["call", "put"]:
                d_sigs = [sig for sig in evaluated if sig.direction == d]
                d_wins = [sig for sig in d_sigs if sig.outcome == "profit"]
                by_direction[d] = {
                    "count": len(d_sigs),
                    "wins": len(d_wins),
                    "win_rate": len(d_wins) / len(d_sigs) if d_sigs else 0.0,
                }

            # Recent signals
            recent = sorted(all_signals, key=lambda s: s.created_at or datetime.min, reverse=True)[:10]
            recent_list = []
            for sig in recent:
                recent_list.append({
                    "id": sig.id,
                    "ticker": sig.ticker,
                    "direction": sig.direction,
                    "strike": sig.suggested_strike,
                    "expiry": sig.suggested_expiry,
                    "confidence": sig.confidence,
                    "outcome": sig.outcome,
                    "pnl": sig.outcome_pnl,
                    "created_at": sig.created_at.isoformat() if sig.created_at else None,
                })

            return {
                "total_evaluated": total,
                "total_pending": len(pending),
                "wins": len(wins),
                "losses": len(losses),
                "expired_flat": len(expired_flat),
                "win_rate": win_rate,
                "avg_pnl": avg_pnl,
                "by_event_type": by_event_type,
                "by_direction": by_direction,
                "recent_signals": recent_list,
            }

        if session is not None:
            return _run(session)
        with get_session() as s:
            return _run(s)

    def get_confusion_matrix(self, session: Session | None = None) -> dict:
        """Build a confusion matrix for direction predictions."""
        def _run(s: Session) -> dict:
            evaluated = s.query(Signal).filter(Signal.outcome.isnot(None)).all()

            true_bullish = 0   # predicted call, stock went up (profit)
            false_bullish = 0  # predicted call, stock went down (loss)
            true_bearish = 0   # predicted put, stock went down (profit)
            false_bearish = 0  # predicted put, stock went up (loss)

            for sig in evaluated:
                if sig.direction == "call":
                    if sig.outcome == "profit":
                        true_bullish += 1
                    elif sig.outcome == "loss":
                        false_bullish += 1
                elif sig.direction == "put":
                    if sig.outcome == "profit":
                        true_bearish += 1
                    elif sig.outcome == "loss":
                        false_bearish += 1

            total_bullish = true_bullish + false_bullish
            total_bearish = true_bearish + false_bearish
            total_correct = true_bullish + true_bearish
            total_all = total_bullish + total_bearish

            return {
                "true_bullish": true_bullish,
                "false_bullish": false_bullish,
                "true_bearish": true_bearish,
                "false_bearish": false_bearish,
                "precision_bullish": true_bullish / total_bullish if total_bullish > 0 else 0.0,
                "precision_bearish": true_bearish / total_bearish if total_bearish > 0 else 0.0,
                "overall_accuracy": total_correct / total_all if total_all > 0 else 0.0,
            }

        if session is not None:
            return _run(session)
        with get_session() as s:
            return _run(s)

    # ── Helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _find_closest_price(hist, target_date: date) -> float | None:
        """Find the closing price on or nearest to target_date in a DataFrame."""
        if hist.empty:
            return None

        try:
            # Convert index to date objects for comparison
            dates = [
                idx.date() if hasattr(idx, 'date') else idx
                for idx in hist.index
            ]
            # Find closest date
            closest_idx = min(range(len(dates)), key=lambda i: abs((dates[i] - target_date).days))
            return float(hist.iloc[closest_idx]["Close"])
        except Exception:
            return None

    @staticmethod
    def _make_result(
        signal: Signal,
        entry_price: float,
        exit_price: float,
        price_change_pct: float,
        outcome: str,
        pnl: float,
    ) -> dict:
        return {
            "signal_id": signal.id,
            "ticker": signal.ticker,
            "direction": signal.direction,
            "entry_price": entry_price,
            "exit_price": exit_price,
            "price_change_pct": price_change_pct,
            "outcome": outcome,
            "estimated_pnl": pnl,
        }

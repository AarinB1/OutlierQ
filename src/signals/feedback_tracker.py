"""Feedback and accuracy tracking for past signals.

Evaluates expired option signals with Black-Scholes premium estimation
instead of proxying option P&L with the underlying's move:

  entry premium = BS(entry underlying, strike, time-to-expiry, r, IV)
  exit value    = intrinsic value of the option at expiry
  P&L %         = (exit - entry) / entry * 100, capped to [-100%, +2000%]

IV comes from the options chain at signal time (persisted on the signal
as ``entry_iv``). Documented fallback chain when it is unavailable:
  1. stored entry_iv (from the yfinance chain when the signal was created)
  2. realized volatility — annualized std-dev of the last <=30 daily log
     returns before signal creation (needs >=10 observations)
  3. DEFAULT_IV = 0.30

Signals whose price history has a gap larger than ``_MAX_DATE_GAP_DAYS``
around entry or expiry are left pending instead of being assigned a fake
outcome, so accuracy stats only contain honestly evaluated signals.
"""

import logging
import math
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT
from src.db.database import get_session
from src.db.tables import Event, Signal
from src.ingestion.market_fetcher import MarketFetcher
from src.signals.options_pricer import call_price, put_price

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

RISK_FREE_RATE = 0.04
DEFAULT_IV = 0.30
_MIN_ENTRY_PREMIUM = 0.01     # floor to avoid divide-by-zero on deep-OTM entries
_PNL_CAP_PCT = 2000.0         # long options can multi-bag; cap absurd penny-premium ratios
_MAX_DATE_GAP_DAYS = 5        # max distance between target date and nearest price bar
_REALIZED_VOL_LOOKBACK = 30   # daily returns used for the realized-vol IV fallback
_REALIZED_VOL_MIN_OBS = 10


class FeedbackTracker:
    """Evaluates past signals with Black-Scholes option P&L estimation."""

    def __init__(self, market_fetcher: MarketFetcher | None = None) -> None:
        self.market_fetcher = market_fetcher or MarketFetcher()

    def evaluate_signal(self, signal: Signal, session: Session) -> dict | None:
        """Evaluate a single expired signal. Returns None when the signal
        cannot be honestly evaluated (missing dates or price history gaps);
        such signals stay pending rather than polluting accuracy stats."""
        ticker = signal.ticker
        direction = signal.direction  # "call" / "put"
        strike = signal.suggested_strike

        try:
            expiry_date = date.fromisoformat(signal.suggested_expiry or "")
        except (ValueError, TypeError):
            logger.warning("Signal %s has invalid expiry '%s' — skipping", signal.id, signal.suggested_expiry)
            return None

        created_at = signal.created_at
        if created_at is None or strike is None or strike <= 0:
            logger.warning("Signal %s missing created_at/strike — skipping", signal.id)
            return None
        entry_date = created_at.date() if isinstance(created_at, datetime) else created_at

        # History window: lookback before entry for realized vol, through expiry.
        try:
            hist = self.market_fetcher.fetch_price_history(
                ticker,
                start=entry_date - timedelta(days=90),
                end=expiry_date + timedelta(days=7),
            )
        except Exception:
            logger.warning("Cannot fetch price history for %s — skipping", ticker)
            return None
        if hist is None or hist.empty:
            return None

        closes = self._closes_by_date(hist)
        entry_underlying = signal.entry_price or self._nearest_close(closes, entry_date)
        exit_underlying = self._nearest_close(closes, expiry_date)
        if entry_underlying is None or exit_underlying is None or entry_underlying <= 0:
            logger.info("Signal %s (%s): price history gap around entry/expiry — left pending", signal.id, ticker)
            return None

        iv, iv_source = self._estimate_iv(signal, closes, entry_date)

        T_entry = max((expiry_date - entry_date).days, 1) / 365.0
        price_fn = call_price if direction == "call" else put_price
        entry_premium = max(
            price_fn(entry_underlying, strike, T_entry, RISK_FREE_RATE, iv),
            _MIN_ENTRY_PREMIUM,
        )
        # At expiry the option is worth exactly its intrinsic value.
        if direction == "call":
            exit_value = max(exit_underlying - strike, 0.0)
        else:
            exit_value = max(strike - exit_underlying, 0.0)

        pnl_pct = (exit_value - entry_premium) / entry_premium * 100.0
        pnl_pct = max(-100.0, min(_PNL_CAP_PCT, pnl_pct))

        if exit_value <= 0:
            outcome = "expired"   # finished worthless
            pnl_pct = -100.0
        elif pnl_pct > 0:
            outcome = "profit"
        else:
            outcome = "loss"      # retained some value but below entry cost

        price_change_pct = (exit_underlying - entry_underlying) / entry_underlying
        return {
            "signal_id": signal.id,
            "ticker": ticker,
            "direction": direction,
            "entry_price": entry_underlying,
            "exit_price": exit_underlying,
            "price_change_pct": price_change_pct,
            "outcome": outcome,
            "estimated_pnl": round(pnl_pct, 2),
            "entry_premium": round(entry_premium, 4),
            "exit_value": round(exit_value, 4),
            "iv_used": round(iv, 4),
            "iv_source": iv_source,
        }

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
                if result is None:
                    continue

                signal.outcome = result["outcome"]
                signal.outcome_pnl = result["estimated_pnl"]
                s.add(signal)
                results.append(result)

            s.flush()
            logger.info("Evaluated %d/%d pending signals.", len(results), len(pending))
            return results

        if session is not None:
            return _run(session)
        with get_session() as s:
            results = _run(s)
        if results:
            self.refit_calibration()
        return results

    @staticmethod
    def refit_calibration(session: Session | None = None) -> dict:
        """Refit calibration after outcome changes have been committed."""
        from src.signals.confidence_calibrator import ConfidenceCalibrator

        if session is not None:
            return ConfidenceCalibrator().maybe_refit(session)
        with get_session() as s:
            return ConfidenceCalibrator().maybe_refit(s)

    def reevaluate_all(self, session: Session | None = None) -> dict:
        """Clear existing outcomes and re-evaluate every expired signal.

        Used to restate historical accuracy after the P&L model changed
        (stock-move proxy -> Black-Scholes). Returns a summary dict.
        """
        def _run(s: Session) -> dict:
            previously_evaluated = (
                s.query(Signal).filter(Signal.outcome.isnot(None)).count()
            )
            s.query(Signal).filter(Signal.outcome.isnot(None)).update(
                {Signal.outcome: None, Signal.outcome_pnl: None},
                synchronize_session=False,
            )
            s.flush()
            results = self.evaluate_all_pending(session=s)
            return {
                "previously_evaluated": previously_evaluated,
                "reevaluated": len(results),
                "results": results,
            }

        if session is not None:
            return _run(session)
        with get_session() as s:
            summary = _run(s)
        if summary["reevaluated"]:
            self.refit_calibration()
        return summary

    def get_accuracy_stats(self, session: Session | None = None) -> dict:
        """Compute overall accuracy metrics from all evaluated signals."""
        def _run(s: Session) -> dict:
            today_str = date.today().isoformat()

            # One query for signals joined to their event type (avoids per-signal lookups).
            rows = (
                s.query(Signal, Event.event_type)
                .outerjoin(Event, Signal.event_id == Event.id)
                .all()
            )
            all_signals = [sig for sig, _ in rows]
            event_type_by_signal = {sig.id: et or "unknown" for sig, et in rows}

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
                et = event_type_by_signal.get(sig.id, "unknown")
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

            true_bullish = 0   # predicted call, option profitable
            false_bullish = 0  # predicted call, option lost
            true_bearish = 0   # predicted put, option profitable
            false_bearish = 0  # predicted put, option lost

            for sig in evaluated:
                if sig.direction == "call":
                    if sig.outcome == "profit":
                        true_bullish += 1
                    elif sig.outcome in ("loss", "expired"):
                        false_bullish += 1
                elif sig.direction == "put":
                    if sig.outcome == "profit":
                        true_bearish += 1
                    elif sig.outcome in ("loss", "expired"):
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
    def _closes_by_date(hist) -> list[tuple[date, float]]:
        """Normalize a price-history DataFrame to sorted (date, close) pairs."""
        pairs: list[tuple[date, float]] = []
        for idx, close in hist["Close"].items():
            d = idx.date() if hasattr(idx, "date") else idx
            if not isinstance(d, date):
                continue
            try:
                pairs.append((d, float(close)))
            except (TypeError, ValueError):
                continue
        pairs.sort(key=lambda p: p[0])
        return pairs

    @staticmethod
    def _nearest_close(closes: list[tuple[date, float]], target: date) -> float | None:
        """Close nearest to *target*, or None when the gap exceeds the guard."""
        if not closes:
            return None
        best_date, best_close = min(closes, key=lambda p: abs((p[0] - target).days))
        if abs((best_date - target).days) > _MAX_DATE_GAP_DAYS:
            return None
        return best_close

    @staticmethod
    def _estimate_iv(
        signal: Signal, closes: list[tuple[date, float]], entry_date: date
    ) -> tuple[float, str]:
        """IV fallback chain: stored chain IV -> realized vol -> DEFAULT_IV."""
        stored = signal.entry_iv
        if stored is not None and 0.01 <= stored <= 5.0:
            return float(stored), "chain"

        prior = [c for d, c in closes if d < entry_date][-(_REALIZED_VOL_LOOKBACK + 1):]
        if len(prior) >= _REALIZED_VOL_MIN_OBS + 1:
            returns = [
                math.log(b / a) for a, b in zip(prior, prior[1:]) if a > 0 and b > 0
            ]
            if len(returns) >= _REALIZED_VOL_MIN_OBS:
                mean = sum(returns) / len(returns)
                var = sum((r - mean) ** 2 for r in returns) / max(len(returns) - 1, 1)
                realized = math.sqrt(var) * math.sqrt(252)
                if realized > 0:
                    return max(0.05, min(3.0, realized)), "realized_vol"

        return DEFAULT_IV, "default"

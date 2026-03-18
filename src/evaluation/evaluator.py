"""Options-aware signal evaluation using Black-Scholes pricing.

Replaces the stock-price-proxy P&L with realistic options premium changes
that account for IV, time decay (theta), and moneyness.
"""

import logging
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from src.db.database import SessionLocal
from src.db.tables import Signal
from src.ingestion.market_fetcher import MarketFetcher
from src.signals.options_pricer import price_option

logger = logging.getLogger(__name__)

DEFAULT_RISK_FREE_RATE = 0.04


class OptionsEvaluator:
    """Evaluates signal P&L using Black-Scholes pricing."""

    def __init__(
        self,
        market_fetcher: MarketFetcher | None = None,
        risk_free_rate: float = DEFAULT_RISK_FREE_RATE,
    ) -> None:
        self.market = market_fetcher or MarketFetcher()
        self.r = risk_free_rate

    def evaluate_signal(self, signal: Signal, session: Session) -> dict | None:
        """Evaluate a single signal using options pricing.

        Returns dict with outcome, pnl, greeks at entry/exit, or None if
        the signal cannot be evaluated yet.
        """
        if signal.outcome is not None:
            return None  # already evaluated

        expiry_str = signal.suggested_expiry
        if not expiry_str:
            return None

        try:
            expiry_date = date.fromisoformat(expiry_str)
        except ValueError:
            return None

        if expiry_date > date.today():
            return None  # not expired yet

        ticker = signal.ticker
        strike = signal.suggested_strike
        direction = signal.direction  # "call" or "put"

        if strike is None or strike <= 0:
            return None

        # Get entry price (price at signal creation)
        created_at = signal.created_at
        if not created_at:
            return None

        try:
            current_price = self.market.get_current_price(ticker)
        except Exception:
            logger.warning("Cannot get price for %s — skip evaluation", ticker)
            return None

        # Estimate entry price from historical data
        try:
            hist = self.market.fetch_price_history(ticker, period="3mo")
            if hist.empty:
                return None
            # Find closest date to signal creation
            entry_price = float(hist["Close"].iloc[0])
            if created_at:
                target = created_at.date() if hasattr(created_at, "date") else created_at
                diffs = (hist.index.date - target)
                # Find the index with the smallest absolute difference
                abs_diffs = [abs(d.days) if hasattr(d, 'days') else abs(d) for d in diffs]
                closest_idx = abs_diffs.index(min(abs_diffs))
                entry_price = float(hist["Close"].iloc[closest_idx])
        except Exception:
            logger.warning("Cannot get entry price for %s", ticker)
            return None

        exit_price = current_price

        # Estimate IV from contract data or use default
        iv = 0.30  # default

        # Time to expiry at entry (in years)
        if isinstance(created_at, datetime):
            entry_date = created_at.date()
        else:
            entry_date = created_at
        T_entry = max((expiry_date - entry_date).days, 1) / 365.0
        T_exit = 0.0  # at expiry

        option_type = direction  # "call" or "put"

        # Calculate entry and exit premiums
        entry_greeks = price_option(entry_price, strike, T_entry, self.r, iv, option_type)
        exit_greeks = price_option(exit_price, strike, T_exit, self.r, iv, option_type)

        entry_premium = entry_greeks["price"]
        exit_premium = exit_greeks["price"]

        if entry_premium <= 0:
            entry_premium = 0.01  # avoid div by zero

        pnl_per_contract = (exit_premium - entry_premium) * 100  # 100 shares per contract
        pnl_pct = ((exit_premium - entry_premium) / entry_premium) * 100

        # Classify outcome
        if pnl_pct > 5:
            outcome = "profit"
        elif pnl_pct < -50:
            outcome = "expired"
        elif pnl_pct < -5:
            outcome = "loss"
        else:
            outcome = "expired"

        # Update signal
        signal.outcome = outcome
        signal.outcome_pnl = round(pnl_pct, 2)
        session.add(signal)

        return {
            "signal_id": signal.id,
            "ticker": ticker,
            "direction": direction,
            "outcome": outcome,
            "pnl_pct": round(pnl_pct, 2),
            "pnl_per_contract": round(pnl_per_contract, 2),
            "entry_premium": round(entry_premium, 4),
            "exit_premium": round(exit_premium, 4),
            "entry_greeks": entry_greeks,
            "exit_greeks": exit_greeks,
            "entry_price": entry_price,
            "exit_price": exit_price,
            "strike": strike,
            "iv_used": iv,
        }

    def evaluate_all_pending(self, session: Session | None = None) -> list[dict]:
        """Evaluate all pending signals."""
        close_session = False
        if session is None:
            session = SessionLocal()
            close_session = True

        try:
            pending = (
                session.query(Signal)
                .filter(Signal.outcome.is_(None))
                .all()
            )
            results = []
            for sig in pending:
                result = self.evaluate_signal(sig, session)
                if result:
                    results.append(result)
            if results:
                session.commit()
            return results
        finally:
            if close_session:
                session.close()

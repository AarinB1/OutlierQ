"""Historical price data service with in-memory caching."""

import logging
import time
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf
from sqlalchemy.orm import Session

from src.db.database import SessionLocal
from src.db.tables import Event, Signal

logger = logging.getLogger(__name__)

CACHE_TTL = 300  # 5 minutes


class StockDataService:
    """Serves historical price data, company info, and chart overlays."""

    def __init__(self) -> None:
        self._cache: dict[str, tuple[object, float]] = {}

    def _get_cached(self, key: str) -> object | None:
        entry = self._cache.get(key)
        if entry and (time.time() - entry[1]) < CACHE_TTL:
            return entry[0]
        return None

    def _set_cached(self, key: str, value: object) -> None:
        self._cache[key] = (value, time.time())

    # ── Price history ──────────────────────────────────────────────────

    def get_price_history(
        self,
        ticker: str,
        period: str = "6mo",
        interval: str = "1d",
    ) -> list[dict]:
        """Return OHLCV price history as a list of dicts."""
        cache_key = f"history:{ticker}:{period}:{interval}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        stock = yf.Ticker(ticker)
        df = stock.history(period=period, interval=interval)
        if df.empty:
            return []

        records = []
        for ts, row in df.iterrows():
            records.append({
                "date": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
            })

        self._set_cached(cache_key, records)
        return records

    def get_intraday(self, ticker: str) -> list[dict]:
        """Return intraday 5-minute data for the current/last trading day."""
        return self.get_price_history(ticker, period="1d", interval="5m")

    # ── Company info ───────────────────────────────────────────────────

    def get_info(self, ticker: str) -> dict:
        """Return basic company information."""
        cache_key = f"info:{ticker}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        stock = yf.Ticker(ticker)
        info = stock.info or {}

        result = {
            "ticker": ticker,
            "name": info.get("shortName") or info.get("longName") or ticker,
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "market_cap": info.get("marketCap"),
            "current_price": info.get("currentPrice") or info.get("regularMarketPrice"),
            "previous_close": info.get("previousClose") or info.get("regularMarketPreviousClose"),
            "day_high": info.get("dayHigh"),
            "day_low": info.get("dayLow"),
            "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
            "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
            "avg_volume": info.get("averageVolume"),
            "beta": info.get("beta"),
        }

        price = result["current_price"]
        prev = result["previous_close"]
        if price and prev and prev != 0:
            result["change"] = round(price - prev, 2)
            result["change_percent"] = round((price - prev) / prev * 100, 2)
        else:
            result["change"] = None
            result["change_percent"] = None

        self._set_cached(cache_key, result)
        return result

    # Backward-compatible alias used by existing tests/callers.
    def get_company_info(self, ticker: str) -> dict:
        return self.get_info(ticker)

    # ── Key stats ──────────────────────────────────────────────────────

    def get_stats(self, ticker: str) -> dict:
        """Return computed stats: weekly/monthly/YTD returns, volatility."""
        cache_key = f"stats:{ticker}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        stock = yf.Ticker(ticker)
        df = stock.history(period="1y")
        if df.empty or len(df) < 2:
            return {
                "weekly_return": None,
                "monthly_return": None,
                "ytd_return": None,
                "volatility_30d": None,
            }

        closes = df["Close"]
        current = float(closes.iloc[-1])

        def pct_change(n: int) -> float | None:
            if len(closes) > n:
                return round((current / float(closes.iloc[-n - 1]) - 1) * 100, 2)
            return None

        year_start = df[df.index >= f"{datetime.now().year}-01-01"]
        ytd = None
        if not year_start.empty:
            ytd = round((current / float(year_start["Close"].iloc[0]) - 1) * 100, 2)

        vol = None
        if len(closes) >= 30:
            returns = closes.pct_change().dropna().tail(30)
            vol = round(float(returns.std() * (252 ** 0.5) * 100), 2)

        result = {
            "weekly_return": pct_change(5),
            "monthly_return": pct_change(21),
            "ytd_return": ytd,
            "volatility_30d": vol,
        }

        self._set_cached(cache_key, result)
        return result

    # Backward-compatible alias used by existing tests/callers.
    def get_key_stats(self, ticker: str) -> dict:
        return self.get_stats(ticker)

    # ── Chart overlays ─────────────────────────────────────────────────

    def get_signals_overlay(
        self, ticker: str, session: Session | None = None
    ) -> list[dict]:
        """Return signals for this ticker, formatted for chart overlay."""
        close_session = False
        if session is None:
            session = SessionLocal()
            close_session = True
        try:
            signals = (
                session.query(Signal)
                .filter(Signal.ticker == ticker.upper())
                .order_by(Signal.created_at.desc())
                .limit(50)
                .all()
            )
            return [
                {
                    "id": s.id,
                    "date": s.created_at.isoformat() if s.created_at else None,
                    "direction": s.direction,
                    "strike": s.suggested_strike,
                    "expiry": s.suggested_expiry,
                    "confidence": s.confidence,
                    "outcome": s.outcome,
                    "pnl": s.outcome_pnl,
                }
                for s in signals
            ]
        finally:
            if close_session:
                session.close()

    def get_events_overlay(
        self, ticker: str, session: Session | None = None
    ) -> list[dict]:
        """Return events for this ticker, formatted for chart overlay."""
        close_session = False
        if session is None:
            session = SessionLocal()
            close_session = True
        try:
            events = (
                session.query(Event)
                .filter(Event.ticker == ticker.upper())
                .order_by(Event.detected_at.desc())
                .limit(50)
                .all()
            )
            return [
                {
                    "id": e.id,
                    "date": e.detected_at.isoformat() if e.detected_at else None,
                    "event_type": e.event_type,
                    "direction": e.direction,
                    "confidence": e.confidence,
                }
                for e in events
            ]
        finally:
            if close_session:
                session.close()

    def get_chart_data(
        self, ticker: str, period: str = "6mo", session: Session | None = None
    ) -> dict:
        """Return combined price history + signal/event overlays for charting."""
        return {
            "prices": self.get_price_history(ticker, period=period),
            "signals": self.get_signals_overlay(ticker, session=session),
            "events": self.get_events_overlay(ticker, session=session),
        }

    def get_summary(
        self, ticker: str, session: Session | None = None
    ) -> dict:
        """Return a full summary: info + stats + recent signals."""
        return {
            "info": self.get_info(ticker),
            "stats": self.get_stats(ticker),
            "signals": self.get_signals_overlay(ticker, session=session),
            "events": self.get_events_overlay(ticker, session=session),
        }

    # Backward-compatible alias used by existing tests/callers.
    def get_ticker_summary(
        self, ticker: str, session: Session | None = None
    ) -> dict:
        return self.get_summary(ticker, session=session)

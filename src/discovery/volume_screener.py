"""Volume screener — finds stocks with unusual trading volume."""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import pandas as pd
import yfinance as yf

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

VOLUME_RATIO_THRESHOLD = 3.0
PRICE_MOVE_PCT_THRESHOLD = 5.0
WATCHLIST_CAP = 300
NEWS_DISCOVERY_DAYS = 7

# Curated small/mid-cap watchlist across sectors
DEFAULT_WATCHLIST = [
    # Biotech
    "MRNA", "BNTX", "CRSP", "EDIT", "NTLA", "BEAM", "VERV", "ARCT", "FATE", "RCKT",
    "SANA", "ABCL", "GILD",
    # Small-cap tech
    "PLTR", "IONQ", "RKLB", "AFRM", "HOOD", "SOFI", "UPST", "CLOV", "OPEN", "DNUT",
    # EV/Energy
    "LCID", "RIVN", "QS", "CHPT", "BLNK", "FCEL", "PLUG", "RUN",
    # Cannabis
    "TLRY", "CGC", "ACB", "SNDL", "MSOS",
    # Retail/Consumer
    "GME", "AMC", "DDS", "CATO",
    # Mining/Materials
    "MP", "LAC", "LTHM", "ALB",
]


class VolumeScreener:
    """Finds stocks with unusual trading volume and price movement."""

    def __init__(self, market_fetcher: Any, db_session: Any = None) -> None:
        self.market_fetcher = market_fetcher
        self.db_session = db_session

    def get_watchlist(self) -> list[str]:
        """Dynamic watchlist: base list + tickers from news discovery (last 7d) + tickers that generated signals, capped at 300."""
        custom = os.getenv("CUSTOM_WATCHLIST")
        if custom:
            tickers = [t.strip().upper() for t in custom.split(",") if t.strip()]
            if tickers:
                logger.info("Using CUSTOM_WATCHLIST: %d tickers", len(tickers))
                return tickers[:WATCHLIST_CAP]

        base = list(dict.fromkeys(DEFAULT_WATCHLIST))
        from_news: list[str] = []
        from_signals: list[str] = []

        def _query(sess: Any) -> None:
            from src.discovery.discovery_db import DiscoveredTicker
            from src.db.tables import Signal

            nonlocal from_news, from_signals
            cutoff = datetime.now(timezone.utc) - timedelta(days=NEWS_DISCOVERY_DAYS)
            news_rows = (
                sess.query(DiscoveredTicker.ticker)
                .filter(
                    DiscoveredTicker.discovered_at >= cutoff,
                    DiscoveredTicker.discovery_method.in_(("news_scanner", "both")),
                )
                .distinct()
                .all()
            )
            from_news = [r[0].upper() for r in news_rows]
            signal_tickers = sess.query(Signal.ticker).distinct().all()
            from_signals = [r[0].upper() for r in signal_tickers]

        try:
            if self.db_session is not None:
                _query(self.db_session)
            else:
                from src.db.database import get_session
                with get_session() as s:
                    _query(s)
        except Exception as e:
            logger.warning("Could not load dynamic watchlist from DB: %s", e)

        combined = list(dict.fromkeys(base + from_news + from_signals))
        capped = combined[:WATCHLIST_CAP]
        logger.info(
            "Watchlist: %d base + %d from news + %d from signals = %d total (capped %d)",
            len(base), len(from_news), len(from_signals), len(combined), len(capped),
        )
        return capped

    def screen(self) -> list[dict]:
        """Check volume and price for watchlist; return tickers with 3x+ volume or 5%+ move."""
        watchlist = self.get_watchlist()
        if not watchlist:
            return []

        try:
            hist = yf.download(
                watchlist,
                period="1mo",
                interval="1d",
                group_by="ticker",
                auto_adjust=True,
                progress=False,
                threads=False,
            )
        except Exception as e:
            logger.warning("yfinance download failed: %s", e)
            return []

        if hist.empty:
            return []

        now = datetime.now(timezone.utc)
        results: list[dict] = []

        # Single ticker: flat columns (Open, High, Low, Close, Volume)
        if len(watchlist) == 1:
            ticker = watchlist[0]
            df = hist.copy()
            if len(df) < 2:
                return []
            vol = df["Volume"] if "Volume" in df.columns else pd.Series(dtype=float)
            close = df["Close"] if "Close" in df.columns else pd.Series(dtype=float)
            if vol.empty or close.empty:
                return []
            today_vol = int(vol.iloc[-1])
            avg_vol = vol.iloc[:-1].mean()
            today_close = float(close.iloc[-1])
            prev_close = float(close.iloc[-2])
            pct = ((today_close - prev_close) / prev_close * 100) if prev_close else 0
            ratio = (today_vol / avg_vol) if avg_vol and avg_vol > 0 else 0
            if ratio >= VOLUME_RATIO_THRESHOLD or abs(pct) >= PRICE_MOVE_PCT_THRESHOLD:
                results.append({
                    "ticker": ticker,
                    "volume_ratio": round(float(ratio), 2),
                    "price_change_pct": round(float(pct), 2),
                    "current_price": round(today_close, 2),
                    "avg_volume": int(avg_vol),
                    "today_volume": today_vol,
                    "discovery_method": "volume_screener",
                    "discovered_at": now,
                })
            logger.info(
                "Volume screen: checked %d tickers, %d flagged with unusual activity",
                len(watchlist), len(results),
            )
            return results

        # Multi-ticker: columns are (Ticker, OHLCV) with group_by="ticker"
        for ticker in watchlist:
            try:
                if isinstance(hist.columns, pd.MultiIndex):
                    if ticker not in hist.columns.get_level_values(0):
                        continue
                    sub = hist[ticker].copy()
                else:
                    sub = hist.copy()
                if sub.empty or len(sub) < 2:
                    continue
                vol = sub["Volume"] if "Volume" in sub.columns else pd.Series(dtype=float)
                close = sub["Close"] if "Close" in sub.columns else pd.Series(dtype=float)
                if vol.empty or close.empty:
                    continue
                today_vol = int(vol.iloc[-1])
                avg_vol = vol.iloc[:-1].mean()
                today_close = float(close.iloc[-1])
                prev_close = float(close.iloc[-2])
                pct = ((today_close - prev_close) / prev_close * 100) if prev_close else 0
                ratio = (today_vol / avg_vol) if avg_vol and avg_vol > 0 else 0
                if ratio >= VOLUME_RATIO_THRESHOLD or abs(pct) >= PRICE_MOVE_PCT_THRESHOLD:
                    results.append({
                        "ticker": ticker,
                        "volume_ratio": round(float(ratio), 2),
                        "price_change_pct": round(float(pct), 2),
                        "current_price": round(today_close, 2),
                        "avg_volume": int(avg_vol),
                        "today_volume": today_vol,
                        "discovery_method": "volume_screener",
                        "discovered_at": now,
                    })
            except Exception as e:
                logger.debug("Volume screen skip %s: %s", ticker, e)
                continue

        logger.info(
            "Volume screen: checked %d tickers, %d flagged with unusual activity",
            len(watchlist), len(results),
        )
        return results

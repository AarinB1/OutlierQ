"""Broad news scanner — discovers tickers from general financial news via mention spikes."""

import logging
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Finnhub general_news categories
NEWS_CATEGORIES = ["general", "forex", "crypto", "merger"]
RATE_LIMIT_DELAY = 1.0  # seconds between category requests
VALID_TICKER_CACHE_TTL = 24 * 3600  # 24 hours
NEWS_LOOKBACK_HOURS = 6
MIN_MENTIONS = 3

# Common words that look like tickers — exclude from extraction
FALSE_POSITIVE_TICKERS = frozenset({
    "A", "I", "IT", "AT", "GO", "UP", "AI", "AM", "BE", "DO", "HE", "IF", "IN", "IS",
    "ME", "MY", "NO", "OF", "OK", "ON", "OR", "SO", "TO", "TV", "UK", "US", "WE",
    "CEO", "FDA", "SEC", "IPO", "ETF", "GDP", "NYSE", "USA", "API", "LLC", "INC",
    "CFO", "CTO", "COO", "NA", "PM", "AM", "EU", "PR", "HR", "IR", "OT", "DD",
})

# S&P 500 subset — exclude these so we surface small/mid caps. Extend or fetch from API as needed.
SP500_TICKERS = frozenset({
    "AAPL", "MSFT", "GOOG", "GOOGL", "AMZN", "NVDA", "META", "BRK.B", "BRK-B",
    "UNH", "JNJ", "JPM", "V", "PG", "XOM", "MA", "HD", "CVX", "MRK", "ABBV",
    "PEP", "KO", "COST", "WMT", "MCD", "CSCO", "ACN", "ABT", "TMO", "AVGO",
    "DHR", "NEE", "NKE", "BMY", "PM", "TXN", "UNP", "RTX", "HON", "UPS",
    "LOW", "INTC", "AMGN", "QCOM", "INTU", "SPGI", "CAT", "AXP", "SBUX",
    "DE", "GILD", "ADBE", "MDT", "LMT", "BKNG", "VZ", "AMAT", "REGN", "CVS",
    "T", "CMCSA", "PGR", "CI", "PLD", "SO", "DUK", "BDX", "BSX", "EOG",
    "SLB", "MMC", "SRE", "APD", "APTV", "AON", "ICE", "ITW", "EQIX", "ORCL",
    "IBM", "CRM", "NOW", "ADP", "GE", "PANW", "AMD", "ISRG", "BLK", "GS",
    "MS", "SCHW", "C", "BA", "MU", "ADI", "TJX", "ZTS", "CB", "MDLZ",
    "CL", "MO", "WM", "BDX", "APD", "ECL", "SHW", "NOC", "FCX", "MMC",
    "PNC", "USB", "TFC", "COF", "AXP", "AIG", "MET", "AFL", "TRV", "ALL",
    "F", "GM", "TSLA", "DIS", "NFLX", "PYPL", "ADSK", "SNPS", "CDNS", "KLAC",
    "LRCX", "MRVL", "NXPI", "MCHP", "FTNT", "WDAY", "TEAM", "CRWD", "DDOG",
    "SNOW", "NET", "ZM", "DOCU", "ROKU", "SPLK", "CDW", "ANSS", "KEYS",
    "APH", "TT", "EMR", "ETN", "ROK", "CARR", "OTIS", "JCI", "PCAR", "CMI",
    "FDX", "LEN", "DHI", "NVR", "PHM", "TOL", "HIG", "AIG", "PRU", "AFL",
    "CINF", "HBAN", "RF", "FITB", "KEY", "CFG", "MTB", "STI", "BK", "STT",
    "NDAQ", "CME", "MCO", "SPGI", "FIS", "GPN", "PYPL", "SQ", "V", "MA",
    "AXP", "COF", "DFS", "SYF", "ALLY", "BAC", "C", "JPM", "WFC", "GS", "MS",
})


class BroadNewsScanner:
    """Scans general financial news to discover tickers with sudden coverage spikes."""

    def __init__(self, finnhub_client: Any, db_session: Session | None = None) -> None:
        self.client = finnhub_client
        self.db_session = db_session
        self._valid_tickers: set[str] | None = None
        self._valid_tickers_ts: float = 0.0
        self._cache_dir = Path(__file__).resolve().parent.parent.parent / ".cache"
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def fetch_general_news(self) -> list[dict]:
        """Fetch from multiple Finnhub news categories, deduplicate by URL."""
        seen_urls: set[str] = set()
        all_articles: list[dict] = []

        for category in NEWS_CATEGORIES:
            try:
                raw = self.client.general_news(category, min_id=0)
                if not raw:
                    continue
                for item in raw:
                    url = item.get("url") or ""
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        all_articles.append(item)
            except Exception as e:
                logger.warning("Finnhub general_news(%s) failed: %s", category, e)
            time.sleep(RATE_LIMIT_DELAY)

        logger.info("Fetched %d unique articles from %d categories", len(all_articles), len(NEWS_CATEGORIES))
        return all_articles

    def get_valid_tickers(self) -> set[str]:
        """Return cached set of valid US stock tickers (refresh every 24h)."""
        now = time.time()
        if self._valid_tickers is not None and (now - self._valid_tickers_ts) < VALID_TICKER_CACHE_TTL:
            return self._valid_tickers

        cache_file = self._cache_dir / "us_tickers.txt"
        if cache_file.exists() and (now - cache_file.stat().st_mtime) < VALID_TICKER_CACHE_TTL:
            self._valid_tickers = set(cache_file.read_text().strip().splitlines())
            self._valid_tickers_ts = now
            logger.debug("Loaded %d valid tickers from file cache", len(self._valid_tickers))
            return self._valid_tickers

        try:
            symbols = self.client.stock_symbols("US")
            tickers = set()
            for s in (symbols or []):
                sym = (s.get("symbol") or "").strip().upper()
                if sym and 1 <= len(sym) <= 5:
                    tickers.add(sym)
            self._valid_tickers = tickers
            self._valid_tickers_ts = now
            cache_file.write_text("\n".join(sorted(tickers)))
            logger.info("Refreshed valid ticker cache: %d symbols", len(tickers))
            return tickers
        except Exception as e:
            logger.warning("Failed to fetch US symbols: %s; using file cache if present", e)
            if cache_file.exists():
                self._valid_tickers = set(cache_file.read_text().strip().splitlines())
                self._valid_tickers_ts = now
                return self._valid_tickers
            # Fallback: allow any 1-5 letter uppercase (no validation)
            self._valid_tickers = set()
            return self._valid_tickers

    def get_sp500_tickers(self) -> set[str]:
        """Return set of S&P 500 tickers to exclude from discovery."""
        return set(SP500_TICKERS)

    def extract_tickers(self, headline: str, summary: str) -> list[str]:
        """Extract valid ticker symbols from headline and summary text."""
        text = f"{headline or ''} {summary or ''}".upper()
        valid = self.get_valid_tickers()
        sp500 = self.get_sp500_tickers()
        found: set[str] = set()

        # $TICKER
        for m in re.finditer(r"\$([A-Z]{1,5})\b", text):
            sym = m.group(1)
            if sym not in FALSE_POSITIVE_TICKERS and (not valid or sym in valid):
                found.add(sym)

        # (NASDAQ: TICKER) or (NYSE: TICKER)
        for m in re.finditer(r"\((?:NASDAQ|NYSE)\s*:\s*([A-Z]{1,5})\)", text, re.IGNORECASE):
            sym = m.group(1).upper()
            if sym not in FALSE_POSITIVE_TICKERS and (not valid or sym in valid):
                found.add(sym)

        # Standalone 2-5 letter uppercase words (potential tickers)
        for m in re.finditer(r"\b([A-Z]{2,5})\b", text):
            sym = m.group(1)
            if (
                sym not in FALSE_POSITIVE_TICKERS
                and (not valid or sym in valid)
            ):
                found.add(sym)

        return list(found)

    def scan(self) -> list[dict]:
        """Main entry: fetch general news, extract tickers, return non-S&P500 with >= MIN_MENTIONS."""
        articles = self.fetch_general_news()
        cutoff = datetime.now(timezone.utc) - timedelta(hours=NEWS_LOOKBACK_HOURS)

        mention_count: dict[str, int] = {}
        sources: dict[str, list[str]] = {}
        sample_headlines: dict[str, list[str]] = {}

        for item in articles:
            ts = item.get("datetime") or 0
            pub = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else datetime.now(timezone.utc)
            if pub < cutoff:
                continue
            headline = item.get("headline") or ""
            summary = item.get("summary") or ""
            tickers = self.extract_tickers(headline, summary)
            for t in tickers:
                mention_count[t] = mention_count.get(t, 0) + 1
                src = item.get("source") or "unknown"
                if src not in (sources.get(t) or []):
                    sources.setdefault(t, []).append(src)
                head_list = sample_headlines.setdefault(t, [])
                if headline and headline not in head_list and len(head_list) < 3:
                    head_list.append(headline[:200])

        sp500 = self.get_sp500_tickers()
        valid = self.get_valid_tickers()
        results: list[dict] = []
        for ticker, count in mention_count.items():
            if count < MIN_MENTIONS:
                continue
            if ticker in sp500:
                continue
            if valid and ticker not in valid:
                continue
            results.append({
                "ticker": ticker.upper(),
                "mention_count": count,
                "sources": sources.get(ticker, [])[:5],
                "sample_headlines": (sample_headlines.get(ticker) or [])[:3],
                "discovery_method": "news_scanner",
                "discovered_at": datetime.now(timezone.utc),
            })

        unique_tickers = len(mention_count)
        non_sp500_3plus = len(results)
        logger.info(
            "Broad scan found %d articles, extracted %d unique tickers, %d non-S&P500 with %d+ mentions",
            len(articles), unique_tickers, non_sp500_3plus, MIN_MENTIONS,
        )
        return results

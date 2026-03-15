"""SEC EDGAR filing monitor for 8-K and Form 4 activity."""

from __future__ import annotations

import json
import logging
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import requests

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_CIK_MAP_URL = "https://www.sec.gov/files/company_tickers.json"
_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60
_REQUEST_DELAY_SECONDS = 0.15

_HIGHLY_BEARISH_ITEMS = {"4.02", "3.01", "2.06", "2.05"}
_MODERATELY_BEARISH_ITEMS = {"5.02", "1.02", "4.01"}
_POTENTIALLY_BULLISH_ITEMS = {"1.01", "2.01"}
_NEUTRAL_ITEMS = {"7.01", "8.01", "5.03"}


class EdgarMonitor:
    """Monitors recent SEC filings that can front-run public news coverage."""

    def __init__(self, user_agent: str = "OutlierQ/1.0 (outlierq@example.com)") -> None:
        self.user_agent = user_agent
        self._cik_map: dict[str, dict[str, str]] | None = None
        self._last_request_ts = 0.0
        cache_dir = Path(__file__).resolve().parents[2] / ".cache"
        self._cache_path = cache_dir / "company_tickers.json"
        logger.info("EdgarMonitor initialized")

    def _request_json(self, url: str) -> dict[str, Any] | None:
        now = time.time()
        elapsed = now - self._last_request_ts
        if elapsed < _REQUEST_DELAY_SECONDS:
            time.sleep(_REQUEST_DELAY_SECONDS - elapsed)
        headers = {"User-Agent": self.user_agent, "Accept": "application/json"}
        try:
            logger.info("SEC request: %s", url)
            resp = requests.get(url, headers=headers, timeout=15)
            self._last_request_ts = time.time()
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.warning("SEC request failed for %s: %s", url, exc)
            return None

    def _load_cached_cik_map(
        self, ignore_ttl: bool = False
    ) -> dict[str, dict[str, str]] | None:
        if not self._cache_path.exists():
            return None
        try:
            data = json.loads(self._cache_path.read_text())
            fetched_at = float(data.get("fetched_at", 0))
            if not ignore_ttl and time.time() - fetched_at > _CACHE_TTL_SECONDS:
                return None
            cik_map = data.get("map", {})
            if isinstance(cik_map, dict):
                return {str(k): v for k, v in cik_map.items()}
        except Exception as exc:
            logger.warning("Failed reading CIK cache: %s", exc)
        return None

    def _save_cik_map(self, cik_map: dict[str, dict[str, str]]) -> None:
        try:
            self._cache_path.parent.mkdir(parents=True, exist_ok=True)
            payload = {"fetched_at": time.time(), "map": cik_map}
            self._cache_path.write_text(json.dumps(payload))
        except Exception as exc:
            logger.warning("Failed writing CIK cache: %s", exc)

    def _get_cik_map(self) -> dict[str, dict[str, str]]:
        """Fetch ticker->CIK map with local cache fallback."""
        if self._cik_map is not None:
            return self._cik_map

        cached = self._load_cached_cik_map()
        if cached is not None:
            self._cik_map = cached
            return cached

        raw = self._request_json(_CIK_MAP_URL)
        if raw is None:
            fallback = self._load_cached_cik_map(ignore_ttl=True)
            if fallback is not None:
                self._cik_map = fallback
                return fallback
            logger.warning("Unable to fetch CIK map and no cache exists")
            self._cik_map = {}
            return {}

        cik_map: dict[str, dict[str, str]] = {}
        for _, row in raw.items():
            try:
                ticker = str(row["ticker"]).upper()
                cik_num = str(int(row["cik_str"])).zfill(10)
                name = str(row["title"])
            except Exception:
                continue
            cik_map[ticker] = {"cik": cik_num, "name": name}

        self._save_cik_map(cik_map)
        self._cik_map = cik_map
        return cik_map

    def get_cik(self, ticker: str) -> str | None:
        """Return a zero-padded CIK for ticker, if available."""
        info = self._get_cik_map().get(ticker.upper())
        if not info:
            return None
        return info.get("cik")

    def _parse_recent_filings(self, submissions: dict[str, Any]) -> list[dict[str, Any]]:
        recent = submissions.get("filings", {}).get("recent", {})
        forms = recent.get("form", []) or []
        filing_dates = recent.get("filingDate", []) or []
        accession_numbers = recent.get("accessionNumber", []) or []
        descriptions = recent.get("primaryDocDescription", []) or []
        items = recent.get("items", []) or []
        primary_docs = recent.get("primaryDocument", []) or []
        max_len = max(
            len(forms),
            len(filing_dates),
            len(accession_numbers),
            len(descriptions),
            len(items),
            len(primary_docs),
            0,
        )
        parsed: list[dict[str, Any]] = []
        for idx in range(max_len):
            parsed.append(
                {
                    "form": forms[idx] if idx < len(forms) else "",
                    "filing_date": filing_dates[idx] if idx < len(filing_dates) else "",
                    "accession_number": accession_numbers[idx] if idx < len(accession_numbers) else "",
                    "description": descriptions[idx] if idx < len(descriptions) else "",
                    "items_raw": items[idx] if idx < len(items) else "",
                    "primary_document": primary_docs[idx] if idx < len(primary_docs) else "",
                }
            )
        return parsed

    def _filing_url(self, cik: str, accession_number: str, primary_document: str) -> str:
        accession_nodash = accession_number.replace("-", "")
        cik_int = str(int(cik))
        if primary_document:
            return (
                f"https://www.sec.gov/Archives/edgar/data/{cik_int}/"
                f"{accession_nodash}/{primary_document}"
            )
        return f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession_nodash}/"

    def _load_submissions(self, ticker: str) -> tuple[str, dict[str, Any]] | None:
        cik = self.get_cik(ticker)
        if cik is None:
            logger.warning("No CIK mapping found for %s", ticker.upper())
            return None
        submissions_url = _SUBMISSIONS_URL.format(cik=cik)
        submissions = self._request_json(submissions_url)
        if submissions is None:
            return None
        return cik, submissions

    def fetch_recent_8k(self, ticker: str, days: int = 3) -> list[dict[str, Any]]:
        """Fetch recent 8-K filings and parse item numbers/descriptions."""
        loaded = self._load_submissions(ticker)
        if loaded is None:
            return []
        cik, submissions = loaded
        cutoff = date.today() - timedelta(days=days)
        filings: list[dict[str, Any]] = []
        for row in self._parse_recent_filings(submissions):
            if row["form"] != "8-K":
                continue
            try:
                filing_day = datetime.strptime(row["filing_date"], "%Y-%m-%d").date()
            except ValueError:
                continue
            if filing_day < cutoff:
                continue
            items = [
                item.strip()
                for item in str(row["items_raw"]).split(",")
                if item.strip()
            ]
            filings.append(
                {
                    "filing_date": row["filing_date"],
                    "form_type": "8-K",
                    "description": row["description"] or "Current report",
                    "url": self._filing_url(
                        cik,
                        str(row["accession_number"]),
                        str(row["primary_document"]),
                    ),
                    "items": items,
                }
            )
        filings.sort(key=lambda f: f["filing_date"], reverse=True)
        return filings

    def fetch_recent_form4(self, ticker: str, days: int = 7) -> list[dict[str, Any]]:
        """Fetch recent Form 4 filings as a proxy for insider activity."""
        loaded = self._load_submissions(ticker)
        if loaded is None:
            return []
        cik, submissions = loaded
        cutoff = date.today() - timedelta(days=days)
        filer_name = str(submissions.get("name", "")).strip() or ticker.upper()
        filings: list[dict[str, Any]] = []
        for row in self._parse_recent_filings(submissions):
            if str(row["form"]) != "4":
                continue
            try:
                filing_day = datetime.strptime(row["filing_date"], "%Y-%m-%d").date()
            except ValueError:
                continue
            if filing_day < cutoff:
                continue
            filings.append(
                {
                    "filing_date": row["filing_date"],
                    "form_type": "4",
                    "insider_name": filer_name,
                    "url": self._filing_url(
                        cik,
                        str(row["accession_number"]),
                        str(row["primary_document"]),
                    ),
                }
            )
        filings.sort(key=lambda f: f["filing_date"], reverse=True)
        return filings

    def analyze_8k_filings(self, filings: list[dict[str, Any]]) -> dict[str, Any]:
        """Classify 8-K item severity/direction and summarize impact."""
        high = 0
        moderate = 0
        bullish = 0
        most_significant_item = ""

        priority = [
            "4.02",
            "3.01",
            "2.06",
            "2.05",
            "4.01",
            "5.02",
            "1.02",
            "2.01",
            "1.01",
            "8.01",
            "7.01",
            "5.03",
        ]
        found_items: set[str] = set()
        for filing in filings:
            for item in filing.get("items", []):
                found_items.add(item)
                if item in _HIGHLY_BEARISH_ITEMS:
                    high += 1
                elif item in _MODERATELY_BEARISH_ITEMS:
                    moderate += 1
                elif item in _POTENTIALLY_BULLISH_ITEMS:
                    bullish += 1

        for item in priority:
            if item in found_items:
                most_significant_item = item
                break
        if not most_significant_item and found_items:
            most_significant_item = sorted(found_items)[0]

        bearish_score = (high * 2.0) + moderate
        bullish_score = bullish * 1.5
        if bearish_score > bullish_score and bearish_score > 0:
            direction = "bearish"
        elif bullish_score > bearish_score and bullish_score > 0:
            direction = "bullish"
        else:
            direction = "neutral"

        severity = min(1.0, (high * 0.5) + (moderate * 0.25) + (bullish * 0.2))

        return {
            "total_filings": len(filings),
            "recent_8k_count": len(filings),
            "highly_bearish_count": high,
            "moderately_bearish_count": moderate,
            "potentially_bullish_count": bullish,
            "most_significant_item": most_significant_item,
            "direction": direction,
            "severity": severity,
            "filings": filings,
        }

    def analyze_insider_activity(
        self,
        form4s: list[dict[str, Any]],
        days: int = 7,
    ) -> dict[str, Any]:
        """Summarize Form 4 filing frequency as insider activity intensity."""
        total = len(form4s)
        filings_per_day = total / max(days, 1)
        if total > 5:
            activity_level = "high"
        elif total > 3:
            activity_level = "moderate"
        else:
            activity_level = "normal"
        return {
            "total_form4s": total,
            "days_covered": days,
            "filings_per_day": filings_per_day,
            "is_unusual": total > 3,
            "activity_level": activity_level,
        }

    def scan_ticker(self, ticker: str) -> dict[str, Any] | None:
        """Scan one ticker for significant 8-K/Form4 activity."""
        filings_8k = self.fetch_recent_8k(ticker, days=3)
        filings_4 = self.fetch_recent_form4(ticker, days=7)
        analysis_8k = self.analyze_8k_filings(filings_8k)
        insider_analysis = self.analyze_insider_activity(filings_4, days=7)

        has_significant_filing = (
            analysis_8k["highly_bearish_count"] > 0
            or analysis_8k["moderately_bearish_count"] > 0
            or analysis_8k["potentially_bullish_count"] > 0
        )
        has_unusual_insider = bool(insider_analysis["is_unusual"])

        if not has_significant_filing and not has_unusual_insider:
            return None

        combined_direction = analysis_8k["direction"]
        combined_severity = float(analysis_8k["severity"])
        if combined_direction == "neutral" and has_unusual_insider:
            combined_severity = max(combined_severity, 0.35)

        summary_parts: list[str] = []
        if has_significant_filing:
            if analysis_8k["direction"] == "bearish":
                summary_parts.append(
                    f"{analysis_8k['recent_8k_count']} bearish 8-K filings in 3 days"
                )
            elif analysis_8k["direction"] == "bullish":
                summary_parts.append(
                    f"{analysis_8k['recent_8k_count']} bullish 8-K filings in 3 days"
                )
            else:
                summary_parts.append(
                    f"{analysis_8k['recent_8k_count']} 8-K filings in 3 days"
                )
        if has_unusual_insider:
            summary_parts.append("unusual insider activity")
        summary = " + ".join(summary_parts)

        logger.info(
            "EDGAR %s: %d 8-Ks (%s), %d Form 4s (%s)",
            ticker.upper(),
            analysis_8k["recent_8k_count"],
            analysis_8k["direction"],
            insider_analysis["total_form4s"],
            insider_analysis["activity_level"],
        )

        return {
            "ticker": ticker.upper(),
            "8k_analysis": analysis_8k,
            "insider_analysis": insider_analysis,
            "combined_direction": combined_direction,
            "combined_severity": combined_severity,
            "has_significant_filing": has_significant_filing,
            "has_unusual_insider_activity": has_unusual_insider,
            "summary": summary,
        }

    def scan_batch(self, tickers: list[str]) -> list[dict[str, Any]]:
        """Scan multiple tickers with SEC-friendly rate limiting."""
        findings: list[dict[str, Any]] = []
        for idx, ticker in enumerate(tickers):
            result = self.scan_ticker(ticker)
            if result is not None:
                findings.append(result)
            if idx < len(tickers) - 1:
                time.sleep(_REQUEST_DELAY_SECONDS)
        logger.info(
            "EDGAR scan: %d/%d tickers with significant findings",
            len(findings),
            len(tickers),
        )
        return findings

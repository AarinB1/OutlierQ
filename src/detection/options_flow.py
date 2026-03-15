"""Unusual options activity (UOA) detection and directional analysis."""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from datetime import date, datetime
from typing import Any

import pandas as pd
import yfinance as yf

from config.settings import LOG_FORMAT
from src.ingestion.market_fetcher import MarketFetcher

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        v = float(value)
        if pd.isna(v):
            return default
        return v
    except (TypeError, ValueError):
        return default


def _to_int(value: Any, default: int = 0) -> int:
    return int(_to_float(value, float(default)))


class OptionsFlowDetector:
    """Detects unusual options activity for individual tickers or batches."""

    def __init__(
        self,
        market_fetcher: MarketFetcher,
        volume_ratio_threshold: float = 3.0,
        oi_ratio_threshold: float = 5.0,
    ) -> None:
        self.market_fetcher = market_fetcher
        self.volume_ratio_threshold = volume_ratio_threshold
        self.oi_ratio_threshold = oi_ratio_threshold

    def get_options_snapshot(self, ticker: str) -> dict[str, Any] | None:
        """Fetch options contracts across near-term expirations and summarize."""
        try:
            # Prime cache and quickly detect tickers with no options.
            nearest = self.market_fetcher.fetch_options_chain(ticker)
            if not nearest.get("calls", pd.DataFrame()).shape[0] and not nearest.get(
                "puts", pd.DataFrame()
            ).shape[0]:
                return None

            stock = yf.Ticker(ticker)
            expirations = list(stock.options or [])
            if not expirations:
                return None

            current_price = self.market_fetcher.get_current_price(ticker)
            today = date.today()
            contracts: list[dict[str, Any]] = []
            total_call_volume = 0
            total_put_volume = 0
            expirations_checked = 0

            valid_expirations: list[str] = []
            for expiry_str in expirations:
                try:
                    expiry_date = datetime.strptime(expiry_str, "%Y-%m-%d").date()
                except ValueError:
                    continue
                if 0 <= (expiry_date - today).days <= 28:
                    valid_expirations.append(expiry_str)

            for expiry_str in valid_expirations:
                try:
                    chain = stock.option_chain(expiry_str)
                except Exception as exc:
                    logger.debug(
                        "Failed options chain fetch for %s %s: %s",
                        ticker,
                        expiry_str,
                        exc,
                    )
                    continue
                expirations_checked += 1
                for side, df in (("call", chain.calls), ("put", chain.puts)):
                    if df is None or df.empty:
                        continue
                    for _, row in df.iterrows():
                        volume = _to_int(row.get("volume"))
                        open_interest = _to_int(row.get("openInterest"))
                        contract = {
                            "contract_symbol": str(row.get("contractSymbol", "")),
                            "type": side,
                            "strike": _to_float(row.get("strike")),
                            "expiry": expiry_str,
                            "volume": volume,
                            "open_interest": open_interest,
                            "implied_volatility": _to_float(
                                row.get("impliedVolatility")
                            ),
                            "bid": _to_float(row.get("bid")),
                            "ask": _to_float(row.get("ask")),
                            "last_price": _to_float(row.get("lastPrice")),
                            "current_price": current_price,
                        }
                        contracts.append(contract)
                        if side == "call":
                            total_call_volume += volume
                        else:
                            total_put_volume += volume

            put_call_ratio = (
                float(total_put_volume) / float(total_call_volume)
                if total_call_volume > 0
                else 0.0
            )

            return {
                "ticker": ticker,
                "current_price": current_price,
                "expirations_checked": expirations_checked,
                "total_call_volume": total_call_volume,
                "total_put_volume": total_put_volume,
                "put_call_ratio": put_call_ratio,
                "contracts": contracts,
            }
        except Exception as exc:
            logger.warning("Failed options snapshot for %s: %s", ticker, exc)
            return None

    def detect_unusual_contracts(self, snapshot: dict[str, Any]) -> list[dict[str, Any]]:
        """Identify unusual contracts and compute conviction scores."""
        current_price = _to_float(snapshot.get("current_price"))
        today = date.today()
        unusual: list[dict[str, Any]] = []

        for contract in snapshot.get("contracts", []):
            contract_type = str(contract.get("type", "call")).lower()
            strike = _to_float(contract.get("strike"))
            volume = _to_int(contract.get("volume"))
            open_interest = _to_int(contract.get("open_interest"))
            implied_volatility = _to_float(contract.get("implied_volatility"))
            expiry_str = str(contract.get("expiry", ""))

            try:
                expiry_date = datetime.strptime(expiry_str, "%Y-%m-%d").date()
                days_to_expiry = max((expiry_date - today).days, 0)
            except ValueError:
                days_to_expiry = 999

            if current_price <= 0:
                otm_pct = 0.0
            elif contract_type == "call":
                otm_pct = max((strike - current_price) / current_price, 0.0)
            else:
                otm_pct = max((current_price - strike) / current_price, 0.0)

            volume_oi_ratio = (
                float(volume) / float(open_interest) if open_interest > 0 else 0.0
            )

            flags: list[str] = []
            if (
                volume > 0
                and open_interest > 0
                and volume_oi_ratio >= self.volume_ratio_threshold
            ):
                flags.append("high_vol_oi")
            if volume > 1000 and otm_pct > 0.10:
                flags.append("far_otm_volume")
            if implied_volatility > 1.0 and volume > 500:
                flags.append("iv_spike")

            if not flags:
                continue

            conviction = 0.3
            if volume_oi_ratio > self.oi_ratio_threshold:
                conviction += 0.2
            if otm_pct > 0.15:
                conviction += 0.15
            if days_to_expiry <= 7:
                conviction += 0.15
            if volume > 5000:
                conviction += 0.1
            if implied_volatility > 0.8:
                conviction += 0.1
            conviction = min(conviction, 1.0)

            unusual.append(
                {
                    "contract_symbol": str(contract.get("contract_symbol", "")),
                    "type": contract_type,
                    "strike": strike,
                    "expiry": expiry_str,
                    "volume": volume,
                    "open_interest": open_interest,
                    "volume_oi_ratio": volume_oi_ratio,
                    "implied_volatility": implied_volatility,
                    "otm_pct": otm_pct,
                    "days_to_expiry": days_to_expiry,
                    "conviction_score": conviction,
                    "flags": flags,
                }
            )

        unusual.sort(key=lambda c: c["conviction_score"], reverse=True)
        return unusual

    def analyze_flow_direction(
        self, unusual_contracts: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Aggregate unusual contracts into directional smart-money signal."""
        if not unusual_contracts:
            return {
                "direction": "neutral",
                "bullish_weight": 0.0,
                "bearish_weight": 0.0,
                "total_unusual_call_volume": 0,
                "total_unusual_put_volume": 0,
                "max_conviction": 0.0,
                "dominant_expiry": "",
                "dominant_strike": 0.0,
                "unusual_contract_count": 0,
                "top_contracts": [],
            }

        call_volume = 0
        put_volume = 0
        bullish_weight = 0.0
        bearish_weight = 0.0
        expiry_volume: dict[str, int] = defaultdict(int)
        strike_volume: dict[float, int] = defaultdict(int)
        max_conviction = 0.0

        for contract in unusual_contracts:
            volume = _to_int(contract.get("volume"))
            conviction = _to_float(contract.get("conviction_score"))
            max_conviction = max(max_conviction, conviction)
            expiry_volume[str(contract.get("expiry", ""))] += volume
            strike_volume[_to_float(contract.get("strike"))] += volume

            if contract.get("type") == "call":
                call_volume += volume
                bullish_weight += volume * conviction
            else:
                put_volume += volume
                bearish_weight += volume * conviction

        if bullish_weight > bearish_weight * 1.5:
            direction = "bullish"
        elif bearish_weight > bullish_weight * 1.5:
            direction = "bearish"
        else:
            direction = "neutral"

        dominant_expiry = max(expiry_volume.items(), key=lambda kv: kv[1])[0]
        dominant_strike = max(strike_volume.items(), key=lambda kv: kv[1])[0]

        return {
            "direction": direction,
            "bullish_weight": bullish_weight,
            "bearish_weight": bearish_weight,
            "total_unusual_call_volume": call_volume,
            "total_unusual_put_volume": put_volume,
            "max_conviction": max_conviction,
            "dominant_expiry": dominant_expiry,
            "dominant_strike": dominant_strike,
            "unusual_contract_count": len(unusual_contracts),
            "top_contracts": unusual_contracts[:5],
        }

    def scan_ticker(self, ticker: str) -> dict[str, Any] | None:
        """Get snapshot -> detect unusual contracts -> infer flow direction."""
        snapshot = self.get_options_snapshot(ticker)
        if snapshot is None:
            return None

        unusual_contracts = self.detect_unusual_contracts(snapshot)
        if len(unusual_contracts) < 2:
            return None

        flow = self.analyze_flow_direction(unusual_contracts)
        result = {
            "ticker": ticker,
            "unusual_activity": True,
            "current_price": snapshot["current_price"],
            "expirations_checked": snapshot["expirations_checked"],
            "total_call_volume": snapshot["total_call_volume"],
            "total_put_volume": snapshot["total_put_volume"],
            "put_call_ratio": snapshot["put_call_ratio"],
            "unusual_contracts": unusual_contracts,
            **flow,
        }
        logger.info(
            "UOA for %s: %d unusual contracts, direction=%s, max_conviction=%.2f",
            ticker,
            result["unusual_contract_count"],
            result["direction"],
            result["max_conviction"],
        )
        return result

    def scan_batch(self, tickers: list[str]) -> list[dict[str, Any]]:
        """Scan multiple tickers and return only those with unusual flow."""
        results: list[dict[str, Any]] = []
        start = time.perf_counter()
        for idx, ticker in enumerate(tickers):
            res = self.scan_ticker(ticker)
            if res is not None:
                results.append(res)
            if idx < len(tickers) - 1:
                time.sleep(1.0)
        elapsed = time.perf_counter() - start
        logger.info(
            "Options flow scan: %d/%d tickers with unusual activity (%.2fs)",
            len(results),
            len(tickers),
            elapsed,
        )
        return results

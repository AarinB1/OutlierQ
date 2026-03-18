"""Options signal generation from classified events.

Translates a classified outlier event into an actionable options trade
recommendation — call or put, at what strike price, with what expiration.
Each event type has an impact profile encoding expected price behavior.
"""

import logging
import math
from datetime import date, timedelta

from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT
from src.db.database import get_session
from src.db.tables import Event, Signal, SimulationResult
from src.ingestion.market_fetcher import MarketFetcher
from src.indicators.technical import TechnicalAnalyzer

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ── Event impact profiles ────────────────────────────────────────────

EVENT_PROFILES: dict[str, dict] = {
    "scandal": {
        "direction": "put",
        "expected_move_pct": 0.10,
        "strike_offset_pct": 0.05,
        "expiry_days_min": 14,
        "expiry_days_max": 30,
        "decay_type": "sustained",
        "base_confidence": 0.80,
    },
    "legal": {
        "direction": "put",
        "expected_move_pct": 0.07,
        "strike_offset_pct": 0.04,
        "expiry_days_min": 14,
        "expiry_days_max": 30,
        "decay_type": "sustained",
        "base_confidence": 0.70,
    },
    "earnings_miss": {
        "direction": "put",
        "expected_move_pct": 0.08,
        "strike_offset_pct": 0.03,
        "expiry_days_min": 7,
        "expiry_days_max": 21,
        "decay_type": "moderate",
        "base_confidence": 0.75,
    },
    "recall": {
        "direction": "put",
        "expected_move_pct": 0.06,
        "strike_offset_pct": 0.03,
        "expiry_days_min": 14,
        "expiry_days_max": 21,
        "decay_type": "moderate",
        "base_confidence": 0.65,
    },
    "fda_approval": {
        "direction": "call",
        "expected_move_pct": 0.15,
        "strike_offset_pct": 0.05,
        "expiry_days_min": 7,
        "expiry_days_max": 14,
        "decay_type": "spike_fade",
        "base_confidence": 0.85,
    },
    "breakthrough": {
        "direction": "call",
        "expected_move_pct": 0.10,
        "strike_offset_pct": 0.04,
        "expiry_days_min": 7,
        "expiry_days_max": 21,
        "decay_type": "moderate",
        "base_confidence": 0.70,
    },
    "major_contract": {
        "direction": "call",
        "expected_move_pct": 0.08,
        "strike_offset_pct": 0.03,
        "expiry_days_min": 7,
        "expiry_days_max": 14,
        "decay_type": "spike_fade",
        "base_confidence": 0.75,
    },
    "earnings_beat": {
        "direction": "call",
        "expected_move_pct": 0.07,
        "strike_offset_pct": 0.03,
        "expiry_days_min": 7,
        "expiry_days_max": 14,
        "decay_type": "moderate",
        "base_confidence": 0.80,
    },
    "options_flow": {
        "direction": "call",
        "expected_move_pct": 0.08,
        "strike_offset_pct": 0.0,
        "expiry_days_min": 5,
        "expiry_days_max": 14,
        "decay_type": "spike_fade",
        "base_confidence": 0.70,
    },
    "edgar": {
        "direction": "put",
        "expected_move_pct": 0.07,
        "strike_offset_pct": 0.03,
        "expiry_days_min": 7,
        "expiry_days_max": 21,
        "decay_type": "moderate",
        "base_confidence": 0.72,
    },
}

# Demo-only profile for "other" events (routine news) — direction set from event sentiment
DEMO_OTHER_PROFILE = {
    "direction": "call",  # overridden from event direction in generate_signal
    "expected_move_pct": 0.05,
    "strike_offset_pct": 0.02,
    "expiry_days_min": 7,
    "expiry_days_max": 14,
    "decay_type": "moderate",
    "base_confidence": 0.50,
}

# Exploratory signal thresholds (for "other" events in production)
EXPLORATORY_MIN_CONFIDENCE = 0.5
EXPLORATORY_BULLISH_SENTIMENT = 0.15
EXPLORATORY_BEARISH_SENTIMENT = -0.1
EXPLORATORY_PROFILE = {
    "expected_move_pct": 0.04,
    "strike_offset_pct": 0.02,
    "expiry_days_min": 7,
    "expiry_days_max": 14,
    "decay_type": "moderate",
    "base_confidence": 0.45,
}


def _get_strike_increment(price: float) -> float:
    """Return the standard options strike increment for a given price level."""
    if price < 50:
        return 1.0
    elif price < 200:
        return 2.5
    elif price < 500:
        return 5.0
    else:
        return 10.0


def _round_to_strike(value: float, increment: float) -> float:
    """Round a value to the nearest standard strike increment."""
    return round(value / increment) * increment


def _next_friday(d: date) -> date:
    """Advance a date to the next Friday (or keep if already Friday)."""
    days_ahead = 4 - d.weekday()  # 4 = Friday
    if days_ahead < 0:
        days_ahead += 7
    elif days_ahead == 0:
        return d
    return d + timedelta(days=days_ahead)


class SignalEngine:
    """Generates options trading signals from classified events."""

    def __init__(
        self,
        market_fetcher: MarketFetcher | None = None,
        demo: bool = False,
    ) -> None:
        self.market_fetcher = market_fetcher or MarketFetcher()
        self.technical = TechnicalAnalyzer(self.market_fetcher)
        self.demo = demo
        # In demo mode, include "other" so routine news still produces signals
        if demo:
            self._event_profiles = {**EVENT_PROFILES, "other": dict(DEMO_OTHER_PROFILE)}
        else:
            self._event_profiles = EVENT_PROFILES

    # ── Strike computation ────────────────────────────────────────────

    @staticmethod
    def compute_strike(
        current_price: float, direction: str, offset_pct: float
    ) -> float:
        """Compute suggested strike price, rounded to nearest standard increment.

        For puts: strike below current price (OTM put).
        For calls: strike above current price (OTM call).
        """
        if direction == "put":
            raw_strike = current_price * (1 - offset_pct)
        else:
            raw_strike = current_price * (1 + offset_pct)

        increment = _get_strike_increment(current_price)
        return _round_to_strike(raw_strike, increment)

    # ── Expiry computation ────────────────────────────────────────────

    @staticmethod
    def compute_expiry(
        expiry_days_min: int, expiry_days_max: int, decay_type: str
    ) -> str:
        """Compute suggested expiration date as YYYY-MM-DD.

        - spike_fade: use min days (get in and out fast)
        - sustained: use max days (give it time to play out)
        - moderate: use the midpoint
        Always rounds to the nearest Friday.
        """
        if decay_type == "spike_fade":
            target_days = expiry_days_min
        elif decay_type == "sustained":
            target_days = expiry_days_max
        else:  # moderate
            target_days = (expiry_days_min + expiry_days_max) // 2

        target_date = date.today() + timedelta(days=target_days)
        expiry_date = _next_friday(target_date)
        return expiry_date.isoformat()

    # ── Contract lookup ───────────────────────────────────────────────

    def find_best_contract(
        self,
        ticker: str,
        direction: str,
        target_strike: float,
        target_expiry: str,
    ) -> dict | None:
        """Search the options chain for the closest matching contract.

        Returns contract details dict or None if chain is unavailable.
        """
        try:
            chain = self.market_fetcher.fetch_options_chain(ticker)
        except Exception:
            logger.warning("Failed to fetch options chain for %s", ticker)
            return None

        df_key = "calls" if direction == "call" else "puts"
        df = chain.get(df_key)

        if df is None or df.empty:
            logger.warning("No %s contracts available for %s", direction, ticker)
            return None

        # Find the strike closest to target
        if "strike" not in df.columns:
            return None

        df = df.copy()
        df["strike_dist"] = (df["strike"] - target_strike).abs()
        best = df.loc[df["strike_dist"].idxmin()]

        return {
            "contract_symbol": str(best.get("contractSymbol", "")),
            "strike": float(best["strike"]),
            "expiry": target_expiry,
            "bid": float(best.get("bid", 0)),
            "ask": float(best.get("ask", 0)),
            "volume": int(best.get("volume", 0)) if not _is_nan(best.get("volume")) else 0,
            "open_interest": int(best.get("openInterest", 0)) if not _is_nan(best.get("openInterest")) else 0,
            "implied_volatility": float(best.get("impliedVolatility", 0)) if not _is_nan(best.get("impliedVolatility")) else 0,
        }

    # ── Confidence computation ────────────────────────────────────────

    @staticmethod
    def compute_confidence(
        event_confidence: float,
        base_confidence: float,
        contract: dict | None,
    ) -> float:
        """Compute final signal confidence with market-based adjustments."""
        confidence = (event_confidence + base_confidence) / 2.0

        if contract is not None:
            if contract.get("open_interest", 0) > 100:
                confidence += 0.05
            if contract.get("volume", 0) > 50:
                confidence += 0.05
            if contract.get("implied_volatility", 0) > 1.0:
                confidence -= 0.10
        else:
            confidence -= 0.05

        # Clamp to [0.1, 0.95]
        return max(0.1, min(0.95, confidence))

    # ── Signal generation ─────────────────────────────────────────────

    def _apply_technical_adjustments(
        self,
        signal_dict: dict,
        indicators: dict,
    ) -> dict:
        """Apply small confidence modifiers from technical context."""
        adjusted = dict(signal_dict)
        direction = adjusted.get("direction", "call")
        confidence = float(adjusted.get("confidence", 0.5))
        adjustments_applied: list[str] = []
        reasoning_notes: list[str] = []

        rsi = float(indicators.get("rsi_14", 50.0))
        pct_b = float(indicators.get("bollinger_pct_b", 0.5))
        macd_signal = str(indicators.get("macd_signal", "neutral"))
        relative_volume = float(indicators.get("relative_volume", 0.0))
        atr_pct = float(indicators.get("atr_pct", 0.0))

        if direction == "put" and rsi > 70:
            confidence += 0.05
            adjustments_applied.append("RSI overbought aligns with bearish setup (+0.05)")
        elif direction == "put" and rsi < 30:
            confidence -= 0.05
            adjustments_applied.append("RSI oversold may limit downside (-0.05)")
        elif direction == "call" and rsi < 30:
            confidence += 0.05
            adjustments_applied.append("RSI oversold aligns with bullish rebound (+0.05)")
        elif direction == "call" and rsi > 70:
            confidence -= 0.05
            adjustments_applied.append("RSI overbought may cap upside (-0.05)")

        if direction == "put" and pct_b > 0.8:
            confidence += 0.03
            adjustments_applied.append("Price near upper Bollinger band supports downside (+0.03)")
        elif direction == "put" and pct_b < 0.2:
            confidence -= 0.03
            adjustments_applied.append("Price near lower Bollinger band may limit downside (-0.03)")
        elif direction == "call" and pct_b < 0.2:
            confidence += 0.03
            adjustments_applied.append("Price near lower Bollinger band supports upside (+0.03)")
        elif direction == "call" and pct_b > 0.8:
            confidence -= 0.03
            adjustments_applied.append("Price near upper Bollinger band may limit upside (-0.03)")

        macd_is_bullish = "bullish" in macd_signal
        if (direction == "call" and macd_is_bullish) or (direction == "put" and not macd_is_bullish):
            confidence += 0.03
            adjustments_applied.append("MACD trend aligns with signal direction (+0.03)")
        elif macd_signal != "neutral":
            confidence -= 0.03
            adjustments_applied.append("MACD trend conflicts with signal direction (-0.03)")

        if relative_volume > 2.0:
            confidence += 0.02
            adjustments_applied.append("Relative volume above 2x confirms participation (+0.02)")

        suggested_expiry = adjusted.get("suggested_expiry")
        days_to_expiry = 7
        try:
            if suggested_expiry:
                expiry_dt = date.fromisoformat(str(suggested_expiry))
                days_to_expiry = max(1, (expiry_dt - date.today()).days)
        except ValueError:
            days_to_expiry = 7

        atr_based_move = (atr_pct / 100.0) * math.sqrt(float(days_to_expiry))
        expected_move_pct = float(adjusted.get("expected_move_pct", 0.0))
        if atr_based_move > 0:
            if expected_move_pct > atr_based_move * 2:
                reasoning_notes.append(
                    "Expected move may be ambitious given recent volatility."
                )
            elif expected_move_pct < atr_based_move * 0.5:
                reasoning_notes.append(
                    "Stock volatility suggests larger move potential."
                )

        adjusted["confidence"] = max(0.1, min(0.95, confidence))
        adjusted["technical_context"] = {
            "rsi": rsi,
            "rsi_signal": indicators.get("rsi_signal", "neutral"),
            "bollinger_pct_b": pct_b,
            "bollinger_signal": indicators.get("bollinger_signal", "lower_half"),
            "atr_pct": atr_pct,
            "macd_signal": macd_signal,
            "relative_volume": relative_volume,
            "adjustments_applied": adjustments_applied,
        }
        adjusted["technical_notes"] = reasoning_notes
        return adjusted

    def generate_exploratory_signal(self, event: dict) -> dict | None:
        """Generate a conservative signal for 'other' events when detection confidence is high and sentiment is directional."""
        detection_confidence = event.get("confidence", event.get("confidence_score", 0))
        if detection_confidence < EXPLORATORY_MIN_CONFIDENCE:
            logger.info(
                "Exploratory skip %s — detection confidence %.2f < %.2f",
                event.get("ticker", "?"), detection_confidence, EXPLORATORY_MIN_CONFIDENCE,
            )
            return None
        metadata = event.get("metadata") or {}
        mean_sentiment = metadata.get("mean_sentiment", 0.0)
        if mean_sentiment > EXPLORATORY_BULLISH_SENTIMENT:
            direction = "call"
        elif mean_sentiment < EXPLORATORY_BEARISH_SENTIMENT:
            direction = "put"
        else:
            logger.info(
                "Exploratory skip %s — sentiment %.3f too neutral",
                event.get("ticker", "?"), mean_sentiment,
            )
            return None

        ticker = event["ticker"]
        try:
            current_price = self.market_fetcher.get_current_price(ticker)
        except Exception:
            logger.warning("Cannot get price for %s — skipping exploratory signal", ticker)
            return None

        strike = self.compute_strike(
            current_price, direction, EXPLORATORY_PROFILE["strike_offset_pct"]
        )
        expiry = self.compute_expiry(
            EXPLORATORY_PROFILE["expiry_days_min"],
            EXPLORATORY_PROFILE["expiry_days_max"],
            EXPLORATORY_PROFILE["decay_type"],
        )
        contract = self.find_best_contract(ticker, direction, strike, expiry)
        if contract is not None:
            strike = contract["strike"]
        confidence = self.compute_confidence(
            detection_confidence, EXPLORATORY_PROFILE["base_confidence"], contract
        )
        reasoning = (
            "Exploratory signal — unusual activity detected but event type unclear. "
            "Based on sentiment direction."
        )
        logger.info(
            "SIGNAL (exploratory): %s %s @ $%.0f exp %s (confidence=%.2f)",
            direction, ticker, strike, expiry, confidence,
        )
        return {
            "ticker": ticker,
            "event_type": "other",
            "event_id": event.get("event_id") or event.get("id"),
            "direction": direction,
            "current_price": current_price,
            "suggested_strike": strike,
            "suggested_expiry": expiry,
            "expected_move_pct": EXPLORATORY_PROFILE["expected_move_pct"],
            "decay_type": EXPLORATORY_PROFILE["decay_type"],
            "confidence": confidence,
            "contract": contract,
            "reasoning": reasoning,
            "exploratory": True,
        }

    def generate_signal(self, event: dict) -> dict | None:
        """Generate a complete options signal from an event dict.

        Takes an event dict (from AnomalyPipeline.scan or scan_and_store output)
        and produces a trade recommendation. For 'other' events, uses exploratory logic when appropriate.
        """
        event_type = event.get("event_type", "other")

        if event_type not in self._event_profiles:
            if event_type == "other":
                return self.generate_exploratory_signal(event)
            logger.info(
                "Skipping signal for %s — event type '%s' has no profile",
                event.get("ticker", "?"), event_type,
            )
            return None

        metadata = event.get("metadata") or {}
        source = str(metadata.get("source", "")).lower()
        profile = dict(self._event_profiles[event_type])
        options_meta = metadata.get("options_flow") or event.get("options_flow") or {}

        # Demo mode "other": direction from event sentiment (call = neutral/bullish, put = bearish)
        if self.demo and event_type == "other":
            event_direction = (event.get("direction") or "bullish").lower()
            profile["direction"] = "put" if event_direction == "bearish" else "call"
        if event_type == "options_flow":
            flow_direction = str(
                options_meta.get("direction", event.get("direction", "bullish"))
            ).lower()
            if flow_direction == "bearish":
                profile["direction"] = "put"
            else:
                profile["direction"] = "call"
        edgar_meta = metadata.get("edgar_data") or event.get("edgar_data") or {}
        if edgar_meta:
            edgar_direction = str(edgar_meta.get("combined_direction", "")).lower()
            if edgar_direction == "bearish":
                profile["direction"] = "put"
            elif edgar_direction == "bullish":
                profile["direction"] = "call"
        ticker = event["ticker"]

        # Get current price
        try:
            current_price = self.market_fetcher.get_current_price(ticker)
        except Exception:
            logger.warning("Cannot get price for %s — skipping signal", ticker)
            return None

        direction = profile["direction"]
        strike = self.compute_strike(
            current_price, direction, profile["strike_offset_pct"]
        )
        expiry = self.compute_expiry(
            profile["expiry_days_min"],
            profile["expiry_days_max"],
            profile["decay_type"],
        )
        if event_type == "options_flow":
            dominant_strike = options_meta.get("dominant_strike")
            if dominant_strike is not None:
                try:
                    strike = float(dominant_strike)
                except (TypeError, ValueError):
                    pass
            dominant_expiry = options_meta.get("dominant_expiry")
            if dominant_expiry:
                expiry = str(dominant_expiry)

        # Try to find a real contract
        contract = self.find_best_contract(ticker, direction, strike, expiry)

        # Use the real contract's strike if found
        if contract is not None:
            strike = contract["strike"]

        event_confidence = event.get("confidence", event.get("confidence_score", 0.5))
        confidence = self.compute_confidence(
            event_confidence, profile["base_confidence"], contract
        )

        move_direction = "downward" if direction == "put" else "upward"
        reasoning = (
            f"{event_type.replace('_', ' ').title()} detected for {ticker} "
            f"with {event_confidence:.2f} confidence. "
            f"Suggesting {direction} at ${strike:.0f} strike expiring {expiry}. "
            f"Expected ~{profile['expected_move_pct']:.0%} {move_direction} move "
            f"with {profile['decay_type']} impact."
        )
        if event_type == "options_flow":
            unusual_count = int(options_meta.get("unusual_contract_count", 0))
            max_conviction = float(options_meta.get("max_conviction", 0.0))
            smart_money = str(options_meta.get("direction", "neutral"))
            reasoning += (
                " Unusual options activity detected: "
                f"{unusual_count} contracts with conviction {max_conviction:.2f}. "
                f"Smart money appears {smart_money}."
            )
        if edgar_meta:
            summary = str(edgar_meta.get("summary", "SEC filing activity detected"))
            filing_count = int(edgar_meta.get("8k_analysis", {}).get("recent_8k_count", 0))
            severity = float(edgar_meta.get("combined_severity", event_confidence))
            if severity >= 0.75:
                severity_desc = "high severity"
            elif severity >= 0.5:
                severity_desc = "moderate severity"
            else:
                severity_desc = "low severity"
            reasoning += (
                f" SEC filing detected: {summary}. "
                f"{filing_count} 8-K filings with {severity_desc}."
            )

        logger.info(
            "SIGNAL: %s %s @ $%.0f exp %s (confidence=%.2f) — %s",
            direction, ticker, strike, expiry, confidence, event_type,
        )
        signal = {
            "ticker": ticker,
            "event_type": event_type,
            "event_id": event.get("event_id") or event.get("id"),
            "direction": direction,
            "current_price": current_price,
            "suggested_strike": strike,
            "suggested_expiry": expiry,
            "expected_move_pct": profile["expected_move_pct"],
            "decay_type": profile["decay_type"],
            "confidence": confidence,
            "contract": contract,
            "reasoning": reasoning,
            "exploratory": False,
        }
        try:
            indicators = self.technical.get_ticker_indicators(ticker)
            if indicators is not None:
                signal = self._apply_technical_adjustments(signal, indicators)
                technical_context = signal.get("technical_context", {})
                signal["reasoning"] += (
                    " Technical context: "
                    f"RSI {technical_context.get('rsi', 0):.1f} "
                    f"({technical_context.get('rsi_signal', 'neutral')}), "
                    f"BB%B {technical_context.get('bollinger_pct_b', 0):.2f}, "
                    f"MACD {technical_context.get('macd_signal', 'neutral')}."
                )
                for note in signal.get("technical_notes", []):
                    signal["reasoning"] += f" {note}"
                logger.info(
                    "Technical adjustments for %s: %s",
                    ticker,
                    technical_context.get("adjustments_applied", []),
                )
        except Exception as exc:
            logger.warning("Technical adjustment failed for %s: %s", ticker, exc)

        return signal

    # ── Simulation adjustment ────────────────────────────────────────

    @staticmethod
    def apply_simulation_adjustment(
        signal: dict,
        sim_result: SimulationResult,
    ) -> dict:
        """Adjust a signal dict based on MiroFish simulation output.

        Rules:
        - Agreement: boost confidence by consensus_strength * 0.2 (cap 1.0)
        - Disagreement with high consensus (>= 0.7): flip direction, set
          confidence to consensus_strength * 0.6
        - Disagreement with low consensus (< 0.7): reduce confidence by 30%
        - Neutral simulation: reduce confidence by 10%
        """
        adjusted = dict(signal)
        sim_direction = (sim_result.direction or "neutral").lower()
        consensus = float(sim_result.consensus_strength or 0.5)

        # Map event direction (bullish/bearish) to signal direction (call/put)
        signal_dir = adjusted["direction"]  # call or put
        event_implies = "bullish" if signal_dir == "call" else "bearish"

        if sim_direction == "neutral":
            adjusted["confidence"] = max(0.1, adjusted["confidence"] * 0.9)
            adjusted["simulation_enhanced"] = True
            logger.info(
                "Simulation neutral for %s — confidence reduced 10%% to %.2f",
                adjusted["ticker"], adjusted["confidence"],
            )
        elif sim_direction == event_implies:
            # Agreement — boost
            boost = consensus * 0.2
            adjusted["confidence"] = min(1.0, adjusted["confidence"] + boost)
            adjusted["simulation_enhanced"] = True
            logger.info(
                "Simulation agrees (%s) for %s — confidence boosted by %.2f to %.2f",
                sim_direction, adjusted["ticker"], boost, adjusted["confidence"],
            )
        else:
            # Disagreement
            if consensus >= 0.7:
                # Flip direction
                adjusted["direction"] = "put" if signal_dir == "call" else "call"
                adjusted["confidence"] = consensus * 0.6
                adjusted["simulation_enhanced"] = True
                logger.info(
                    "Simulation strongly disagrees for %s (consensus=%.2f) — "
                    "flipping %s -> %s, confidence=%.2f",
                    adjusted["ticker"], consensus,
                    signal_dir, adjusted["direction"], adjusted["confidence"],
                )
            else:
                # Reduce confidence by 30%
                adjusted["confidence"] = max(0.1, adjusted["confidence"] * 0.7)
                adjusted["simulation_enhanced"] = True
                logger.info(
                    "Simulation weakly disagrees for %s (consensus=%.2f) — "
                    "confidence reduced 30%% to %.2f",
                    adjusted["ticker"], consensus, adjusted["confidence"],
                )

        return adjusted

    def generate_signals(
        self,
        events: list[dict],
        simulation_results: dict | None = None,
    ) -> list[dict]:
        """Generate signals for a batch of events, sorted by confidence.

        Parameters
        ----------
        simulation_results : dict, optional
            Mapping of event_id -> SimulationResult.  When present, signals
            are adjusted based on simulation output before sorting.
        """
        sim_map = simulation_results or {}
        signals = []
        for event in events:
            signal = self.generate_signal(event)
            if signal is not None:
                event_id = signal.get("event_id")
                sim = sim_map.get(event_id) if event_id else None
                if sim is not None:
                    signal = self.apply_simulation_adjustment(signal, sim)
                signals.append(signal)

        signals.sort(key=lambda s: s["confidence"], reverse=True)
        logger.info("Generated %d signals from %d events", len(signals), len(events))
        return signals

    def generate_and_store(
        self,
        events: list[dict],
        session: Session | None = None,
        simulation_results: dict | None = None,
    ) -> list[Signal]:
        """Generate signals and store them in the signals table.

        Each signal is linked to its source event via event_id.

        Parameters
        ----------
        simulation_results : dict, optional
            Mapping of event_id -> SimulationResult used to adjust signals.
        """
        def _run(s: Session) -> list[Signal]:
            signal_dicts = self.generate_signals(events, simulation_results=simulation_results)
            stored: list[Signal] = []

            for sig in signal_dicts:
                event_id = sig.get("event_id")
                if not event_id:
                    logger.warning("Signal for %s has no event_id, skipping store", sig["ticker"])
                    continue

                record = Signal(
                    ticker=sig["ticker"],
                    event_id=event_id,
                    direction=sig["direction"],
                    suggested_strike=sig["suggested_strike"],
                    suggested_expiry=sig["suggested_expiry"],
                    confidence=sig["confidence"],
                    exploratory=sig.get("exploratory", False),
                    discovery_source=sig.get("discovery_source"),
                    simulation_enhanced=sig.get("simulation_enhanced", False),
                )
                s.add(record)
                stored.append(record)

                technical_context = sig.get("technical_context")
                if technical_context:
                    event = s.query(Event).filter(Event.id == event_id).first()
                    if event is not None:
                        metadata = dict(event.metadata_json or {})
                        metadata["technical_context"] = technical_context
                        notes = sig.get("technical_notes")
                        if notes:
                            metadata["technical_notes"] = notes
                        event.metadata_json = metadata
                        s.add(event)

            s.flush()
            logger.info("Stored %d signals in the database", len(stored))
            return stored

        if session is not None:
            return _run(session)
        with get_session() as s:
            return _run(s)


def _is_nan(value) -> bool:
    """Check if a value is NaN (handles pandas NaN and None)."""
    if value is None:
        return True
    try:
        import math
        return math.isnan(float(value))
    except (TypeError, ValueError):
        return False

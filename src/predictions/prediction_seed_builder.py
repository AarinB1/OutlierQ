"""Build MiroFish seed documents framed around prediction market questions.

The output reads like a research analyst's briefing note for a prediction
market, not a stock event — it asks agents to simulate public opinion and
probabilistic outcomes rather than directional stock moves.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def build_prediction_seed(
    market_question: str,
    platform: str,
    market_yes_price: float,
    event: dict | None = None,
    articles: list[dict] | None = None,
    metadata: dict | None = None,
) -> str:
    """Build a prose seed document for MiroFish prediction market simulation.

    Parameters
    ----------
    market_question : str
        The prediction market question (e.g. "Will the Fed cut rates in June?").
    platform : str
        "polymarket" or "kalshi".
    market_yes_price : float
        Current YES price (0.0–1.0), representing the market's implied probability.
    event : dict, optional
        Matched OutlierQ event with keys: ticker, event_type, direction, confidence.
    articles : list[dict], optional
        Related articles with keys: headline, summary, source.
    metadata : dict, optional
        Extra context (match_method, match_score, etc.).
    """
    meta = metadata or {}
    lines: list[str] = []

    # Header
    lines.append("=" * 70)
    lines.append("PREDICTION MARKET ANALYSIS BRIEFING")
    lines.append("=" * 70)
    lines.append("")

    # Core question
    lines.append(f"QUESTION: {market_question}")
    lines.append(f"Platform: {platform.capitalize()}")
    lines.append(f"Current market consensus: {market_yes_price:.0%} YES / {1 - market_yes_price:.0%} NO")
    lines.append(f"Analysis date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")

    # Context from matched event
    if event:
        ticker = event.get("ticker", "N/A")
        event_type = event.get("event_type", "unknown")
        direction = event.get("direction", "neutral")
        confidence = event.get("confidence", 0)

        lines.append("RELATED MARKET EVENT:")
        lines.append(f"  Ticker: {ticker}")
        lines.append(f"  Event type: {event_type.replace('_', ' ').title()}")
        lines.append(f"  Detected direction: {direction.capitalize()} (confidence: {confidence:.0%})")

        match_method = meta.get("match_method", "unknown")
        match_score = meta.get("match_score", 0)
        lines.append(f"  Match quality: {match_method} ({match_score:.0%} confidence)")
        lines.append("")

    # News coverage
    if articles:
        lines.append(f"RELEVANT NEWS COVERAGE ({len(articles)} articles):")
        for i, art in enumerate(articles[:8], start=1):
            source_tag = f" [{art.get('source', '')}]" if art.get("source") else ""
            summary_snippet = ""
            if art.get("summary"):
                summary_snippet = f" — {art['summary'][:200]}"
            lines.append(f"  {i}. {art.get('headline', 'No headline')}{source_tag}{summary_snippet}")
        if len(articles) > 8:
            lines.append(f"  ... and {len(articles) - 8} additional articles")
        lines.append("")

    # Additional context
    if meta.get("common_themes"):
        lines.append(f"Common themes: {', '.join(meta['common_themes'])}")
        lines.append("")

    if meta.get("options_flow"):
        flow = meta["options_flow"]
        flow_dir = flow.get("direction", "unknown")
        lines.append(f"Options market signal: {flow_dir} unusual activity detected")
        lines.append("")

    # Simulation instruction
    lines.append("SIMULATION OBJECTIVE:")
    lines.append(f"Simulate how informed participants — analysts, traders, policy experts,")
    lines.append(f"and the general public — would assess the probability of this outcome.")
    lines.append(f"Consider the strength and reliability of the evidence, potential for")
    lines.append(f"reversal or surprise, historical base rates for similar events, and")
    lines.append(f"whether the current market price of {market_yes_price:.0%} accurately")
    lines.append(f"reflects the true probability.")
    lines.append("")
    lines.append("Focus on estimating a calibrated probability, not just a direction.")

    return "\n".join(lines)

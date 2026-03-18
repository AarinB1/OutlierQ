"""Convert OutlierQ Event + Articles + metadata into a natural-language seed document
for MiroFish ingestion.

The output reads like a financial briefing — no raw JSON.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.db.tables import Article, Event


def build_seed(
    event: Event,
    articles: list[Article],
    metadata: dict | None = None,
) -> str:
    """Return a prose seed document summarising the event for MiroFish.

    Parameters
    ----------
    event : Event
        The classified OutlierQ event.
    articles : list[Article]
        Related Article objects (headlines, summaries, sources).
    metadata : dict, optional
        Extra enrichment data — may include keys like ``z_score``,
        ``sentiment_scores``, ``options_flow``, ``edgar_data``, and
        ``current_price``.
    """
    meta = metadata or event.metadata_json or {}
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    lines: list[str] = []

    # --- Header ---
    lines.append(f"FINANCIAL EVENT BRIEFING — {event.ticker}")
    lines.append(f"Prepared: {now}")
    lines.append("")

    # --- Event summary ---
    direction_label = (event.direction or "unknown").capitalize()
    lines.append(f"Event classification: {event.event_type} ({direction_label})")
    lines.append(f"Detection confidence: {event.confidence:.0%}")
    lines.append("")

    # --- Price context ---
    current_price = meta.get("current_price")
    if current_price is not None:
        lines.append(f"Current share price: ${current_price:,.2f}")
        lines.append("")

    # --- Quantitative signals ---
    z_score = meta.get("z_score")
    if z_score is not None:
        lines.append(
            f"News volume z-score: {z_score:.2f} "
            f"(article count is {z_score:.1f} standard deviations above the 14-day baseline)"
        )

    sentiment = meta.get("mean_sentiment")
    if sentiment is not None:
        sent_word = "positive" if sentiment > 0 else "negative" if sentiment < 0 else "neutral"
        lines.append(f"Average sentiment score: {sentiment:+.3f} ({sent_word})")

    extreme_ratio = meta.get("extreme_ratio")
    if extreme_ratio is not None:
        lines.append(
            f"Extreme-sentiment ratio: {extreme_ratio:.0%} of recent articles carry extreme language"
        )
    lines.append("")

    # --- Options flow ---
    options = meta.get("options_flow")
    if options:
        lines.append("Unusual options activity detected:")
        lines.append(f"  Direction: {options.get('direction', 'N/A')}")
        lines.append(f"  Unusual contracts: {options.get('unusual_contract_count', 'N/A')}")
        lines.append(f"  Max conviction: {options.get('max_conviction', 'N/A')}")
        dom_strike = options.get("dominant_strike")
        dom_expiry = options.get("dominant_expiry")
        if dom_strike and dom_expiry:
            lines.append(f"  Dominant strike/expiry: ${dom_strike} / {dom_expiry}")
        lines.append("")

    # --- SEC EDGAR ---
    edgar = meta.get("edgar_data")
    if edgar:
        lines.append("SEC filing activity:")
        if edgar.get("has_significant_filing"):
            lines.append(f"  Significant filing detected — {edgar.get('summary', 'details unavailable')}")
        if edgar.get("has_unusual_insider_activity"):
            lines.append("  Unusual insider transaction (Form 4) activity noted.")
        lines.append("")

    # --- News coverage ---
    if articles:
        lines.append(f"News coverage ({len(articles)} articles from multiple sources):")
        for i, art in enumerate(articles[:10], start=1):
            source_tag = f" [{art.source}]" if art.source else ""
            summary_snippet = ""
            if art.summary:
                summary_snippet = f" — {art.summary[:200]}"
            lines.append(f"  {i}. {art.headline}{source_tag}{summary_snippet}")
        if len(articles) > 10:
            lines.append(f"  ... and {len(articles) - 10} additional articles")
        lines.append("")

    # --- Themes ---
    themes = meta.get("common_themes")
    if themes:
        lines.append(f"Common themes across sources: {', '.join(themes)}")
        lines.append("")

    # --- Instruction ---
    lines.append(
        "Simulate public and market reaction to this event. "
        "Consider investor sentiment, institutional positioning, retail trader behaviour, "
        "and potential catalysts for further price movement."
    )

    return "\n".join(lines)


def build_seed_from_snapshot(
    event_snapshot: dict,
    article_snapshots: list[dict],
    metadata: dict | None = None,
) -> str:
    """Build a seed document from plain dicts (thread-safe, no ORM objects).

    Mirrors :func:`build_seed` but accepts serialised snapshots produced by
    ``submit_simulation`` so worker threads never touch detached instances.
    """
    meta = metadata or event_snapshot.get("metadata_json") or {}
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    lines: list[str] = []

    # --- Header ---
    ticker = event_snapshot.get("ticker", "UNKNOWN")
    lines.append(f"FINANCIAL EVENT BRIEFING — {ticker}")
    lines.append(f"Prepared: {now}")
    lines.append("")

    # --- Event summary ---
    direction_label = (event_snapshot.get("direction") or "unknown").capitalize()
    lines.append(f"Event classification: {event_snapshot.get('event_type', 'unknown')} ({direction_label})")
    confidence = event_snapshot.get("confidence", 0)
    lines.append(f"Detection confidence: {confidence:.0%}")
    lines.append("")

    # --- Price context ---
    current_price = meta.get("current_price")
    if current_price is not None:
        lines.append(f"Current share price: ${current_price:,.2f}")
        lines.append("")

    # --- Quantitative signals ---
    z_score = meta.get("z_score")
    if z_score is not None:
        lines.append(
            f"News volume z-score: {z_score:.2f} "
            f"(article count is {z_score:.1f} standard deviations above the 14-day baseline)"
        )

    sentiment = meta.get("mean_sentiment")
    if sentiment is not None:
        sent_word = "positive" if sentiment > 0 else "negative" if sentiment < 0 else "neutral"
        lines.append(f"Average sentiment score: {sentiment:+.3f} ({sent_word})")

    extreme_ratio = meta.get("extreme_ratio")
    if extreme_ratio is not None:
        lines.append(
            f"Extreme-sentiment ratio: {extreme_ratio:.0%} of recent articles carry extreme language"
        )
    lines.append("")

    # --- Options flow ---
    options = meta.get("options_flow")
    if options:
        lines.append("Unusual options activity detected:")
        lines.append(f"  Direction: {options.get('direction', 'N/A')}")
        lines.append(f"  Unusual contracts: {options.get('unusual_contract_count', 'N/A')}")
        lines.append(f"  Max conviction: {options.get('max_conviction', 'N/A')}")
        dom_strike = options.get("dominant_strike")
        dom_expiry = options.get("dominant_expiry")
        if dom_strike and dom_expiry:
            lines.append(f"  Dominant strike/expiry: ${dom_strike} / {dom_expiry}")
        lines.append("")

    # --- SEC EDGAR ---
    edgar = meta.get("edgar_data")
    if edgar:
        lines.append("SEC filing activity:")
        if edgar.get("has_significant_filing"):
            lines.append(f"  Significant filing detected — {edgar.get('summary', 'details unavailable')}")
        if edgar.get("has_unusual_insider_activity"):
            lines.append("  Unusual insider transaction (Form 4) activity noted.")
        lines.append("")

    # --- News coverage ---
    if article_snapshots:
        lines.append(f"News coverage ({len(article_snapshots)} articles from multiple sources):")
        for i, art in enumerate(article_snapshots[:10], start=1):
            source_tag = f" [{art.get('source', '')}]" if art.get("source") else ""
            summary_snippet = ""
            if art.get("summary"):
                summary_snippet = f" — {art['summary'][:200]}"
            lines.append(f"  {i}. {art.get('headline', 'No headline')}{source_tag}{summary_snippet}")
        if len(article_snapshots) > 10:
            lines.append(f"  ... and {len(article_snapshots) - 10} additional articles")
        lines.append("")

    # --- Themes ---
    themes = meta.get("common_themes")
    if themes:
        lines.append(f"Common themes across sources: {', '.join(themes)}")
        lines.append("")

    # --- Instruction ---
    lines.append(
        "Simulate public and market reaction to this event. "
        "Consider investor sentiment, institutional positioning, retail trader behaviour, "
        "and potential catalysts for further price movement."
    )

    return "\n".join(lines)

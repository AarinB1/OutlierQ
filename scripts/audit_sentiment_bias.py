#!/usr/bin/env python3
"""Audit sentiment-analyzer bias on financial headlines.

Runs two measurements and prints a comparison:

1. Labeled benchmark (bundled below): 20 clearly bearish and 20 clearly
   bullish headlines. Reports mean compound score, directional recall, and
   net skew (mean over the full set — 0.0 is unbiased) for:
     - stock VADER (general-English lexicon)
     - the production fallback analyzer (VADER + finance lexicon)
     - FinBERT, when transformers/torch are installed
2. Stored articles (when the database has any): distribution of persisted
   sentiment_score values, so drift on real ingested data is visible.

Usage:
    python scripts/audit_sentiment_bias.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from src.detection.finbert_analyzer import FinBERTAnalyzer, _make_finance_vader

# Ground-truth labeled headlines: phrasing drawn from typical Finnhub
# company-news output. Deliberately balanced 20/20 so net skew is meaningful.
BEARISH_HEADLINES = [
    "Company issues profit warning as demand weakens",
    "Q3 earnings miss: revenue falls short of estimates",
    "Firm cuts full-year guidance citing margin pressure",
    "Shares tumble after disappointing quarterly results",
    "SEC opens probe into accounting practices",
    "Company faces class action lawsuit over data breach",
    "Regulator fines company $2 billion over compliance failures",
    "Automaker recalls 500,000 vehicles over safety defect",
    "CEO resigns amid fraud allegations",
    "Analyst downgrades stock to sell, cuts price target",
    "Company announces layoffs of 10,000 employees",
    "Credit rating cut to junk as debt concerns mount",
    "Drugmaker's phase 3 trial fails to meet primary endpoint",
    "Bankruptcy filing looms as lender talks collapse",
    "Revenue declines for third consecutive quarter",
    "Chipmaker warns of prolonged inventory glut",
    "Retailer shutters 200 stores amid slumping sales",
    "Short seller alleges accounting irregularities",
    "Factory fire halts production at key plant",
    "Company suspends dividend to preserve cash",
]

BULLISH_HEADLINES = [
    "Company beats earnings expectations, raises guidance",
    "Record quarterly revenue as demand surges",
    "FDA approves company's breakthrough cancer drug",
    "Firm wins $5 billion government contract",
    "Analyst upgrades stock to buy on growth outlook",
    "Company announces $10 billion share buyback",
    "Profit soars 40% on strong product sales",
    "Blowout quarter: EPS tops estimates by wide margin",
    "Company raises dividend for tenth straight year",
    "Merger deal signed at 30% premium",
    "Drugmaker's phase 3 trial succeeds, filing planned",
    "Chipmaker guides above consensus on AI demand",
    "Subscriber growth accelerates past forecasts",
    "Company inks strategic partnership with tech giant",
    "New product launch drives record preorders",
    "Margins expand as cost cuts take hold",
    "Stock surges on better-than-expected outlook",
    "Board approves special dividend after strong year",
    "Company achieves profitability ahead of schedule",
    "Retailer posts strongest holiday sales in a decade",
]


def summarize(name: str, score_fn) -> dict:
    """Score both labeled sets with score_fn(text) -> compound in [-1, 1]."""
    bearish = [score_fn(h) for h in BEARISH_HEADLINES]
    bullish = [score_fn(h) for h in BULLISH_HEADLINES]

    bear_recall = sum(1 for c in bearish if c < -0.05) / len(bearish)
    bull_recall = sum(1 for c in bullish if c > 0.05) / len(bullish)
    all_scores = bearish + bullish
    net_skew = sum(all_scores) / len(all_scores)

    print(f"\n  {name}")
    print(f"    bearish set: mean={sum(bearish)/len(bearish):+.3f}  recall={bear_recall:.0%}")
    print(f"    bullish set: mean={sum(bullish)/len(bullish):+.3f}  recall={bull_recall:.0%}")
    print(f"    net skew (0 = unbiased): {net_skew:+.3f}")
    return {
        "bear_recall": bear_recall,
        "bull_recall": bull_recall,
        "net_skew": net_skew,
    }


def audit_stored_articles() -> None:
    """Report persisted sentiment_score distribution when articles exist."""
    try:
        from src.db.database import get_session
        from src.db.tables import Article

        with get_session() as s:
            scores = [
                row[0] for row in
                s.query(Article.sentiment_score)
                .filter(Article.sentiment_score.isnot(None))
                .all()
            ]
    except Exception as exc:
        print(f"\n  Stored articles: unavailable ({exc})")
        return

    if not scores:
        print("\n  Stored articles: none with sentiment scores — skipping DB audit.")
        return

    pos = sum(1 for c in scores if c > 0.05)
    neg = sum(1 for c in scores if c < -0.05)
    neu = len(scores) - pos - neg
    print(f"\n  Stored articles ({len(scores)} scored):")
    print(f"    mean={sum(scores)/len(scores):+.3f}  "
          f"positive={pos/len(scores):.0%}  negative={neg/len(scores):.0%}  neutral={neu/len(scores):.0%}")


def main() -> None:
    print("=" * 64)
    print("  SENTIMENT BIAS AUDIT — labeled financial-headline benchmark")
    print("=" * 64)

    stock = SentimentIntensityAnalyzer()
    summarize("Stock VADER (general English)", lambda t: stock.polarity_scores(t)["compound"])

    finance = _make_finance_vader()
    summarize("VADER + finance lexicon (production fallback)",
              lambda t: finance.polarity_scores(t)["compound"])

    analyzer = FinBERTAnalyzer()
    if not analyzer.fallback:
        summarize("FinBERT (production primary)", lambda t: analyzer.analyze(t)["compound"])
    else:
        print("\n  FinBERT: not available in this environment (transformers/torch missing)")

    audit_stored_articles()
    print()


if __name__ == "__main__":
    main()

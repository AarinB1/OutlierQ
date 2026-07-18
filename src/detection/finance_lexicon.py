"""Finance-domain lexicon corrections for the VADER fallback analyzer.

VADER's general-English lexicon misses most finance vocabulary and inverts
some of it. Measured on the labeled benchmark in
``scripts/audit_sentiment_bias.py`` (stock VADER): 7/20 clearly bearish
headlines scored neutral-or-positive and 8/20 clearly bullish headlines
scored neutral-or-negative. Concrete failures this table fixes:

- "beats expectations"          -> no entry for beat/beats ("beat" reads as violence)
- "regulator fines company"     -> "fine" is +0.8 in stock VADER ("I'm fine")
- "earnings miss"               -> "miss" is only -0.6 ("I miss you")
- probe / layoffs / recall / downgrade / slump / shutters / irregularities
  / buyback / surge / upgrade / bullish / bearish -> no entries at all

Weights use VADER's -4..+4 scale, calibrated against neighboring stock
entries (fraud -2.8, warning -1.4, approval +2.1). This table is only
applied to the FinBERT *fallback* path, which exclusively sees financial
headlines — so finance-specific readings of ambiguous words ("fine",
"beat", "recall") are safe here.
"""

FINANCE_LEXICON: dict[str, float] = {
    # ── Bearish: earnings / operations ────────────────────────────────
    "miss": -2.0, "misses": -2.0, "missed": -2.0,
    "shortfall": -2.0,
    "downgrade": -2.3, "downgrades": -2.3, "downgraded": -2.3,
    "layoff": -2.4, "layoffs": -2.4,
    "decline": -1.5, "declines": -1.5, "declined": -1.5,
    "slump": -2.2, "slumps": -2.2, "slumping": -2.2,
    "plunge": -2.6, "plunges": -2.6, "plunged": -2.6,
    "tumble": -2.4, "tumbles": -2.4, "tumbled": -2.4,
    "selloff": -2.2, "sell-off": -2.2,
    "shutters": -2.0, "shuttered": -2.0,
    "writedown": -2.2, "restatement": -2.4,
    "bankruptcy": -3.2, "insolvency": -3.0,
    "glut": -1.8, "headwinds": -1.5,
    "warns": -1.8, "underperform": -2.0, "underperforms": -2.0, "underperformed": -2.0,
    "suspends": -1.8, "suspended": -1.8, "halts": -1.5, "halted": -1.5,
    # ── Bearish: legal / regulatory ───────────────────────────────────
    "probe": -1.8, "subpoena": -2.0,
    "alleges": -1.5, "allegations": -1.5,
    "irregularities": -2.0,
    "recall": -1.8, "recalls": -1.8, "recalled": -1.8,
    "fine": -1.5, "fined": -2.0, "fines": -1.8,  # regulatory penalty, not "I'm fine"
    # ── Bullish ───────────────────────────────────────────────────────
    "beat": 2.0, "beats": 2.0,  # beat estimates, not violence
    "surge": 2.4, "surges": 2.4, "surged": 2.4,
    "soar": 2.6, "soars": 2.6, "soared": 2.6,
    "rally": 2.0, "rallies": 2.0, "rallied": 2.0,
    "upgrade": 2.3, "upgrades": 2.3, "upgraded": 2.3,
    "buyback": 1.8,
    "outperform": 2.0, "outperforms": 2.0, "outperformed": 2.0,
    "bullish": 2.5, "bearish": -2.5,
    "blowout": 2.2,
    "tops": 1.5, "exceeds": 1.8, "exceeded": 1.8,
    "accelerates": 1.5, "profitability": 1.8,
    "partnership": 1.5, "breakthrough": 2.2, "merger": 1.2,
    # In company news "cancer" names a drug's target disease, not bad news
    # about the company — stock VADER's -3.4 flips FDA-approval headlines
    # negative. Neutral is the honest reading here.
    "cancer": 0.0,
}

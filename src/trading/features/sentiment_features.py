"""Sentiment features bridging to existing FinBERT pipeline.

Computes rolling sentiment aggregates for trading model features.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sqlalchemy import desc

from config.settings import LOG_FORMAT
from src.db.database import get_session
from src.db.tables import Article

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def compute_sentiment_features(
    ticker: str,
    dates: pd.DatetimeIndex,
    lookback_hours: int = 24,
) -> pd.DataFrame:
    """Compute sentiment features aligned to the given date index.

    Queries the Article table for existing FinBERT sentiment scores
    and computes rolling aggregates.

    Returns DataFrame indexed by date with sentiment columns.
    """
    with get_session() as session:
        articles = (
            session.query(Article)
            .filter(Article.ticker == ticker.upper())
            .filter(Article.sentiment_score.isnot(None))
            .order_by(desc(Article.published_at))
            .all()
        )

    if not articles:
        logger.info("No sentiment data for %s, returning zeros", ticker)
        return _empty_sentiment_df(dates)

    records = []
    for a in articles:
        pub_at = a.published_at
        if pub_at.tzinfo is None:
            pub_at = pub_at.replace(tzinfo=timezone.utc)
        records.append({
            "published_at": pub_at,
            "sentiment_score": a.sentiment_score,
            "headline": a.headline,
        })

    article_df = pd.DataFrame(records)
    article_df = article_df.sort_values("published_at")

    result_rows = []
    for date in dates:
        dt = pd.Timestamp(date)
        if dt.tzinfo is None:
            dt = dt.tz_localize("UTC")

        window_start = dt - timedelta(hours=lookback_hours)
        mask = (article_df["published_at"] >= window_start) & (article_df["published_at"] <= dt)
        window = article_df.loc[mask]

        if window.empty:
            result_rows.append(_zero_row())
            continue

        scores = window["sentiment_score"].values
        result_rows.append({
            "sentiment_mean_24h": float(np.mean(scores)),
            "sentiment_std_24h": float(np.std(scores)) if len(scores) > 1 else 0.0,
            "sentiment_velocity": float(scores[-1] - scores[0]) if len(scores) > 1 else 0.0,
            "sentiment_zscore": float(
                (scores[-1] - np.mean(scores)) / max(np.std(scores), 1e-8)
            ) if len(scores) > 1 else 0.0,
            "article_count_24h": len(window),
            "extreme_sentiment_ratio": float(
                np.sum(np.abs(scores) > 0.6) / len(scores)
            ),
        })

    result = pd.DataFrame(result_rows, index=dates)
    return result


def _zero_row() -> dict:
    return {
        "sentiment_mean_24h": 0.0,
        "sentiment_std_24h": 0.0,
        "sentiment_velocity": 0.0,
        "sentiment_zscore": 0.0,
        "article_count_24h": 0,
        "extreme_sentiment_ratio": 0.0,
    }


def _empty_sentiment_df(dates: pd.DatetimeIndex) -> pd.DataFrame:
    return pd.DataFrame(
        [_zero_row() for _ in dates],
        index=dates,
    )

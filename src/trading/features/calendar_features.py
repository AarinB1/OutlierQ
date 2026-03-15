"""Calendar and temporal features: day-of-week, month-end, FOMC, earnings proximity."""

from __future__ import annotations

import numpy as np
import pandas as pd

# Known FOMC meeting dates for 2025-2026 (approximate — update as needed)
FOMC_DATES_2025_2026 = [
    "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18",
    "2025-07-30", "2025-09-17", "2025-11-05", "2025-12-17",
    "2026-01-28", "2026-03-18", "2026-05-06", "2026-06-17",
    "2026-07-29", "2026-09-16", "2026-11-04", "2026-12-16",
]

# Monthly options expiration is typically the 3rd Friday
_OPTIONS_EXPIRY_DOW = 4  # Friday


def compute_calendar_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add calendar/temporal features to a DataFrame with a DatetimeIndex."""
    out = df.copy()
    idx = pd.DatetimeIndex(out.index)

    # Day of week (one-hot)
    dow = idx.dayofweek
    out["is_monday"] = (dow == 0).astype(float)
    out["is_tuesday"] = (dow == 1).astype(float)
    out["is_wednesday"] = (dow == 2).astype(float)
    out["is_thursday"] = (dow == 3).astype(float)
    out["is_friday"] = (dow == 4).astype(float)

    # Month-end proximity
    out["is_month_end"] = idx.is_month_end.astype(float)
    out["is_month_start"] = idx.is_month_start.astype(float)

    # Quarter end
    out["is_quarter_end"] = idx.is_quarter_end.astype(float)

    # FOMC proximity
    fomc_dates = pd.to_datetime(FOMC_DATES_2025_2026)
    out["days_to_fomc"] = _days_to_nearest_event(idx, fomc_dates)
    out["is_fomc_week"] = (out["days_to_fomc"] <= 5).astype(float)

    # Options expiry proximity (3rd Friday of each month)
    expiry_dates = _monthly_option_expiries(idx.min(), idx.max())
    out["days_to_options_expiry"] = _days_to_nearest_event(idx, expiry_dates)

    # Day of month (normalized 0-1)
    out["day_of_month_norm"] = idx.day / 31.0

    # Week of year (normalized 0-1)
    out["week_of_year_norm"] = idx.isocalendar().week.values / 52.0

    return out


def _days_to_nearest_event(
    dates: pd.DatetimeIndex,
    event_dates: pd.DatetimeIndex,
) -> pd.Series:
    """Compute number of calendar days to the nearest future event."""
    result = []
    for d in dates:
        d_naive = d.tz_localize(None) if hasattr(d, "tz_localize") and d.tzinfo else d
        future = event_dates[event_dates >= d_naive]
        if len(future) == 0:
            result.append(30)
        else:
            delta = (future[0] - d_naive).days
            result.append(max(delta, 0))
    return pd.Series(result, index=dates, dtype=float)


def _monthly_option_expiries(
    start: pd.Timestamp,
    end: pd.Timestamp,
) -> pd.DatetimeIndex:
    """Generate 3rd-Friday-of-month dates between start and end."""
    dates = []
    current = start.replace(day=1)
    while current <= end + pd.Timedelta(days=60):
        # Find the 3rd Friday
        first_day = current.replace(day=1)
        first_dow = first_day.dayofweek
        # Days until first Friday
        days_to_friday = (4 - first_dow) % 7
        first_friday = first_day + pd.Timedelta(days=days_to_friday)
        third_friday = first_friday + pd.Timedelta(weeks=2)
        dates.append(third_friday)

        # Move to next month
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)

    return pd.DatetimeIndex(dates)

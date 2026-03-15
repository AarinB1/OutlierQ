"""Data preprocessing: windowing, normalization, and train/val/test splits."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler, StandardScaler

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


@dataclass
class WindowedDataset:
    """Holds windowed sequences for model training."""
    X_train: np.ndarray
    y_train: np.ndarray
    X_val: np.ndarray
    y_val: np.ndarray
    X_test: np.ndarray
    y_test: np.ndarray
    feature_names: list[str]
    scaler: MinMaxScaler | StandardScaler | None


@dataclass
class WalkForwardSplit:
    """A single walk-forward train/val/test window."""
    train_start: int
    train_end: int
    val_start: int
    val_end: int
    test_start: int
    test_end: int


class DataPreprocessor:
    """Creates rolling-window sequences and chronological splits for time-series models."""

    def __init__(
        self,
        window_size: int = 60,
        prediction_horizon: int = 5,
        train_ratio: float = 0.70,
        val_ratio: float = 0.15,
        normalization: str = "minmax",
    ) -> None:
        self.window_size = window_size
        self.prediction_horizon = prediction_horizon
        self.train_ratio = train_ratio
        self.val_ratio = val_ratio
        self.normalization = normalization

    def create_sequences(
        self,
        df: pd.DataFrame,
        target_col: str = "close",
        exclude_cols: list[str] | None = None,
    ) -> WindowedDataset:
        """Build rolling-window X/y arrays with chronological split.

        Target: direction classification (0=DOWN, 1=HOLD, 2=UP) based on
        future returns over prediction_horizon.
        """
        exclude = set(exclude_cols or [])
        feature_cols = [c for c in df.columns if c not in exclude and c != target_col]

        features = df[feature_cols].values.astype(np.float32)
        prices = df[target_col].values.astype(np.float32)

        scaler = None
        if self.normalization == "minmax":
            scaler = MinMaxScaler()
        elif self.normalization == "standard":
            scaler = StandardScaler()

        if scaler is not None:
            features = scaler.fit_transform(features)

        X, y = [], []
        for i in range(self.window_size, len(features) - self.prediction_horizon):
            X.append(features[i - self.window_size : i])
            future_price = prices[i + self.prediction_horizon - 1]
            current_price = prices[i - 1]
            ret = (future_price - current_price) / current_price if current_price != 0 else 0
            # Classify: DOWN (<-0.5%), HOLD (-0.5% to 0.5%), UP (>0.5%)
            if ret < -0.005:
                y.append(0)
            elif ret > 0.005:
                y.append(2)
            else:
                y.append(1)

        X = np.array(X, dtype=np.float32)
        y = np.array(y, dtype=np.int64)

        n = len(X)
        train_end = int(n * self.train_ratio)
        val_end = int(n * (self.train_ratio + self.val_ratio))

        return WindowedDataset(
            X_train=X[:train_end],
            y_train=y[:train_end],
            X_val=X[train_end:val_end],
            y_val=y[train_end:val_end],
            X_test=X[val_end:],
            y_test=y[val_end:],
            feature_names=feature_cols,
            scaler=scaler,
        )

    def create_regression_sequences(
        self,
        df: pd.DataFrame,
        target_col: str = "close",
        exclude_cols: list[str] | None = None,
    ) -> WindowedDataset:
        """Build rolling-window X/y arrays for regression (predicting future return)."""
        exclude = set(exclude_cols or [])
        feature_cols = [c for c in df.columns if c not in exclude and c != target_col]

        features = df[feature_cols].values.astype(np.float32)
        prices = df[target_col].values.astype(np.float32)

        scaler = None
        if self.normalization == "minmax":
            scaler = MinMaxScaler()
        elif self.normalization == "standard":
            scaler = StandardScaler()

        if scaler is not None:
            features = scaler.fit_transform(features)

        X, y = [], []
        for i in range(self.window_size, len(features) - self.prediction_horizon):
            X.append(features[i - self.window_size : i])
            future_price = prices[i + self.prediction_horizon - 1]
            current_price = prices[i - 1]
            ret = (future_price - current_price) / current_price if current_price != 0 else 0
            y.append(ret)

        X = np.array(X, dtype=np.float32)
        y = np.array(y, dtype=np.float32)

        n = len(X)
        train_end = int(n * self.train_ratio)
        val_end = int(n * (self.train_ratio + self.val_ratio))

        return WindowedDataset(
            X_train=X[:train_end],
            y_train=y[:train_end],
            X_val=X[train_end:val_end],
            y_val=y[train_end:val_end],
            X_test=X[val_end:],
            y_test=y[val_end:],
            feature_names=feature_cols,
            scaler=scaler,
        )

    def generate_walk_forward_splits(
        self,
        n_samples: int,
        train_days: int = 252,
        val_days: int = 63,
        test_days: int = 63,
        step_days: int = 21,
    ) -> list[WalkForwardSplit]:
        """Generate rolling walk-forward train/val/test index ranges."""
        splits = []
        start = 0
        while start + train_days + val_days + test_days <= n_samples:
            splits.append(WalkForwardSplit(
                train_start=start,
                train_end=start + train_days,
                val_start=start + train_days,
                val_end=start + train_days + val_days,
                test_start=start + train_days + val_days,
                test_end=start + train_days + val_days + test_days,
            ))
            start += step_days

        logger.info("Generated %d walk-forward splits from %d samples", len(splits), n_samples)
        return splits

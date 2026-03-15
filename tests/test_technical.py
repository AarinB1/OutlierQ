"""Tests for technical indicator computation and signal adjustments."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from datetime import date, timedelta
from unittest.mock import MagicMock

from src.indicators.technical import TechnicalAnalyzer
from src.signals.signal_engine import SignalEngine


def _price_df_from_close(close: pd.Series) -> pd.DataFrame:
    high = close + 1.5
    low = close - 1.5
    open_ = close.shift(1).fillna(close.iloc[0])
    volume = pd.Series(np.full(len(close), 1_000_000), index=close.index)
    return pd.DataFrame(
        {
            "Open": open_.values,
            "High": high.values,
            "Low": low.values,
            "Close": close.values,
            "Volume": volume.values,
        },
        index=close.index,
    )


@pytest.fixture
def tech() -> TechnicalAnalyzer:
    market = MagicMock()
    return TechnicalAnalyzer(market_fetcher=market)


class TestTechnicalIndicators:
    def test_rsi_overbought(self, tech: TechnicalAnalyzer):
        rising = pd.Series(np.linspace(100, 150, 50))
        rsi = tech.compute_rsi(rising)
        assert float(rsi.dropna().iloc[-1]) > 70

    def test_rsi_oversold(self, tech: TechnicalAnalyzer):
        falling = pd.Series(np.linspace(150, 100, 50))
        rsi = tech.compute_rsi(falling)
        assert float(rsi.dropna().iloc[-1]) < 30

    def test_rsi_neutral(self, tech: TechnicalAnalyzer):
        mixed = pd.Series([100.0 + (1.0 if i % 2 == 0 else -1.0) for i in range(60)])
        rsi = tech.compute_rsi(mixed)
        latest = float(rsi.dropna().iloc[-1])
        assert 30 <= latest <= 70

    def test_rsi_range(self, tech: TechnicalAnalyzer):
        prices = pd.Series(100 + np.random.default_rng(42).normal(0, 1, 100).cumsum())
        rsi = tech.compute_rsi(prices).dropna()
        assert ((rsi >= 0) & (rsi <= 100)).all()

    def test_bollinger_contains_price(self, tech: TechnicalAnalyzer):
        prices = pd.Series(100 + np.random.default_rng(0).normal(0, 1, 120).cumsum())
        bb = tech.compute_bollinger_bands(prices)
        valid = (~bb["lower"].isna()) & (~bb["upper"].isna())
        within = ((prices >= bb["lower"]) & (prices <= bb["upper"]))[valid]
        assert within.mean() > 0.75

    def test_bollinger_pct_b_range(self, tech: TechnicalAnalyzer):
        prices = pd.Series(100 + np.random.default_rng(1).normal(0, 2, 120).cumsum())
        pct_b = tech.compute_bollinger_bands(prices)["pct_b"].dropna()
        assert ((pct_b > -0.5) & (pct_b < 1.5)).mean() > 0.9

    def test_bollinger_bandwidth_positive(self, tech: TechnicalAnalyzer):
        prices = pd.Series(100 + np.random.default_rng(2).normal(0, 2, 120).cumsum())
        bandwidth = tech.compute_bollinger_bands(prices)["bandwidth"].dropna()
        assert (bandwidth > 0).all()

    def test_atr_positive(self, tech: TechnicalAnalyzer):
        close = pd.Series(100 + np.random.default_rng(3).normal(0, 1, 100).cumsum())
        high = close + 2
        low = close - 2
        atr = tech.compute_atr(high, low, close).dropna()
        assert (atr > 0).all()

    def test_atr_higher_for_volatile(self, tech: TechnicalAnalyzer):
        stable_close = pd.Series(100 + np.random.default_rng(4).normal(0, 0.5, 100).cumsum())
        volatile_close = pd.Series(100 + np.random.default_rng(5).normal(0, 3.0, 100).cumsum())
        stable_atr = tech.compute_atr(stable_close + 1, stable_close - 1, stable_close).dropna().iloc[-1]
        volatile_atr = tech.compute_atr(volatile_close + 3, volatile_close - 3, volatile_close).dropna().iloc[-1]
        assert float(volatile_atr) > float(stable_atr)

    def test_macd_crossover(self, tech: TechnicalAnalyzer):
        prices = pd.Series(np.concatenate([np.linspace(100, 95, 40), np.linspace(95, 120, 20)]))
        macd = tech.compute_macd(prices)
        assert float(macd["macd"].iloc[-1]) > float(macd["signal"].iloc[-1])

    def test_get_ticker_indicators_returns_all_fields(self, tech: TechnicalAnalyzer):
        close = pd.Series(np.linspace(100, 120, 70), index=pd.bdate_range("2025-01-01", periods=70))
        df = _price_df_from_close(close)
        tech.market_fetcher.fetch_price_history.return_value = df
        result = tech.get_ticker_indicators("AAPL")
        assert result is not None
        expected_keys = {
            "ticker",
            "current_price",
            "rsi_14",
            "rsi_signal",
            "bollinger_pct_b",
            "bollinger_bandwidth",
            "bollinger_signal",
            "atr_14",
            "atr_pct",
            "macd_signal",
            "macd_histogram",
            "relative_volume",
            "trend_20d",
            "trend_50d",
        }
        assert expected_keys.issubset(result.keys())

    def test_get_ticker_indicators_insufficient_data(self, tech: TechnicalAnalyzer):
        close = pd.Series(np.linspace(100, 120, 20), index=pd.bdate_range("2025-01-01", periods=20))
        tech.market_fetcher.fetch_price_history.return_value = _price_df_from_close(close)
        assert tech.get_ticker_indicators("AAPL") is None


class TestTechnicalAdjustments:
    @pytest.fixture
    def engine(self) -> SignalEngine:
        market = MagicMock()
        market.get_current_price.return_value = 100.0
        market.fetch_options_chain.return_value = {"calls": pd.DataFrame(), "puts": pd.DataFrame()}
        return SignalEngine(market_fetcher=market)

    def test_technical_adjustments_rsi_boost(self, engine: SignalEngine):
        signal = {"direction": "put", "confidence": 0.5, "expected_move_pct": 0.08, "suggested_expiry": "2030-01-01"}
        indicators = {
            "rsi_14": 75.0,
            "rsi_signal": "overbought",
            "bollinger_pct_b": 0.5,
            "bollinger_signal": "upper_half",
            "atr_pct": 2.0,
            "macd_signal": "bearish",
            "relative_volume": 1.0,
        }
        adjusted = engine._apply_technical_adjustments(signal, indicators)
        assert adjusted["confidence"] > 0.5

    def test_technical_adjustments_rsi_reduce(self, engine: SignalEngine):
        signal = {"direction": "put", "confidence": 0.6, "expected_move_pct": 0.08, "suggested_expiry": "2030-01-01"}
        indicators = {
            "rsi_14": 25.0,
            "rsi_signal": "oversold",
            "bollinger_pct_b": 0.5,
            "bollinger_signal": "lower_half",
            "atr_pct": 2.0,
            "macd_signal": "bearish",
            "relative_volume": 1.0,
        }
        adjusted = engine._apply_technical_adjustments(signal, indicators)
        assert adjusted["confidence"] < 0.6

    def test_technical_adjustments_bollinger(self, engine: SignalEngine):
        signal = {"direction": "call", "confidence": 0.5, "expected_move_pct": 0.08, "suggested_expiry": "2030-01-01"}
        indicators = {
            "rsi_14": 50.0,
            "rsi_signal": "neutral",
            "bollinger_pct_b": 0.1,
            "bollinger_signal": "lower_half",
            "atr_pct": 2.0,
            "macd_signal": "bullish",
            "relative_volume": 1.0,
        }
        adjusted = engine._apply_technical_adjustments(signal, indicators)
        assert adjusted["confidence"] > 0.5

    def test_technical_adjustments_macd_align(self, engine: SignalEngine):
        signal = {"direction": "call", "confidence": 0.5, "expected_move_pct": 0.08, "suggested_expiry": "2030-01-01"}
        indicators = {
            "rsi_14": 50.0,
            "rsi_signal": "neutral",
            "bollinger_pct_b": 0.5,
            "bollinger_signal": "upper_half",
            "atr_pct": 2.0,
            "macd_signal": "bullish_cross",
            "relative_volume": 1.0,
        }
        adjusted = engine._apply_technical_adjustments(signal, indicators)
        assert adjusted["confidence"] > 0.5

    def test_atr_move_calibration(self, engine: SignalEngine):
        signal = {
            "direction": "call",
            "confidence": 0.5,
            "expected_move_pct": 0.20,
            "suggested_expiry": (date.today() + timedelta(days=7)).isoformat(),
        }
        indicators = {
            "rsi_14": 50.0,
            "rsi_signal": "neutral",
            "bollinger_pct_b": 0.5,
            "bollinger_signal": "upper_half",
            "atr_pct": 1.0,
            "macd_signal": "bullish",
            "relative_volume": 1.0,
        }
        adjusted = engine._apply_technical_adjustments(signal, indicators)
        notes = adjusted.get("technical_notes", [])
        assert any("ambitious" in note.lower() for note in notes)

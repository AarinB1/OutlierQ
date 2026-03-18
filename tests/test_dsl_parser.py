"""Tests for DSL strategy parser."""

import numpy as np
import pandas as pd
import pytest

from src.trading.strategies.dsl_parser import (
    DSLConfig,
    DSLStrategy,
    Parser,
    evaluate_node,
    tokenize,
)


def test_tokenize_buy_rule():
    tokens = tokenize("BUY WHEN rsi_14 < 30")
    types = [t.type.name for t in tokens if t.type.name != "EOF"]
    assert types == ["KEYWORD", "KEYWORD", "IDENTIFIER", "OPERATOR", "NUMBER"]


def test_tokenize_math():
    tokens = tokenize("atr_14 * 2.5")
    values = [t.value for t in tokens if t.type.name != "EOF"]
    assert values == ["atr_14", "*", 2.5]


def test_parse_buy_sell():
    tokens = tokenize("BUY WHEN rsi_14 < 30 SELL WHEN rsi_14 > 70")
    parser = Parser(tokens)
    config = parser.parse()
    assert config.buy_rule is not None
    assert config.sell_rule is not None
    assert config.buy_rule.action == "BUY"
    assert config.sell_rule.action == "SELL"


def test_parse_stop_loss_take_profit():
    tokens = tokenize("BUY WHEN close > 100 STOP_LOSS = atr_14 * 2 TAKE_PROFIT = atr_14 * 3")
    parser = Parser(tokens)
    config = parser.parse()
    assert config.buy_rule is not None
    assert config.stop_loss_expr is not None
    assert config.take_profit_expr is not None


def test_parse_and_or():
    tokens = tokenize("BUY WHEN rsi_14 < 30 AND close > sma_200 OR volume > 1000000")
    parser = Parser(tokens)
    config = parser.parse()
    assert config.buy_rule is not None


def test_parse_not():
    tokens = tokenize("BUY WHEN NOT rsi_14 > 70")
    parser = Parser(tokens)
    config = parser.parse()
    assert config.buy_rule is not None


def test_parse_parentheses():
    tokens = tokenize("BUY WHEN (rsi_14 < 30 OR rsi_14 > 70) AND close > 100")
    parser = Parser(tokens)
    config = parser.parse()
    assert config.buy_rule is not None


def test_evaluate_simple_comparison():
    tokens = tokenize("BUY WHEN close > 100")
    parser = Parser(tokens)
    config = parser.parse()
    assert evaluate_node(config.buy_rule.condition, {"close": 150}) is True
    assert evaluate_node(config.buy_rule.condition, {"close": 50}) is False


def test_evaluate_math_expression():
    tokens = tokenize("BUY WHEN close > sma_200 * 1.05")
    parser = Parser(tokens)
    config = parser.parse()
    row = {"close": 110, "sma_200": 100}
    assert evaluate_node(config.buy_rule.condition, row) is True
    row2 = {"close": 102, "sma_200": 100}
    assert evaluate_node(config.buy_rule.condition, row2) is False


def test_evaluate_and():
    tokens = tokenize("BUY WHEN rsi_14 < 30 AND close > 100")
    parser = Parser(tokens)
    config = parser.parse()
    assert evaluate_node(config.buy_rule.condition, {"rsi_14": 25, "close": 110}) is True
    assert evaluate_node(config.buy_rule.condition, {"rsi_14": 25, "close": 90}) is False
    assert evaluate_node(config.buy_rule.condition, {"rsi_14": 35, "close": 110}) is False


def test_evaluate_division_by_zero():
    tokens = tokenize("BUY WHEN close / volume > 1")
    parser = Parser(tokens)
    config = parser.parse()
    # Division by zero returns 0.0
    result = evaluate_node(config.buy_rule.condition, {"close": 100, "volume": 0})
    assert result is False  # 0.0 > 1 is False


def test_unknown_column_raises():
    tokens = tokenize("BUY WHEN unknown_col > 100")
    parser = Parser(tokens)
    config = parser.parse()
    with pytest.raises(ValueError, match="Unknown column"):
        evaluate_node(config.buy_rule.condition, {"close": 100})


def test_syntax_error():
    with pytest.raises(SyntaxError):
        tokens = tokenize("BUY WHEN")
        parser = Parser(tokens)
        parser.parse()


def test_unexpected_character():
    with pytest.raises(SyntaxError, match="Unexpected character"):
        tokenize("BUY WHEN close @ 100")


def test_dsl_strategy_from_rules():
    strategy = DSLStrategy.from_rules("BUY WHEN rsi_14 < 30 SELL WHEN rsi_14 > 70")
    assert strategy.name == "dsl_custom"
    assert strategy.config.buy_rule is not None
    assert strategy.config.sell_rule is not None


def test_dsl_strategy_missing_buy():
    with pytest.raises(ValueError, match="BUY WHEN"):
        DSLStrategy.from_rules("SELL WHEN rsi_14 > 70")


def test_dsl_strategy_validate_columns():
    strategy = DSLStrategy.from_rules("BUY WHEN rsi_14 < 30 AND close > sma_200")
    missing = strategy.validate_columns(["close", "rsi_14"])
    assert "sma_200" in missing


def test_dsl_strategy_generate_signals():
    strategy = DSLStrategy.from_rules(
        "BUY WHEN rsi_14 < 30 SELL WHEN rsi_14 > 70"
    )
    dates = pd.date_range("2024-01-01", periods=5, freq="B")
    df = pd.DataFrame(
        {"close": [100, 101, 102, 103, 104], "rsi_14": [25, 28, 50, 75, 80]},
        index=dates,
    )
    signals = strategy.generate_signals(df)
    assert isinstance(signals, pd.DataFrame)
    assert "signal" in signals.columns
    # First two bars: rsi < 30 → buy signal (1), but only first triggers buy (state tracking)
    assert signals.iloc[0]["signal"] == 1
    # After buying, rsi > 70 at index 3 or 4 → sell
    assert signals.iloc[3]["signal"] == -1 or signals.iloc[4]["signal"] == -1

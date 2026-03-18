"""Safe, sandboxed rule-based strategy DSL.

Example syntax:
    BUY WHEN rsi_14 < 30 AND close > sma_200 AND volume > avg_volume_20 * 1.5
    SELL WHEN rsi_14 > 70 OR close < sma_200
    STOP_LOSS = atr_14 * 2
    TAKE_PROFIT = atr_14 * 3

SECURITY: No eval(), no exec(), no imports. Whitelist operators only.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum, auto

import numpy as np
import pandas as pd

from src.trading.strategies.base_strategy import BaseStrategy

logger = logging.getLogger(__name__)


class TokenType(Enum):
    NUMBER = auto()
    IDENTIFIER = auto()
    OPERATOR = auto()    # <, >, <=, >=, ==, !=
    LOGIC = auto()       # AND, OR, NOT
    MATH = auto()        # +, -, *, /
    LPAREN = auto()
    RPAREN = auto()
    KEYWORD = auto()     # BUY, SELL, WHEN, STOP_LOSS, TAKE_PROFIT
    ASSIGN = auto()      # =
    EOF = auto()


@dataclass
class Token:
    type: TokenType
    value: str | float


# Allowed keywords
KEYWORDS = {"BUY", "SELL", "WHEN", "STOP_LOSS", "TAKE_PROFIT"}
LOGIC_OPS = {"AND", "OR", "NOT"}
COMPARISON_OPS = {"<", ">", "<=", ">=", "==", "!="}
MATH_OPS = {"+", "-", "*", "/"}
SAFE_FUNCTIONS = {"abs", "max", "min"}


def tokenize(text: str) -> list[Token]:
    """Tokenize a DSL rule string into a list of tokens."""
    tokens: list[Token] = []
    i = 0
    text = text.strip()

    while i < len(text):
        c = text[i]

        # Skip whitespace
        if c.isspace():
            i += 1
            continue

        # Numbers (including decimals)
        if c.isdigit() or (c == "." and i + 1 < len(text) and text[i + 1].isdigit()):
            j = i
            has_dot = False
            while j < len(text) and (text[j].isdigit() or (text[j] == "." and not has_dot)):
                if text[j] == ".":
                    has_dot = True
                j += 1
            tokens.append(Token(TokenType.NUMBER, float(text[i:j])))
            i = j
            continue

        # Identifiers and keywords
        if c.isalpha() or c == "_":
            j = i
            while j < len(text) and (text[j].isalnum() or text[j] == "_"):
                j += 1
            word = text[i:j]
            upper = word.upper()

            if upper in KEYWORDS:
                tokens.append(Token(TokenType.KEYWORD, upper))
            elif upper in LOGIC_OPS:
                tokens.append(Token(TokenType.LOGIC, upper))
            else:
                tokens.append(Token(TokenType.IDENTIFIER, word))
            i = j
            continue

        # Two-character operators
        if i + 1 < len(text) and text[i : i + 2] in COMPARISON_OPS:
            tokens.append(Token(TokenType.OPERATOR, text[i : i + 2]))
            i += 2
            continue

        # Single-character operators
        if c in {"<", ">"}:
            tokens.append(Token(TokenType.OPERATOR, c))
            i += 1
            continue

        if c == "=" and i + 1 < len(text) and text[i + 1] == "=":
            tokens.append(Token(TokenType.OPERATOR, "=="))
            i += 2
            continue

        if c == "!" and i + 1 < len(text) and text[i + 1] == "=":
            tokens.append(Token(TokenType.OPERATOR, "!="))
            i += 2
            continue

        if c == "=":
            tokens.append(Token(TokenType.ASSIGN, "="))
            i += 1
            continue

        if c in MATH_OPS:
            tokens.append(Token(TokenType.MATH, c))
            i += 1
            continue

        if c == "(":
            tokens.append(Token(TokenType.LPAREN, "("))
            i += 1
            continue

        if c == ")":
            tokens.append(Token(TokenType.RPAREN, ")"))
            i += 1
            continue

        raise SyntaxError(f"Unexpected character '{c}' at position {i}")

    tokens.append(Token(TokenType.EOF, ""))
    return tokens


@dataclass
class ExprNode:
    """AST node for an expression."""
    pass


@dataclass
class NumberNode(ExprNode):
    value: float


@dataclass
class IdentifierNode(ExprNode):
    name: str


@dataclass
class BinaryOpNode(ExprNode):
    left: ExprNode
    op: str
    right: ExprNode


@dataclass
class UnaryOpNode(ExprNode):
    op: str
    operand: ExprNode


@dataclass
class Rule:
    """A parsed BUY or SELL rule."""
    action: str  # "BUY" or "SELL"
    condition: ExprNode


@dataclass
class DSLConfig:
    buy_rule: Rule | None = None
    sell_rule: Rule | None = None
    stop_loss_expr: ExprNode | None = None
    take_profit_expr: ExprNode | None = None


class Parser:
    """Recursive descent parser for DSL rules."""

    def __init__(self, tokens: list[Token]) -> None:
        self.tokens = tokens
        self.pos = 0

    def peek(self) -> Token:
        return self.tokens[self.pos]

    def advance(self) -> Token:
        t = self.tokens[self.pos]
        self.pos += 1
        return t

    def expect(self, type_: TokenType, value: str | None = None) -> Token:
        t = self.advance()
        if t.type != type_:
            raise SyntaxError(f"Expected {type_}, got {t.type} ({t.value})")
        if value is not None and str(t.value) != value:
            raise SyntaxError(f"Expected '{value}', got '{t.value}'")
        return t

    def parse(self) -> DSLConfig:
        config = DSLConfig()
        while self.peek().type != TokenType.EOF:
            t = self.peek()
            if t.type == TokenType.KEYWORD and t.value in ("BUY", "SELL"):
                rule = self.parse_rule()
                if rule.action == "BUY":
                    config.buy_rule = rule
                else:
                    config.sell_rule = rule
            elif t.type == TokenType.KEYWORD and t.value == "STOP_LOSS":
                self.advance()
                self.expect(TokenType.ASSIGN)
                config.stop_loss_expr = self.parse_expression()
            elif t.type == TokenType.KEYWORD and t.value == "TAKE_PROFIT":
                self.advance()
                self.expect(TokenType.ASSIGN)
                config.take_profit_expr = self.parse_expression()
            else:
                raise SyntaxError(f"Unexpected token: {t.value}")
        return config

    def parse_rule(self) -> Rule:
        action = self.advance().value  # BUY or SELL
        self.expect(TokenType.KEYWORD, "WHEN")
        condition = self.parse_or_expr()
        return Rule(action=str(action), condition=condition)

    def parse_or_expr(self) -> ExprNode:
        left = self.parse_and_expr()
        while self.peek().type == TokenType.LOGIC and self.peek().value == "OR":
            self.advance()
            right = self.parse_and_expr()
            left = BinaryOpNode(left, "OR", right)
        return left

    def parse_and_expr(self) -> ExprNode:
        left = self.parse_not_expr()
        while self.peek().type == TokenType.LOGIC and self.peek().value == "AND":
            self.advance()
            right = self.parse_not_expr()
            left = BinaryOpNode(left, "AND", right)
        return left

    def parse_not_expr(self) -> ExprNode:
        if self.peek().type == TokenType.LOGIC and self.peek().value == "NOT":
            self.advance()
            operand = self.parse_comparison()
            return UnaryOpNode("NOT", operand)
        return self.parse_comparison()

    def parse_comparison(self) -> ExprNode:
        left = self.parse_expression()
        if self.peek().type == TokenType.OPERATOR:
            op = self.advance().value
            right = self.parse_expression()
            return BinaryOpNode(left, str(op), right)
        return left

    def parse_expression(self) -> ExprNode:
        left = self.parse_term()
        while self.peek().type == TokenType.MATH and self.peek().value in ("+", "-"):
            op = self.advance().value
            right = self.parse_term()
            left = BinaryOpNode(left, str(op), right)
        return left

    def parse_term(self) -> ExprNode:
        left = self.parse_atom()
        while self.peek().type == TokenType.MATH and self.peek().value in ("*", "/"):
            op = self.advance().value
            right = self.parse_atom()
            left = BinaryOpNode(left, str(op), right)
        return left

    def parse_atom(self) -> ExprNode:
        t = self.peek()
        if t.type == TokenType.NUMBER:
            self.advance()
            return NumberNode(float(t.value))
        if t.type == TokenType.IDENTIFIER:
            self.advance()
            return IdentifierNode(str(t.value))
        if t.type == TokenType.LPAREN:
            self.advance()
            expr = self.parse_or_expr()
            self.expect(TokenType.RPAREN)
            return expr
        raise SyntaxError(f"Unexpected token: {t.value}")


def evaluate_node(node: ExprNode, row: dict) -> float | bool:
    """Evaluate an AST node against a data row."""
    if isinstance(node, NumberNode):
        return node.value
    if isinstance(node, IdentifierNode):
        if node.name not in row:
            raise ValueError(f"Unknown column: {node.name}")
        val = row[node.name]
        if isinstance(val, (int, float, np.integer, np.floating)):
            return float(val)
        return val
    if isinstance(node, UnaryOpNode):
        if node.op == "NOT":
            return not evaluate_node(node.operand, row)
        raise ValueError(f"Unknown unary op: {node.op}")
    if isinstance(node, BinaryOpNode):
        left = evaluate_node(node.left, row)
        right = evaluate_node(node.right, row)
        ops = {
            "+": lambda a, b: float(a) + float(b),
            "-": lambda a, b: float(a) - float(b),
            "*": lambda a, b: float(a) * float(b),
            "/": lambda a, b: float(a) / float(b) if float(b) != 0 else 0.0,
            "<": lambda a, b: float(a) < float(b),
            ">": lambda a, b: float(a) > float(b),
            "<=": lambda a, b: float(a) <= float(b),
            ">=": lambda a, b: float(a) >= float(b),
            "==": lambda a, b: float(a) == float(b),
            "!=": lambda a, b: float(a) != float(b),
            "AND": lambda a, b: bool(a) and bool(b),
            "OR": lambda a, b: bool(a) or bool(b),
        }
        fn = ops.get(node.op)
        if fn is None:
            raise ValueError(f"Unknown operator: {node.op}")
        return fn(left, right)
    raise ValueError(f"Unknown node type: {type(node)}")


def _collect_identifiers(node: ExprNode) -> set[str]:
    """Recursively collect all identifier names from an AST."""
    if isinstance(node, IdentifierNode):
        return {node.name}
    if isinstance(node, NumberNode):
        return set()
    if isinstance(node, UnaryOpNode):
        return _collect_identifiers(node.operand)
    if isinstance(node, BinaryOpNode):
        return _collect_identifiers(node.left) | _collect_identifiers(node.right)
    return set()


class DSLStrategy(BaseStrategy):
    """Strategy driven by user-defined DSL rules."""

    def __init__(self, config: DSLConfig) -> None:
        super().__init__()
        self.config = config
        self.name = "dsl_custom"

    @classmethod
    def from_rules(cls, rules_text: str) -> DSLStrategy:
        """Parse DSL rules text and return a strategy instance."""
        tokens = tokenize(rules_text)
        parser = Parser(tokens)
        config = parser.parse()
        if config.buy_rule is None:
            raise ValueError("DSL must include a BUY WHEN rule")
        return cls(config)

    def validate_columns(self, columns: list[str]) -> list[str]:
        """Return list of identifiers referenced in rules but missing from columns."""
        referenced: set[str] = set()
        for rule in [self.config.buy_rule, self.config.sell_rule]:
            if rule:
                referenced |= _collect_identifiers(rule.condition)
        for expr in [self.config.stop_loss_expr, self.config.take_profit_expr]:
            if expr:
                referenced |= _collect_identifiers(expr)
        col_set = set(columns)
        return sorted(referenced - col_set)

    def generate_signals(self, features_df: pd.DataFrame) -> pd.DataFrame:
        """Generate buy/sell signals from DSL rules."""
        signals = pd.DataFrame(index=features_df.index)
        signals["signal"] = 0  # 0=hold, 1=buy, -1=sell
        signals["stop_loss"] = np.nan
        signals["take_profit"] = np.nan

        in_position = False

        for i, (idx, row) in enumerate(features_df.iterrows()):
            row_dict = row.to_dict()
            try:
                if not in_position and self.config.buy_rule:
                    if evaluate_node(self.config.buy_rule.condition, row_dict):
                        signals.at[idx, "signal"] = 1
                        in_position = True

                        if self.config.stop_loss_expr:
                            sl_val = evaluate_node(self.config.stop_loss_expr, row_dict)
                            signals.at[idx, "stop_loss"] = row_dict.get("close", 0) - float(sl_val)
                        if self.config.take_profit_expr:
                            tp_val = evaluate_node(self.config.take_profit_expr, row_dict)
                            signals.at[idx, "take_profit"] = row_dict.get("close", 0) + float(tp_val)

                elif in_position and self.config.sell_rule:
                    if evaluate_node(self.config.sell_rule.condition, row_dict):
                        signals.at[idx, "signal"] = -1
                        in_position = False

            except (ValueError, TypeError) as e:
                logger.debug("DSL evaluation error at row %d: %s", i, e)
                continue

        return signals

    def get_parameters(self) -> dict:
        return {"rules": "custom_dsl"}

    def set_parameters(self, params: dict) -> None:
        pass

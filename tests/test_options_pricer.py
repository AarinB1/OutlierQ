"""Tests for Black-Scholes options pricer."""

import math

import pytest

from src.signals.options_pricer import (
    call_price,
    delta,
    gamma,
    implied_volatility,
    price_option,
    put_price,
    theta,
    vega,
)


# Standard test params: S=100, K=100, T=1, r=0.05, sigma=0.2
S, K, T, r, sigma = 100.0, 100.0, 1.0, 0.05, 0.2


def test_call_price_atm():
    price = call_price(S, K, T, r, sigma)
    # ATM call with these params should be around 10.45
    assert 9.0 < price < 12.0


def test_put_price_atm():
    price = put_price(S, K, T, r, sigma)
    # ATM put should be around 5.57
    assert 4.0 < price < 8.0


def test_put_call_parity():
    """C - P = S - K*exp(-rT)"""
    c = call_price(S, K, T, r, sigma)
    p = put_price(S, K, T, r, sigma)
    parity = S - K * math.exp(-r * T)
    assert abs((c - p) - parity) < 0.01


def test_deep_itm_call():
    c = call_price(150, 100, 1.0, 0.05, 0.2)
    # Deep ITM call should be at least intrinsic value
    assert c > 50.0


def test_deep_otm_call():
    c = call_price(50, 100, 1.0, 0.05, 0.2)
    # Deep OTM call should be near zero
    assert c < 1.0


def test_expired_option():
    c = call_price(110, 100, 0.0, 0.05, 0.2)
    # Expired ITM call = intrinsic value
    assert abs(c - 10.0) < 0.01


def test_delta_call():
    d = delta(S, K, T, r, sigma, "call")
    # ATM call delta ~0.5-0.65
    assert 0.4 < d < 0.7


def test_delta_put():
    d = delta(S, K, T, r, sigma, "put")
    # ATM put delta ~-0.5 to -0.35
    assert -0.7 < d < -0.3


def test_gamma_positive():
    g = gamma(S, K, T, r, sigma)
    assert g > 0


def test_vega_positive():
    v = vega(S, K, T, r, sigma)
    assert v > 0


def test_theta_negative():
    # Theta is generally negative (time decay)
    t_call = theta(S, K, T, r, sigma, "call")
    assert t_call < 0


def test_implied_volatility():
    # Price a call, then recover IV from that price
    market_price = call_price(S, K, T, r, sigma)
    iv = implied_volatility(market_price, S, K, T, r, "call")
    assert abs(iv - sigma) < 0.001


def test_implied_volatility_put():
    market_price = put_price(S, K, T, r, sigma)
    iv = implied_volatility(market_price, S, K, T, r, "put")
    assert abs(iv - sigma) < 0.001


def test_price_option_convenience():
    result = price_option(S, K, T, r, sigma, "call")
    assert "price" in result
    assert "delta" in result
    assert "gamma" in result
    assert "theta" in result
    assert "vega" in result
    assert result["price"] > 0

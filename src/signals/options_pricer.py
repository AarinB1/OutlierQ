"""Black-Scholes-Merton options pricing with Greeks."""

import math

from scipy.stats import norm


def call_price(S: float, K: float, T: float, r: float, sigma: float) -> float:
    """Black-Scholes call option price.

    S=spot, K=strike, T=time to expiry (years), r=risk-free rate, sigma=IV.
    """
    if T <= 0:
        return max(S - K, 0)
    d1 = (math.log(S / K) + (r + sigma**2 / 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    return S * norm.cdf(d1) - K * math.exp(-r * T) * norm.cdf(d2)


def put_price(S: float, K: float, T: float, r: float, sigma: float) -> float:
    """Black-Scholes put option price."""
    if T <= 0:
        return max(K - S, 0)
    d1 = (math.log(S / K) + (r + sigma**2 / 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    return K * math.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)


def delta(S: float, K: float, T: float, r: float, sigma: float, option_type: str = "call") -> float:
    if T <= 0:
        if option_type == "call":
            return 1.0 if S > K else 0.0
        return -1.0 if S < K else 0.0
    d1 = (math.log(S / K) + (r + sigma**2 / 2) * T) / (sigma * math.sqrt(T))
    return norm.cdf(d1) if option_type == "call" else norm.cdf(d1) - 1


def gamma(S: float, K: float, T: float, r: float, sigma: float) -> float:
    if T <= 0:
        return 0.0
    d1 = (math.log(S / K) + (r + sigma**2 / 2) * T) / (sigma * math.sqrt(T))
    return norm.pdf(d1) / (S * sigma * math.sqrt(T))


def theta(S: float, K: float, T: float, r: float, sigma: float, option_type: str = "call") -> float:
    if T <= 0:
        return 0.0
    d1 = (math.log(S / K) + (r + sigma**2 / 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    common = -(S * norm.pdf(d1) * sigma) / (2 * math.sqrt(T))
    if option_type == "call":
        return (common - r * K * math.exp(-r * T) * norm.cdf(d2)) / 365
    return (common + r * K * math.exp(-r * T) * norm.cdf(-d2)) / 365


def vega(S: float, K: float, T: float, r: float, sigma: float) -> float:
    """Vega per 1% IV change."""
    if T <= 0:
        return 0.0
    d1 = (math.log(S / K) + (r + sigma**2 / 2) * T) / (sigma * math.sqrt(T))
    return S * norm.pdf(d1) * math.sqrt(T) / 100


def implied_volatility(
    market_price: float,
    S: float,
    K: float,
    T: float,
    r: float,
    option_type: str = "call",
    tol: float = 1e-6,
    max_iter: int = 100,
) -> float:
    """Newton-Raphson IV solver."""
    sigma = 0.3  # initial guess
    price_fn = call_price if option_type == "call" else put_price
    for _ in range(max_iter):
        price = price_fn(S, K, T, r, sigma)
        v = vega(S, K, T, r, sigma) * 100  # un-scale vega
        if abs(v) < 1e-12:
            break
        sigma -= (price - market_price) / v
        sigma = max(0.01, min(5.0, sigma))
        if abs(price - market_price) < tol:
            break
    return sigma


def price_option(
    S: float,
    K: float,
    T: float,
    r: float,
    sigma: float,
    option_type: str = "call",
) -> dict:
    """Convenience: returns price and all Greeks as a dict."""
    price_fn = call_price if option_type == "call" else put_price
    return {
        "price": round(price_fn(S, K, T, r, sigma), 4),
        "delta": round(delta(S, K, T, r, sigma, option_type), 4),
        "gamma": round(gamma(S, K, T, r, sigma), 6),
        "theta": round(theta(S, K, T, r, sigma, option_type), 4),
        "vega": round(vega(S, K, T, r, sigma), 4),
    }

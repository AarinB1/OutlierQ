"""Kalshi live execution via REST API v2 with RSA-PSS authentication."""

import logging
import time
import uuid
from datetime import datetime
from typing import Optional

import requests

logger = logging.getLogger(__name__)


class KalshiExecutor:
    """Places real orders on Kalshi via REST API v2.

    Auth: RSA-PSS key signing.
    Prices: cents (integers). A yes_price of 65 = $0.65.
    Demo mode uses https://demo-api.kalshi.co/trade-api/v2
    """

    DEMO_URL = "https://demo-api.kalshi.co/trade-api/v2"
    PROD_URL = "https://api.elections.kalshi.com/trade-api/v2"

    def __init__(
        self,
        api_key_id: str = "",
        private_key_path: str = "",
        demo: bool = True,
    ):
        self.base_url = self.DEMO_URL if demo else self.PROD_URL
        self.api_key_id = api_key_id
        self.demo = demo
        self._private_key = None

        if private_key_path:
            self._load_private_key(private_key_path)

        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json",
        })

        if not demo:
            logger.warning("KalshiExecutor initialized in LIVE mode — real money at risk!")

    def _load_private_key(self, path: str) -> None:
        """Load RSA private key for request signing."""
        try:
            from cryptography.hazmat.primitives.serialization import load_pem_private_key
            with open(path, "rb") as f:
                self._private_key = load_pem_private_key(f.read(), password=None)
            logger.info("Kalshi private key loaded from %s", path)
        except Exception:
            logger.exception("Failed to load Kalshi private key from %s", path)

    def _sign_request(self, method: str, path: str, timestamp: str) -> str:
        """RSA-PSS signature for Kalshi auth headers."""
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding
        import base64

        message = f"{timestamp}{method}{path}".encode()
        signature = self._private_key.sign(
            message,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH,
            ),
            hashes.SHA256(),
        )
        return base64.b64encode(signature).decode()

    def _auth_headers(self, method: str, path: str) -> dict:
        """Generate authentication headers."""
        if not self._private_key or not self.api_key_id:
            raise RuntimeError("Kalshi API key and private key are required for authenticated requests")

        timestamp = str(int(time.time() * 1000))
        signature = self._sign_request(method, path, timestamp)
        return {
            "KALSHI-ACCESS-KEY": self.api_key_id,
            "KALSHI-ACCESS-SIGNATURE": signature,
            "KALSHI-ACCESS-TIMESTAMP": timestamp,
        }

    def place_order(
        self,
        ticker: str,
        side: str,
        action: str = "buy",
        contracts: int = 1,
        price_cents: int = 50,
        order_type: str = "limit",
        client_order_id: str | None = None,
    ) -> dict:
        """POST /trade-api/v2/portfolio/orders

        Args:
            ticker: Kalshi market ticker
            side: "yes" or "no"
            action: "buy" or "sell"
            contracts: number of contracts
            price_cents: price in cents (e.g. 65 = $0.65)
            order_type: "limit" or "market"
            client_order_id: idempotency key

        Returns:
            API response dict with order details.
        """
        path = "/trade-api/v2/portfolio/orders"
        url = f"{self.base_url.rstrip('/trade-api/v2')}{path}"

        if client_order_id is None:
            client_order_id = f"oq-{uuid.uuid4().hex[:12]}"

        payload = {
            "ticker": ticker,
            "action": action,
            "side": side,
            "count": contracts,
            "type": order_type,
            "client_order_id": client_order_id,
        }
        if order_type == "limit":
            payload["yes_price" if side == "yes" else "no_price"] = price_cents

        headers = self._auth_headers("POST", path)
        resp = self.session.post(url, json=payload, headers=headers, timeout=15)
        resp.raise_for_status()
        result = resp.json()
        logger.info("Kalshi order placed: %s %s %d %s @ %dc", action, side, contracts, ticker, price_cents)
        return result

    def get_positions(self) -> list[dict]:
        """GET /trade-api/v2/portfolio/positions"""
        path = "/trade-api/v2/portfolio/positions"
        url = f"{self.base_url.rstrip('/trade-api/v2')}{path}"
        headers = self._auth_headers("GET", path)
        resp = self.session.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return data.get("market_positions", [])

    def get_balance(self) -> dict:
        """GET /trade-api/v2/portfolio/balance"""
        path = "/trade-api/v2/portfolio/balance"
        url = f"{self.base_url.rstrip('/trade-api/v2')}{path}"
        headers = self._auth_headers("GET", path)
        resp = self.session.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def cancel_order(self, order_id: str) -> dict:
        """DELETE /trade-api/v2/portfolio/orders/{order_id}"""
        path = f"/trade-api/v2/portfolio/orders/{order_id}"
        url = f"{self.base_url.rstrip('/trade-api/v2')}{path}"
        headers = self._auth_headers("DELETE", path)
        resp = self.session.delete(url, headers=headers, timeout=15)
        resp.raise_for_status()
        return resp.json()

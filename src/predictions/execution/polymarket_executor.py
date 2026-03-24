"""Polymarket live execution via CLOB API with Polygon wallet authentication."""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


class PolymarketExecutor:
    """Places real orders on Polymarket via CLOB API.

    Auth: Polygon wallet private key.
    Prices: decimals (0.65 = 65 cents). Settles in USDC.
    Uses py-clob-client SDK.
    """

    def __init__(
        self,
        private_key: str = "",
        funder_address: str = "",
        signature_type: int = 0,
    ):
        self.private_key = private_key
        self.funder_address = funder_address
        self.signature_type = signature_type
        self._client = None

        if private_key:
            self._init_client()

    def _init_client(self) -> None:
        """Initialize the CLOB client with credentials."""
        try:
            from py_clob_client.client import ClobClient
            self._client = ClobClient(
                "https://clob.polymarket.com",
                key=self.private_key,
                chain_id=137,
                signature_type=self.signature_type,
                funder=self.funder_address,
            )
            self._client.set_api_creds(self._client.create_or_derive_api_creds())
            logger.info("Polymarket CLOB client initialized")
        except ImportError:
            logger.error("py-clob-client not installed. Install with: pip install py-clob-client")
            raise
        except Exception:
            logger.exception("Failed to initialize Polymarket CLOB client")
            raise

    @property
    def client(self):
        if self._client is None:
            raise RuntimeError("Polymarket client not initialized — provide private_key")
        return self._client

    def place_order(
        self,
        token_id: str,
        side: str,
        amount_dollars: float,
        price: float,
        order_type: str = "GTC",
    ) -> dict:
        """Create and post an order via py-clob-client.

        Args:
            token_id: CLOB token ID (from clobTokenIds in Gamma API)
            side: "BUY" or "SELL"
            amount_dollars: amount in USD
            price: price (0.0-1.0)
            order_type: "GTC" (good-til-cancelled), "FOK", "GTD"

        Returns:
            Order response dict from CLOB API.
        """
        from py_clob_client.order_builder.constants import BUY, SELL

        clob_side = BUY if side.upper() == "BUY" else SELL

        order_args = {
            "token_id": token_id,
            "price": price,
            "size": amount_dollars / price if price > 0 else 0,
            "side": clob_side,
        }

        if order_type == "GTC":
            signed_order = self.client.create_limit_order(order_args)
        else:
            signed_order = self.client.create_market_order(order_args)

        result = self.client.post_order(signed_order, order_type=order_type)
        logger.info(
            "Polymarket order placed: %s $%.2f @ %.2f on token %s",
            side, amount_dollars, price, token_id[:16],
        )
        return result

    def get_positions(self) -> list[dict]:
        """Fetch open positions from CLOB API."""
        try:
            return self.client.get_positions() or []
        except Exception:
            logger.exception("Failed to fetch Polymarket positions")
            return []

    def cancel_order(self, order_id: str) -> dict:
        """Cancel an open order."""
        return self.client.cancel(order_id)

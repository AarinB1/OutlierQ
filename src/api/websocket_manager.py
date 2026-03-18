"""WebSocket manager for real-time signal broadcasting."""

import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections and broadcasts messages."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("WebSocket client connected (%d active)", len(self.active_connections))

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info("WebSocket client disconnected (%d active)", len(self.active_connections))

    async def broadcast(self, message: dict) -> None:
        """Send a message to all connected clients."""
        data = json.dumps(message)
        disconnected = []
        for conn in self.active_connections:
            try:
                await conn.send_text(data)
            except Exception:
                disconnected.append(conn)
        for conn in disconnected:
            self.disconnect(conn)

    async def broadcast_signal(self, signal: dict) -> None:
        await self.broadcast({"type": "new_signal", "data": signal})

    async def broadcast_regime_change(self, regime: dict) -> None:
        await self.broadcast({"type": "regime_change", "data": regime})

    async def broadcast_alert(self, alert: dict) -> None:
        await self.broadcast({"type": "alert", "data": alert})


ws_manager = ConnectionManager()

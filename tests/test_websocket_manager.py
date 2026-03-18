"""Tests for WebSocket connection manager."""

import asyncio
import json

import pytest

from src.api.websocket_manager import ConnectionManager


class MockWebSocket:
    """Mock WebSocket for testing."""

    def __init__(self):
        self.accepted = False
        self.sent_messages = []
        self.should_fail = False

    async def accept(self):
        self.accepted = True

    async def send_text(self, data: str):
        if self.should_fail:
            raise RuntimeError("Connection closed")
        self.sent_messages.append(data)


@pytest.mark.asyncio
async def test_connect():
    manager = ConnectionManager()
    ws = MockWebSocket()
    await manager.connect(ws)
    assert ws.accepted
    assert ws in manager.active_connections
    assert len(manager.active_connections) == 1


@pytest.mark.asyncio
async def test_disconnect():
    manager = ConnectionManager()
    ws = MockWebSocket()
    await manager.connect(ws)
    manager.disconnect(ws)
    assert ws not in manager.active_connections
    assert len(manager.active_connections) == 0


@pytest.mark.asyncio
async def test_disconnect_not_connected():
    manager = ConnectionManager()
    ws = MockWebSocket()
    # Should not raise
    manager.disconnect(ws)
    assert len(manager.active_connections) == 0


@pytest.mark.asyncio
async def test_broadcast():
    manager = ConnectionManager()
    ws1 = MockWebSocket()
    ws2 = MockWebSocket()
    await manager.connect(ws1)
    await manager.connect(ws2)

    await manager.broadcast({"type": "test", "data": "hello"})

    msg = json.dumps({"type": "test", "data": "hello"})
    assert ws1.sent_messages == [msg]
    assert ws2.sent_messages == [msg]


@pytest.mark.asyncio
async def test_broadcast_removes_failed_connections():
    manager = ConnectionManager()
    ws1 = MockWebSocket()
    ws2 = MockWebSocket()
    await manager.connect(ws1)
    await manager.connect(ws2)

    ws2.should_fail = True
    await manager.broadcast({"type": "test"})

    assert ws1 in manager.active_connections
    assert ws2 not in manager.active_connections


@pytest.mark.asyncio
async def test_broadcast_signal():
    manager = ConnectionManager()
    ws = MockWebSocket()
    await manager.connect(ws)

    await manager.broadcast_signal({"ticker": "AAPL", "direction": "BUY"})
    data = json.loads(ws.sent_messages[0])
    assert data["type"] == "new_signal"
    assert data["data"]["ticker"] == "AAPL"


@pytest.mark.asyncio
async def test_broadcast_regime_change():
    manager = ConnectionManager()
    ws = MockWebSocket()
    await manager.connect(ws)

    await manager.broadcast_regime_change({"regime": "bullish"})
    data = json.loads(ws.sent_messages[0])
    assert data["type"] == "regime_change"


@pytest.mark.asyncio
async def test_broadcast_alert():
    manager = ConnectionManager()
    ws = MockWebSocket()
    await manager.connect(ws)

    await manager.broadcast_alert({"level": "high"})
    data = json.loads(ws.sent_messages[0])
    assert data["type"] == "alert"

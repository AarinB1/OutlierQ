"""Tests for alert dispatcher."""

import pytest
from unittest.mock import patch, MagicMock

from src.alerts.alert_dispatcher import (
    AlertDispatcher,
    ConsoleChannel,
    EmailChannel,
    WebhookChannel,
)


def test_console_channel_send(caplog):
    channel = ConsoleChannel()
    signal = {
        "direction": "BUY",
        "ticker": "AAPL",
        "current_price": 150.0,
        "confidence": 0.85,
    }
    import logging
    with caplog.at_level(logging.INFO, logger="src.alerts.alert_dispatcher"):
        channel.send(signal)
    assert "ALERT" in caplog.text
    assert "BUY" in caplog.text
    assert "AAPL" in caplog.text


def test_webhook_channel_send():
    with patch("src.alerts.alert_dispatcher.requests.post") as mock_post:
        channel = WebhookChannel("https://example.com/hook")
        signal = {"direction": "SELL", "ticker": "MSFT", "confidence": 0.7}
        channel.send(signal)
        mock_post.assert_called_once_with(
            "https://example.com/hook", json=signal, timeout=5
        )


def test_dispatcher_filters_low_confidence():
    dispatcher = AlertDispatcher()
    # Replace channels with a mock to track sends
    mock_channel = MagicMock()
    dispatcher.channels = [mock_channel]

    signal = {"direction": "BUY", "ticker": "AAPL", "confidence": 0.3}
    dispatcher.dispatch(signal, min_confidence=0.5)
    mock_channel.send.assert_not_called()


def test_dispatcher_sends_high_confidence():
    dispatcher = AlertDispatcher()
    mock_channel = MagicMock()
    dispatcher.channels = [mock_channel]

    signal = {"direction": "BUY", "ticker": "AAPL", "confidence": 0.8}
    dispatcher.dispatch(signal, min_confidence=0.5)
    mock_channel.send.assert_called_once_with(signal)


def test_dispatcher_handles_channel_error(caplog):
    dispatcher = AlertDispatcher()
    failing_channel = MagicMock()
    failing_channel.send.side_effect = Exception("Network error")
    failing_channel.__class__.__name__ = "FailingChannel"
    dispatcher.channels = [failing_channel]

    signal = {"direction": "BUY", "ticker": "AAPL", "confidence": 0.9}
    import logging
    with caplog.at_level(logging.WARNING, logger="src.alerts.alert_dispatcher"):
        dispatcher.dispatch(signal, min_confidence=0.5)
    assert "failed" in caplog.text


@patch.dict("os.environ", {"ALERT_WEBHOOK_URL": "https://test.com/hook"})
def test_dispatcher_adds_webhook_from_env():
    dispatcher = AlertDispatcher()
    has_webhook = any(isinstance(c, WebhookChannel) for c in dispatcher.channels)
    assert has_webhook


def test_dispatcher_always_has_console():
    dispatcher = AlertDispatcher()
    has_console = any(isinstance(c, ConsoleChannel) for c in dispatcher.channels)
    assert has_console

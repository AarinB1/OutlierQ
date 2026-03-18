"""Pluggable alert dispatch: webhook, email, console."""

import logging
import os
import smtplib
from email.mime.text import MIMEText

import requests

logger = logging.getLogger(__name__)


def get_setting(key: str, default: str = "") -> str:
    return os.getenv(key, default)


class WebhookChannel:
    def __init__(self, url: str) -> None:
        self.url = url

    def send(self, signal: dict) -> None:
        requests.post(self.url, json=signal, timeout=5)


class EmailChannel:
    def __init__(self, to_addr: str) -> None:
        self.to_addr = to_addr

    def send(self, signal: dict) -> None:
        direction = signal.get("direction", "?")
        ticker = signal.get("ticker", "?")
        price = signal.get("current_price", "?")
        conf = signal.get("confidence", 0)

        msg = MIMEText(
            f"New signal: {direction} {ticker} @ ${price} "
            f"(confidence: {conf:.0%})"
        )
        msg["Subject"] = f"OutlierQ Signal: {direction} {ticker}"
        msg["From"] = get_setting("SMTP_FROM", "outlierq@localhost")
        msg["To"] = self.to_addr

        host = get_setting("SMTP_HOST", "localhost")
        port = int(get_setting("SMTP_PORT", "587"))
        user = get_setting("SMTP_USER", "")
        password = get_setting("SMTP_PASS", "")

        with smtplib.SMTP(host, port) as s:
            s.starttls()
            if user and password:
                s.login(user, password)
            s.send_message(msg)


class ConsoleChannel:
    def send(self, signal: dict) -> None:
        logger.info(
            "ALERT: %s %s @ $%s (%.0f%%)",
            signal.get("direction", "?"),
            signal.get("ticker", "?"),
            signal.get("current_price", "?"),
            signal.get("confidence", 0) * 100,
        )


class AlertDispatcher:
    """Routes signal alerts to configured channels."""

    def __init__(self) -> None:
        self.channels: list = []

        webhook_url = get_setting("ALERT_WEBHOOK_URL")
        if webhook_url:
            self.channels.append(WebhookChannel(webhook_url))

        email_to = get_setting("ALERT_EMAIL_TO")
        if email_to:
            self.channels.append(EmailChannel(email_to))

        self.channels.append(ConsoleChannel())  # always on

    def dispatch(self, signal: dict, min_confidence: float = 0.5) -> None:
        """Send alert to all channels if signal meets confidence threshold."""
        if signal.get("confidence", 0) < min_confidence:
            return

        for channel in self.channels:
            try:
                channel.send(signal)
            except Exception as e:
                logger.warning(
                    "Alert channel %s failed: %s",
                    channel.__class__.__name__,
                    e,
                )

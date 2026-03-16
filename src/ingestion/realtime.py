"""Realtime Finnhub ingestion for news and trade events."""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Sequence

import websocket

from config.settings import FINNHUB_API_KEY, LOG_FORMAT
from src.db.database import get_session
from src.db.tables import Event, Signal
from src.detection import AnomalyPipeline
from src.ingestion.market_fetcher import MarketFetcher
from src.ingestion.news_fetcher import NewsFetcher
from src.models.schemas import ArticleCreate
from src.signals.signal_engine import SignalEngine

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

FINNHUB_WS_URL = "wss://ws.finnhub.io"
MAX_WS_BACKOFF_SECONDS = 60
MAX_TRADE_SUBSCRIPTIONS = 25
SUBSCRIPTION_REFRESH_SECONDS = 30
MIN_VOLUME_HISTORY_POINTS = 10
VOLUME_SPIKE_MULTIPLIER = 5.0
TRIGGER_COOLDOWN_SECONDS = 60
PING_INTERVAL_SECONDS = 20
PING_TIMEOUT_SECONDS = 10


@dataclass
class _VolumeState:
    current_minute: int | None = None
    current_volume: float = 0.0
    history: deque[float] = field(default_factory=lambda: deque(maxlen=120))
    last_trigger_ts: float = 0.0


class RealtimeIngestionManager:
    """Runs a Finnhub WebSocket client for realtime news + trades."""

    def __init__(
        self,
        active_ticker_provider: Callable[[], Sequence[str]],
        demo: bool = False,
        use_ml: bool = False,
    ) -> None:
        if not FINNHUB_API_KEY:
            raise ValueError("FINNHUB_API_KEY is required for realtime ingestion")

        self._active_ticker_provider = active_ticker_provider
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._ws: websocket.WebSocketApp | None = None
        self._send_lock = threading.Lock()
        self._state_lock = threading.Lock()

        self.news_fetcher = NewsFetcher(api_key=FINNHUB_API_KEY)
        self.pipeline = AnomalyPipeline(demo=demo, use_ml=use_ml)
        self.signal_engine = SignalEngine(market_fetcher=MarketFetcher(), demo=demo)

        self._subscribed_tickers: set[str] = set()
        self._last_subscription_refresh = 0.0
        self._volume_by_ticker: dict[str, _VolumeState] = {}

    def start(self) -> None:
        """Start realtime ingestion in a background daemon thread."""
        if self._thread and self._thread.is_alive():
            return

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, name="outlierq-realtime", daemon=True)
        self._thread.start()
        logger.info("Realtime ingestion thread started")

    def stop(self, timeout: float = 5.0) -> None:
        """Stop realtime ingestion and close the WebSocket."""
        self._stop_event.set()
        ws = self._ws
        if ws is not None:
            try:
                ws.close()
            except Exception:
                logger.exception("Failed to close realtime websocket cleanly")

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=timeout)
        logger.info("Realtime ingestion thread stopped")

    def _run_loop(self) -> None:
        backoff = 1
        while not self._stop_event.is_set():
            url = f"{FINNHUB_WS_URL}?token={FINNHUB_API_KEY}"
            self._ws = websocket.WebSocketApp(
                url,
                on_open=self._on_open,
                on_message=self._on_message,
                on_error=self._on_error,
                on_close=self._on_close,
            )
            try:
                self._ws.run_forever(
                    ping_interval=PING_INTERVAL_SECONDS,
                    ping_timeout=PING_TIMEOUT_SECONDS,
                )
            except Exception:
                logger.exception("Realtime websocket run_forever failed")

            if self._stop_event.is_set():
                break

            logger.warning("Realtime websocket disconnected; reconnecting in %ss", backoff)
            time.sleep(backoff)
            backoff = min(backoff * 2, MAX_WS_BACKOFF_SECONDS)

    def _on_open(self, ws: websocket.WebSocketApp) -> None:
        logger.info("Realtime websocket connected")
        self._send({"type": "subscribe", "symbol": "news"})
        self._refresh_trade_subscriptions(force=True)

    def _on_message(self, ws: websocket.WebSocketApp, message: str) -> None:
        if self._stop_event.is_set():
            return
        try:
            payload = json.loads(message)
        except json.JSONDecodeError:
            return

        msg_type = payload.get("type")
        if msg_type == "news":
            self._handle_news_payload(payload)
        elif msg_type == "trade":
            self._handle_trade_payload(payload)

        now = time.time()
        if now - self._last_subscription_refresh >= SUBSCRIPTION_REFRESH_SECONDS:
            self._refresh_trade_subscriptions(force=False)

    def _on_error(self, ws: websocket.WebSocketApp, error: Exception) -> None:
        if not self._stop_event.is_set():
            logger.warning("Realtime websocket error: %s", error)

    def _on_close(
        self,
        ws: websocket.WebSocketApp,
        close_status_code: int | None,
        close_msg: str | None,
    ) -> None:
        if not self._stop_event.is_set():
            logger.warning(
                "Realtime websocket closed (code=%s, msg=%s)",
                close_status_code,
                close_msg,
            )

    def _send(self, payload: dict) -> None:
        ws = self._ws
        if ws is None:
            return
        with self._send_lock:
            try:
                ws.send(json.dumps(payload))
            except Exception:
                logger.exception("Realtime websocket send failed: %s", payload)

    def _refresh_trade_subscriptions(self, force: bool) -> None:
        now = time.time()
        if not force and (now - self._last_subscription_refresh) < SUBSCRIPTION_REFRESH_SECONDS:
            return

        desired = self._get_active_tickers()
        to_unsubscribe = sorted(self._subscribed_tickers - desired)
        to_subscribe = sorted(desired - self._subscribed_tickers)

        for ticker in to_unsubscribe:
            self._send({"type": "unsubscribe", "symbol": ticker})
        for ticker in to_subscribe:
            self._send({"type": "subscribe", "symbol": ticker})

        self._subscribed_tickers = desired
        self._last_subscription_refresh = now
        logger.info("Realtime trade subscriptions: %d active", len(self._subscribed_tickers))

    def _get_active_tickers(self) -> set[str]:
        try:
            raw = [str(t).upper() for t in self._active_ticker_provider()]
        except Exception:
            logger.exception("Failed to fetch active tickers for realtime subscriptions")
            return set()
        deduped = [t for t in dict.fromkeys(raw) if t]
        return set(deduped[:MAX_TRADE_SUBSCRIPTIONS])

    def _handle_news_payload(self, payload: dict) -> None:
        for item in payload.get("data") or []:
            self._process_news_item(item)

    def _process_news_item(self, item: dict) -> None:
        tickers = self._extract_tickers(item)
        if not tickers:
            return

        started = time.perf_counter()
        published_at = self._to_datetime(item.get("datetime"))
        raw_url = str(item.get("url") or "")
        if not raw_url:
            raw_url = f"finnhub://news/{item.get('id', int(time.time() * 1000))}"

        articles = [
            ArticleCreate(
                ticker=ticker,
                headline=str(item.get("headline") or ""),
                summary=item.get("summary"),
                source=str(item.get("source") or "finnhub"),
                url=f"{raw_url}#ticker={ticker}",
                published_at=published_at,
                raw_json=item,
            )
            for ticker in tickers
        ]
        self.news_fetcher.store_articles(articles)

        for ticker in tickers:
            generated = self._trigger_pipeline_for_ticker(ticker, source="news")
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            logger.info(
                "REALTIME: News for %s — pipeline triggered in %dms (%d signals)",
                ticker,
                elapsed_ms,
                generated,
            )

    def _extract_tickers(self, item: dict) -> list[str]:
        related = str(item.get("related") or "")
        headline = str(item.get("headline") or "")

        tickers: set[str] = set()
        if related:
            for tok in related.replace(";", ",").split(","):
                clean = tok.strip().upper()
                if re.fullmatch(r"[A-Z]{1,5}", clean):
                    tickers.add(clean)

        for tok in re.findall(r"\b[A-Z]{1,5}\b", headline):
            if tok.isalpha():
                tickers.add(tok)

        return sorted(tickers)[:5]

    def _handle_trade_payload(self, payload: dict) -> None:
        grouped_volume: dict[str, float] = defaultdict(float)
        latest_ts_ms: dict[str, int] = {}

        for trade in payload.get("data") or []:
            ticker = str(trade.get("s") or "").upper()
            if not ticker:
                continue
            volume = float(trade.get("v") or 0.0)
            if volume <= 0:
                continue
            grouped_volume[ticker] += volume
            latest_ts_ms[ticker] = int(trade.get("t") or int(time.time() * 1000))

        for ticker, volume in grouped_volume.items():
            self._update_volume_state(ticker=ticker, volume=volume, ts_ms=latest_ts_ms[ticker])

    def _update_volume_state(self, ticker: str, volume: float, ts_ms: int) -> None:
        minute_bucket = ts_ms // 60000
        now_ts = time.time()

        with self._state_lock:
            state = self._volume_by_ticker.setdefault(ticker, _VolumeState())
            if state.current_minute is None:
                state.current_minute = minute_bucket

            if minute_bucket != state.current_minute:
                state.history.append(state.current_volume)
                state.current_minute = minute_bucket
                state.current_volume = 0.0

            state.current_volume += volume

            if len(state.history) < MIN_VOLUME_HISTORY_POINTS:
                return
            avg_minute_volume = sum(state.history) / max(1, len(state.history))
            if avg_minute_volume <= 0:
                return

            spike_threshold = avg_minute_volume * VOLUME_SPIKE_MULTIPLIER
            if (
                state.current_volume >= spike_threshold
                and (now_ts - state.last_trigger_ts) >= TRIGGER_COOLDOWN_SECONDS
            ):
                state.last_trigger_ts = now_ts
            else:
                return

        logger.info(
            "REALTIME: Volume spike for %s — %.0f vs %.0f baseline",
            ticker,
            state.current_volume,
            avg_minute_volume,
        )
        self._trigger_pipeline_for_ticker(
            ticker,
            source="trade",
            reason=f"1m volume {state.current_volume:.0f} >= 5x avg {avg_minute_volume:.0f}",
        )

    def _trigger_pipeline_for_ticker(
        self,
        ticker: str,
        source: str,
        reason: str | None = None,
    ) -> int:
        started = time.perf_counter()
        generated_count = 0

        try:
            events = self.pipeline.scan_and_store([ticker])
            for event in events:
                event_dict = {
                    "ticker": event.ticker,
                    "event_type": event.event_type,
                    "event_id": event.id,
                    "direction": event.direction,
                    "confidence": event.confidence,
                    "id": event.id,
                    "metadata": event.metadata_json or {},
                }
                signal_dict = self.signal_engine.generate_signal(event_dict)
                if signal_dict is not None and self._store_signal_dict(signal_dict):
                    generated_count += 1
        except Exception:
            logger.exception("Realtime pipeline trigger failed for %s (%s)", ticker, source)
            return 0

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        if reason:
            logger.info(
                "REALTIME: %s for %s — %s; pipeline in %dms (%d signals)",
                source,
                ticker,
                reason,
                elapsed_ms,
                generated_count,
            )
        return generated_count

    @staticmethod
    def _store_signal_dict(signal_dict: dict) -> bool:
        event_id = signal_dict.get("event_id")
        if not event_id:
            return False

        with get_session() as session:
            record = Signal(
                ticker=signal_dict["ticker"],
                event_id=event_id,
                direction=signal_dict["direction"],
                suggested_strike=signal_dict.get("suggested_strike"),
                suggested_expiry=signal_dict.get("suggested_expiry"),
                confidence=signal_dict["confidence"],
                exploratory=signal_dict.get("exploratory", False),
                discovery_source=signal_dict.get("discovery_source"),
            )
            session.add(record)

            technical_context = signal_dict.get("technical_context")
            if technical_context:
                event = session.query(Event).filter(Event.id == event_id).first()
                if event is not None:
                    metadata = dict(event.metadata_json or {})
                    metadata["technical_context"] = technical_context
                    notes = signal_dict.get("technical_notes")
                    if notes:
                        metadata["technical_notes"] = notes
                    event.metadata_json = metadata
                    session.add(event)
            session.flush()
        return True

    @staticmethod
    def _to_datetime(timestamp_value: int | float | str | None) -> datetime:
        if timestamp_value is None:
            return datetime.now(timezone.utc)
        try:
            ts = float(timestamp_value)
        except (TypeError, ValueError):
            return datetime.now(timezone.utc)
        if ts > 1_000_000_000_000:
            ts = ts / 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc)

"""Tests for the MiroFish simulation enrichment layer.

All HTTP calls are mocked — MiroFish does not need to be running.
"""

import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.database import Base
from src.db.tables import Article, Event, SimulationResult
from src.simulation.mirofish_client import MirofishClient
from src.simulation.seed_builder import build_seed
from src.simulation.runner import _parse_answers, _run_simulation, _REPORT_QUESTIONS


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_event(ticker="AAPL", confidence=0.85) -> Event:
    return Event(
        id=str(uuid.uuid4()),
        ticker=ticker,
        event_type="earnings_beat",
        direction="bullish",
        confidence=confidence,
        detected_at=datetime.now(timezone.utc),
        article_ids=[str(uuid.uuid4())],
        metadata_json={
            "z_score": 4.2,
            "mean_sentiment": 0.72,
            "extreme_ratio": 0.65,
            "distinct_sources": 3,
            "sources": ["Reuters", "Bloomberg", "CNBC"],
            "common_themes": ["earnings", "revenue growth"],
            "options_flow": {
                "direction": "bullish",
                "unusual_contract_count": 5,
                "max_conviction": 0.88,
                "dominant_strike": 190,
                "dominant_expiry": "2026-04-17",
            },
            "edgar_data": {
                "has_significant_filing": True,
                "summary": "8-K filed: record quarterly revenue",
                "has_unusual_insider_activity": False,
            },
        },
    )


def _make_articles(n=3) -> list[Article]:
    now = datetime.now(timezone.utc)
    articles = []
    for i in range(n):
        articles.append(
            Article(
                id=str(uuid.uuid4()),
                ticker="AAPL",
                headline=f"Apple posts record Q1 earnings — headline {i+1}",
                summary=f"Revenue beat expectations by a wide margin, driven by strong iPhone demand.",
                source=["Reuters", "Bloomberg", "CNBC"][i % 3],
                url=f"https://example.com/{uuid.uuid4()}",
                published_at=now,
                ingested_at=now,
                sentiment_score=0.8,
                sentiment_magnitude=0.9,
            )
        )
    return articles


# ---------------------------------------------------------------------------
# MirofishClient tests
# ---------------------------------------------------------------------------

class TestMirofishClient:
    def test_is_available_true(self):
        client = MirofishClient(base_url="http://localhost:5001")
        with patch("src.simulation.mirofish_client.requests.get") as mock_get:
            mock_get.return_value = MagicMock(status_code=200)
            assert client.is_available() is True

    def test_is_available_false_on_error(self):
        import requests as req_lib
        client = MirofishClient(base_url="http://localhost:5001")
        with patch("src.simulation.mirofish_client.requests.get") as mock_get:
            mock_get.side_effect = req_lib.ConnectionError("refused")
            assert client.is_available() is False

    def test_is_available_false_on_500(self):
        client = MirofishClient(base_url="http://localhost:5001")
        with patch("src.simulation.mirofish_client.requests.get") as mock_get:
            mock_get.return_value = MagicMock(status_code=500)
            assert client.is_available() is False

    def test_build_graph(self):
        client = MirofishClient(base_url="http://localhost:5001")
        with patch("src.simulation.mirofish_client.requests.request") as mock_req:
            mock_req.return_value = MagicMock(
                status_code=200,
                json=lambda: {"project_id": "proj-123"},
            )
            mock_req.return_value.raise_for_status = MagicMock()
            result = client.build_graph("some seed text")
            assert result == "proj-123"
            mock_req.assert_called_once()

    def test_start_simulation(self):
        client = MirofishClient(base_url="http://localhost:5001")
        with patch("src.simulation.mirofish_client.requests.request") as mock_req:
            mock_req.return_value = MagicMock(
                status_code=200,
                json=lambda: {"simulation_id": "sim-456"},
            )
            mock_req.return_value.raise_for_status = MagicMock()
            result = client.start_simulation("proj-123", num_rounds=15)
            assert result == "sim-456"

    def test_poll_status(self):
        client = MirofishClient(base_url="http://localhost:5001")
        with patch("src.simulation.mirofish_client.requests.request") as mock_req:
            mock_req.return_value = MagicMock(
                status_code=200,
                json=lambda: {"status": "completed", "progress": 100},
            )
            mock_req.return_value.raise_for_status = MagicMock()
            result = client.poll_status("sim-456")
            assert result["status"] == "completed"

    def test_chat_report(self):
        client = MirofishClient(base_url="http://localhost:5001")
        with patch("src.simulation.mirofish_client.requests.request") as mock_req:
            mock_req.return_value = MagicMock(
                status_code=200,
                json=lambda: {"answer": "The consensus is bullish."},
            )
            mock_req.return_value.raise_for_status = MagicMock()
            result = client.chat_report("proj-123", "What is the consensus?")
            assert "bullish" in result

    def test_retry_on_failure(self):
        client = MirofishClient(base_url="http://localhost:5001", timeout=1)
        import requests as req_lib

        with patch("src.simulation.mirofish_client.requests.request") as mock_req, \
             patch("src.simulation.mirofish_client.time.sleep"):
            mock_req.side_effect = req_lib.ConnectionError("refused")
            with pytest.raises(ConnectionError, match="failed after 3 attempts"):
                client.build_graph("test")
            assert mock_req.call_count == 3


# ---------------------------------------------------------------------------
# SeedBuilder tests
# ---------------------------------------------------------------------------

class TestSeedBuilder:
    def test_build_seed_basic(self):
        event = _make_event()
        articles = _make_articles()
        seed = build_seed(event, articles)

        assert "FINANCIAL EVENT BRIEFING" in seed
        assert "AAPL" in seed
        assert "earnings_beat" in seed
        assert "Bullish" in seed
        assert "Reuters" in seed
        assert "z-score" in seed.lower() or "z_score" in seed.lower()

    def test_build_seed_includes_options_flow(self):
        event = _make_event()
        articles = _make_articles()
        seed = build_seed(event, articles)

        assert "options activity" in seed.lower()
        assert "bullish" in seed.lower()

    def test_build_seed_includes_edgar(self):
        event = _make_event()
        articles = _make_articles()
        seed = build_seed(event, articles)

        assert "SEC" in seed or "filing" in seed.lower()

    def test_build_seed_with_price(self):
        event = _make_event()
        articles = _make_articles()
        seed = build_seed(event, articles, metadata={"current_price": 185.50})

        assert "$185.50" in seed

    def test_build_seed_minimal(self):
        """Seed should still work with minimal metadata."""
        event = Event(
            id=str(uuid.uuid4()),
            ticker="TSLA",
            event_type="scandal",
            direction="bearish",
            confidence=0.6,
            article_ids=[],
            metadata_json={},
        )
        seed = build_seed(event, [])
        assert "TSLA" in seed
        assert "scandal" in seed

    def test_seed_is_not_json(self):
        """Output should read like prose, not raw JSON."""
        event = _make_event()
        articles = _make_articles()
        seed = build_seed(event, articles)

        assert seed.count("{") < 3  # minimal braces — not JSON
        assert "FINANCIAL EVENT BRIEFING" in seed


# ---------------------------------------------------------------------------
# Runner / parser tests
# ---------------------------------------------------------------------------

class TestRunner:
    def test_parse_answers_bullish(self):
        answers = {
            _REPORT_QUESTIONS[0]: "The consensus sentiment direction is bullish, driven by strong earnings.",
            _REPORT_QUESTIONS[1]: "Approximately 25% of agents expressed bearish sentiment.",
            _REPORT_QUESTIONS[2]: "Sentiment shifted quickly within the first 5 rounds.",
        }
        result = _parse_answers(answers)

        assert result["direction"] == "bullish"
        assert result["bearish_pct"] == 25.0
        assert result["bullish_pct"] == 75.0
        assert result["consensus_strength"] == 0.75
        assert len(result["narrative_summary"]) > 0

    def test_parse_answers_bearish(self):
        answers = {
            _REPORT_QUESTIONS[0]: "Overall the agents lean bearish on this event.",
            _REPORT_QUESTIONS[1]: "About 70% of agents expressed bearish sentiment.",
            _REPORT_QUESTIONS[2]: "The shift was gradual over many rounds.",
        }
        result = _parse_answers(answers)

        assert result["direction"] == "bearish"
        assert result["bearish_pct"] == 70.0
        assert result["bullish_pct"] == 30.0
        assert result["consensus_strength"] == 0.70

    def test_parse_answers_neutral(self):
        answers = {
            _REPORT_QUESTIONS[0]: "There is no clear consensus among the agents.",
            _REPORT_QUESTIONS[1]: "No specific percentage can be determined.",
            _REPORT_QUESTIONS[2]: "Sentiment remained stable.",
        }
        result = _parse_answers(answers)

        assert result["direction"] == "neutral"
        assert result["bearish_pct"] is None

    @patch("src.simulation.runner.get_session")
    @patch("src.simulation.runner.MirofishClient")
    def test_run_simulation_end_to_end(self, MockClient, mock_get_session):
        """Full lifecycle with mocked client and DB."""
        event = _make_event()
        articles = _make_articles()

        client = MagicMock()
        client.build_graph.return_value = "proj-001"
        client.prepare_simulation.return_value = {}
        client.start_simulation.return_value = "sim-001"
        client.poll_status.return_value = {"status": "completed"}
        client.generate_report.return_value = {
            "report": "Full simulation report text...",
            "agent_count": 40,
        }
        client.chat_report.side_effect = [
            "The consensus is bullish.",
            "30% of agents expressed bearish sentiment.",
            "Sentiment shifted rapidly in early rounds.",
        ]

        mock_session = MagicMock()
        mock_ctx = MagicMock()
        mock_ctx.__enter__ = MagicMock(return_value=mock_session)
        mock_ctx.__exit__ = MagicMock(return_value=False)
        mock_get_session.return_value = mock_ctx

        _run_simulation(event.id, event, articles, client=client)

        client.build_graph.assert_called_once()
        client.prepare_simulation.assert_called_once_with("proj-001")
        client.start_simulation.assert_called_once()
        client.generate_report.assert_called_once_with("proj-001")
        assert client.chat_report.call_count == 3
        mock_session.add.assert_called_once()

        sim_result = mock_session.add.call_args[0][0]
        assert isinstance(sim_result, SimulationResult)
        assert sim_result.event_id == event.id
        assert sim_result.direction == "bullish"
        assert sim_result.bearish_pct == 30.0
        assert sim_result.agent_count == 40


# ---------------------------------------------------------------------------
# SimulationResult model test
# ---------------------------------------------------------------------------

class TestSimulationResultModel:
    def test_create_and_query(self, db_session):
        event = Event(
            id=str(uuid.uuid4()),
            ticker="NVDA",
            event_type="breakthrough",
            direction="bullish",
            confidence=0.9,
            article_ids=[],
        )
        db_session.add(event)
        db_session.flush()

        sim = SimulationResult(
            event_id=event.id,
            direction="bullish",
            bearish_pct=20.0,
            bullish_pct=80.0,
            consensus_strength=0.80,
            narrative_summary="Strong bullish consensus among simulated agents.",
            raw_report="Full report text...",
            simulation_rounds=20,
            agent_count=40,
        )
        db_session.add(sim)
        db_session.flush()

        fetched = db_session.query(SimulationResult).filter_by(event_id=event.id).first()
        assert fetched is not None
        assert fetched.direction == "bullish"
        assert fetched.bearish_pct == 20.0
        assert fetched.agent_count == 40

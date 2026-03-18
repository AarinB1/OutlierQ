"""Async orchestrator for MiroFish simulations.

Runs simulations in a background ThreadPoolExecutor so the main APScheduler
pipeline cycle is never blocked.
"""

from __future__ import annotations

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from config.settings import MIROFISH_MAX_ROUNDS
from src.db.database import get_session
from src.db.tables import SimulationResult
from src.simulation.mirofish_client import MirofishClient
from src.simulation.seed_builder import build_seed

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from src.db.tables import Article, Event

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="mirofish")

# Questions asked to the ReportAgent after simulation finishes
_REPORT_QUESTIONS = [
    "What is the consensus sentiment direction — bullish, bearish, or neutral?",
    "What percentage of agents expressed bearish sentiment?",
    "How quickly did sentiment shift?",
]

_POLL_INTERVAL = 5  # seconds between status polls
_MAX_POLL_ATTEMPTS = 120  # ~10 minutes max wait


def submit_simulation(
    event: Event,
    articles: list[Article],
    session: Session | None = None,
    client: MirofishClient | None = None,
) -> None:
    """Submit a simulation to the background thread pool (non-blocking)."""
    _executor.submit(_run_simulation, event.id, event, articles, client)
    logger.info("Simulation submitted for event %s (%s)", event.id, event.ticker)


def _run_simulation(
    event_id: str,
    event: Event,
    articles: list[Article],
    client: MirofishClient | None = None,
) -> None:
    """Execute the full MiroFish simulation lifecycle (runs in a worker thread)."""
    client = client or MirofishClient()

    try:
        # 1. Build seed text
        seed_text = build_seed(event, articles)

        # 2. Upload seed → build knowledge graph
        project_id = client.build_graph(seed_text)
        logger.info("MiroFish graph built for %s: project_id=%s", event.ticker, project_id)

        # 3. Prepare agents
        client.prepare_simulation(project_id)

        # 4. Start simulation
        num_rounds = min(MIROFISH_MAX_ROUNDS, 20)
        sim_id = client.start_simulation(project_id, num_rounds=num_rounds)

        # 5. Poll until complete
        for _ in range(_MAX_POLL_ATTEMPTS):
            status = client.poll_status(sim_id)
            if status.get("status") in ("completed", "done", "finished"):
                break
            if status.get("status") in ("failed", "error"):
                logger.error("Simulation %s failed: %s", sim_id, status)
                return
            time.sleep(_POLL_INTERVAL)
        else:
            logger.error("Simulation %s timed out after polling", sim_id)
            return

        # 6. Generate report
        report_data = client.generate_report(project_id)
        raw_report = report_data.get("report", "")

        # 7. Query report with targeted questions
        answers: dict[str, str] = {}
        for question in _REPORT_QUESTIONS:
            answers[question] = client.chat_report(project_id, question)

        # 8. Parse into structured result
        result = _parse_answers(answers)
        result["raw_report"] = raw_report
        result["simulation_rounds"] = num_rounds
        result["agent_count"] = report_data.get("agent_count")

        # 9. Store in DB
        _store_result(event_id, result)
        logger.info(
            "Simulation complete for %s: direction=%s, consensus=%.2f",
            event.ticker, result["direction"], result.get("consensus_strength", 0),
        )

    except Exception:
        logger.exception("Simulation failed for event %s", event_id)


def _parse_answers(answers: dict[str, str]) -> dict:
    """Extract structured fields from ReportAgent chat answers."""
    result: dict = {
        "direction": "neutral",
        "bearish_pct": None,
        "bullish_pct": None,
        "consensus_strength": 0.5,
        "narrative_summary": "",
    }

    # Parse direction from first answer
    direction_answer = answers.get(_REPORT_QUESTIONS[0], "").lower()
    if "bullish" in direction_answer:
        result["direction"] = "bullish"
    elif "bearish" in direction_answer:
        result["direction"] = "bearish"

    # Parse bearish percentage from second answer
    bearish_answer = answers.get(_REPORT_QUESTIONS[1], "")
    pct_match = re.search(r"(\d+(?:\.\d+)?)\s*%", bearish_answer)
    if pct_match:
        result["bearish_pct"] = float(pct_match.group(1))
        result["bullish_pct"] = 100.0 - result["bearish_pct"]

    # Derive consensus strength from how lopsided the split is
    if result["bearish_pct"] is not None:
        majority = max(result["bearish_pct"], result["bullish_pct"]) / 100.0
        result["consensus_strength"] = majority

    # Build narrative summary from all answers
    parts = [a for a in answers.values() if a]
    result["narrative_summary"] = " ".join(parts)[:2000]

    return result


def _store_result(event_id: str, result: dict) -> None:
    """Persist a SimulationResult row."""
    with get_session() as session:
        sim = SimulationResult(
            event_id=event_id,
            direction=result.get("direction"),
            bearish_pct=result.get("bearish_pct"),
            bullish_pct=result.get("bullish_pct"),
            consensus_strength=result.get("consensus_strength"),
            narrative_summary=result.get("narrative_summary"),
            raw_report=result.get("raw_report"),
            simulation_rounds=result.get("simulation_rounds"),
            agent_count=result.get("agent_count"),
            completed_at=datetime.now(timezone.utc),
        )
        session.add(sim)

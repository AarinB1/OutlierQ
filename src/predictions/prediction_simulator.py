"""Run MiroFish simulations for prediction market probability estimation.

Reuses MirofishClient for HTTP calls but asks prediction-market-specific
questions and parses responses into calibrated probability estimates.
"""

from __future__ import annotations

import logging
import re
import time
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from config.settings import MIROFISH_MAX_ROUNDS, MIROFISH_WAIT_TIMEOUT
from src.simulation.mirofish_client import MirofishClient
from src.predictions.prediction_seed_builder import build_prediction_seed

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="mirofish_pred")
_MAX_QUEUED = 30
_POLL_INTERVAL = 5
_MAX_POLL_ATTEMPTS = 120

# Questions tailored for prediction market probability estimation
_PREDICTION_REPORT_QUESTIONS = [
    "What is the estimated probability that the answer to the question is YES? Give a specific percentage.",
    "What percentage of agents believe the outcome will be YES versus NO?",
    "How confident is the group in their assessment — high, moderate, or low consensus?",
    "What are the key factors that could cause the actual probability to differ from the current market price?",
]


@dataclass
class PredictionSimResult:
    """Structured result from a prediction market MiroFish simulation."""
    estimated_probability: float  # 0.0–1.0, the simulation's estimate of YES probability
    yes_pct: float | None        # % of agents saying YES
    no_pct: float | None         # % of agents saying NO
    consensus_strength: float    # 0.0–1.0
    key_factors: str             # narrative about risk factors
    narrative_summary: str       # combined narrative
    raw_report: str
    simulation_rounds: int
    agent_count: int | None


def run_prediction_simulation(
    market_question: str,
    platform: str,
    market_yes_price: float,
    event: dict | None = None,
    articles: list[dict] | None = None,
    metadata: dict | None = None,
    client: MirofishClient | None = None,
) -> PredictionSimResult | None:
    """Run a full MiroFish simulation for a prediction market question.

    This is a synchronous call — it blocks until the simulation completes
    or times out. Call from a thread pool for non-blocking usage.

    Returns None on failure.
    """
    client = client or MirofishClient()
    if not client.is_available():
        logger.debug("MiroFish not available — skipping prediction simulation")
        return None

    try:
        # 1. Build seed
        seed_text = build_prediction_seed(
            market_question=market_question,
            platform=platform,
            market_yes_price=market_yes_price,
            event=event,
            articles=articles,
            metadata=metadata,
        )

        # 2. Upload seed → build knowledge graph
        project_id = client.build_graph(seed_text)
        logger.info("MiroFish prediction graph built: project_id=%s", project_id)

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
                logger.error("Prediction simulation %s failed: %s", sim_id, status)
                return None
            time.sleep(_POLL_INTERVAL)
        else:
            logger.error("Prediction simulation %s timed out", sim_id)
            return None

        # 6. Generate report
        report_data = client.generate_report(project_id)
        raw_report = report_data.get("report", "")

        # 7. Query with prediction-specific questions
        answers: dict[str, str] = {}
        for question in _PREDICTION_REPORT_QUESTIONS:
            try:
                answers[question] = client.chat_report(project_id, question)
            except Exception as exc:
                logger.warning("Failed to get answer for question: %s — %s", question[:50], exc)
                answers[question] = ""

        # 8. Parse into structured result
        result = _parse_prediction_answers(answers)
        result.raw_report = raw_report
        result.simulation_rounds = num_rounds
        result.agent_count = report_data.get("agent_count")

        logger.info(
            "Prediction simulation complete: estimated_prob=%.2f, consensus=%.2f",
            result.estimated_probability, result.consensus_strength,
        )
        return result

    except Exception:
        logger.exception("Prediction simulation failed for: %s", market_question[:60])
        return None


def submit_prediction_simulations(
    predictions: list[dict],
    events_by_match: dict[str, dict] | None = None,
    articles_by_ticker: dict[str, list[dict]] | None = None,
    client: MirofishClient | None = None,
    timeout: float | None = None,
) -> dict[str, PredictionSimResult]:
    """Submit multiple prediction simulations and wait for results.

    Args:
        predictions: List of prediction dicts from PredictionEngine.generate_predictions().
        events_by_match: Optional mapping of market_id -> event dict for seeding.
        articles_by_ticker: Optional mapping of ticker -> article list for seeding.
        client: MirofishClient instance.
        timeout: Max seconds to wait for all simulations.

    Returns:
        Mapping of market_id -> PredictionSimResult for completed simulations.
    """
    client = client or MirofishClient()
    if not client.is_available():
        logger.debug("MiroFish not available — skipping prediction simulations")
        return {}

    events_map = events_by_match or {}
    articles_map = articles_by_ticker or {}
    wait_timeout = timeout or MIROFISH_WAIT_TIMEOUT

    futures: dict[Future, str] = {}  # future -> market_id

    for pred in predictions:
        market_id = pred["market_id"]
        ticker = pred.get("matched_tickers", "")
        event = events_map.get(market_id)
        articles = articles_map.get(ticker, [])

        # Guard queue size
        pending = _executor._work_queue.qsize()
        if pending >= _MAX_QUEUED:
            logger.warning("Prediction simulation queue full (%d) — skipping %s", pending, market_id)
            continue

        future = _executor.submit(
            run_prediction_simulation,
            market_question=pred["question"],
            platform=pred["platform"],
            market_yes_price=pred["market_probability"],
            event=event,
            articles=articles,
            metadata={"match_method": pred.get("match_method"), "match_score": pred.get("confidence")},
            client=client,
        )
        futures[future] = market_id

    if not futures:
        return {}

    # Wait for all futures
    results: dict[str, PredictionSimResult] = {}
    for future in as_completed(futures, timeout=wait_timeout):
        market_id = futures[future]
        try:
            result = future.result()
            if result is not None:
                results[market_id] = result
        except Exception as exc:
            logger.warning("Prediction simulation for %s failed: %s", market_id, exc)

    logger.info("Prediction simulations: %d/%d completed", len(results), len(futures))
    return results


def _parse_prediction_answers(answers: dict[str, str]) -> PredictionSimResult:
    """Parse MiroFish report answers into a PredictionSimResult.

    Extracts probability estimates, agent consensus percentages,
    and consensus strength from natural language answers.
    """
    q_prob = _PREDICTION_REPORT_QUESTIONS[0]
    q_split = _PREDICTION_REPORT_QUESTIONS[1]
    q_consensus = _PREDICTION_REPORT_QUESTIONS[2]
    q_factors = _PREDICTION_REPORT_QUESTIONS[3]

    # Extract probability from first answer
    estimated_probability = _extract_probability(answers.get(q_prob, ""))

    # Extract YES/NO split from second answer
    yes_pct, no_pct = _extract_yes_no_split(answers.get(q_split, ""))

    # If we got a split but not a probability, derive from split
    if estimated_probability is None and yes_pct is not None:
        estimated_probability = yes_pct / 100.0

    # If we still don't have a probability, default to 0.5 (no information)
    if estimated_probability is None:
        estimated_probability = 0.5

    # Extract consensus strength
    consensus_strength = _extract_consensus_strength(answers.get(q_consensus, ""))

    # Key factors is the raw narrative
    key_factors = answers.get(q_factors, "")

    # Build narrative summary from all answers
    narrative_parts = [v for v in answers.values() if v.strip()]
    narrative_summary = " | ".join(narrative_parts[:3])

    return PredictionSimResult(
        estimated_probability=estimated_probability,
        yes_pct=yes_pct,
        no_pct=no_pct,
        consensus_strength=consensus_strength,
        key_factors=key_factors,
        narrative_summary=narrative_summary,
        raw_report="",
        simulation_rounds=0,
        agent_count=None,
    )


def _extract_probability(text: str) -> float | None:
    """Extract a probability value from natural language.

    Looks for patterns like "65%", "0.65", "sixty-five percent", etc.
    Returns float 0.0–1.0 or None if not found.
    """
    if not text:
        return None

    # Try percentage patterns first: "65%", "65 percent", "65.5%"
    pct_match = re.search(r'(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)', text, re.IGNORECASE)
    if pct_match:
        value = float(pct_match.group(1))
        if 0 <= value <= 100:
            return value / 100.0

    # Try decimal patterns: "0.65", "probability of 0.7"
    dec_match = re.search(r'(?:probability|estimate|chance|likelihood)\s+(?:of\s+|is\s+)?(\d*\.\d+)', text, re.IGNORECASE)
    if dec_match:
        value = float(dec_match.group(1))
        if 0 <= value <= 1:
            return value

    # Try plain decimal at start or after "is"
    plain_match = re.search(r'(?:^|is\s+)(\d*\.\d+)', text)
    if plain_match:
        value = float(plain_match.group(1))
        if 0 <= value <= 1:
            return value

    return None


def _extract_yes_no_split(text: str) -> tuple[float | None, float | None]:
    """Extract YES/NO percentage split from text.

    Returns (yes_pct, no_pct) as floats 0-100, or (None, None) if not found.
    """
    if not text:
        return None, None

    # Pattern: "X% ... YES ... Y% ... NO" or "X% yes and Y% no"
    yes_match = re.search(r'(\d{1,3}(?:\.\d+)?)\s*%?\s*(?:of\s+)?(?:agents?\s+)?(?:say|believe|voted?|for)\s+yes\b', text, re.IGNORECASE)
    no_match = re.search(r'(\d{1,3}(?:\.\d+)?)\s*%?\s*(?:of\s+)?(?:agents?\s+)?(?:say|believe|voted?|for)\s+no\b', text, re.IGNORECASE)

    if yes_match and no_match:
        return float(yes_match.group(1)), float(no_match.group(1))

    # Try: "X% YES" standalone
    yes_only = re.search(r'(\d{1,3}(?:\.\d+)?)\s*%\s*(?:yes|affirm|in favor)', text, re.IGNORECASE)
    if yes_only:
        yes = float(yes_only.group(1))
        return yes, 100.0 - yes

    # Try percentage followed by direction keyword
    pct_match = re.search(r'(\d{1,3}(?:\.\d+)?)\s*%', text)
    if pct_match:
        value = float(pct_match.group(1))
        text_lower = text.lower()
        if 'yes' in text_lower or 'affirm' in text_lower or 'favor' in text_lower:
            return value, 100.0 - value
        elif 'no' in text_lower or 'against' in text_lower or 'negative' in text_lower:
            return 100.0 - value, value

    return None, None


def _extract_consensus_strength(text: str) -> float:
    """Extract consensus strength from text. Returns 0.0–1.0."""
    if not text:
        return 0.5

    text_lower = text.lower()
    if any(w in text_lower for w in ["high consensus", "strong consensus", "very confident", "overwhelming"]):
        return 0.85
    elif any(w in text_lower for w in ["moderate consensus", "moderate confidence", "reasonably confident"]):
        return 0.6
    elif any(w in text_lower for w in ["low consensus", "divided", "split", "uncertain", "no clear"]):
        return 0.35
    elif any(w in text_lower for w in ["mixed", "some disagreement"]):
        return 0.45

    return 0.5  # default

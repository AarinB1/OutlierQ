"""Rule-based event type classification with weighted keyword scoring.

Classifies detected outlier events into categories (scandal, FDA approval,
lawsuit, etc.) and assigns a confident bullish/bearish direction. Uses
interpretable keyword dictionaries that are easy to tune and extend.
"""

import logging
from collections import Counter

from sqlalchemy.orm import Session

from config.settings import LOG_FORMAT
from src.db.database import get_session
from src.db.tables import Article, Event

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Minimum score for a classification to be accepted (below this → "other")
_MIN_SCORE_THRESHOLD = 2

# Direction mapping — hardcoded per event type
_DIRECTION_MAP: dict[str, str] = {
    "scandal": "bearish",
    "legal": "bearish",
    "earnings_miss": "bearish",
    "recall": "bearish",
    "fda_approval": "bullish",
    "breakthrough": "bullish",
    "major_contract": "bullish",
    "earnings_beat": "bullish",
    "options_flow": "neutral",
    "other": "neutral",
}

# ── Keyword dictionaries ─────────────────────────────────────────────
# Structure: list[tuple[keyword, weight]]
# Weights: 3 = strong indicator, 2 = moderate, 1 = weak

_KEYWORD_DICTS: dict[str, list[tuple[str, int]]] = {
    "scandal": [
        # High weight (3)
        ("fraud", 3), ("indicted", 3), ("arrested", 3), ("embezzlement", 3),
        ("corruption", 3), ("ponzi", 3), ("money laundering", 3), ("bribery", 3),
        ("insider trading", 3),
        # Medium weight (2)
        ("scandal", 2), ("misconduct", 2), ("investigation", 2), ("whistleblower", 2),
        ("cover-up", 2), ("falsified", 2), ("misleading", 2), ("manipulated", 2),
        # Low weight (1)
        ("resigned", 1), ("fired", 1), ("controversy", 1), ("allegations", 1),
        ("accused", 1), ("probe", 1), ("ethics", 1),
        ("toxic culture", 1), ("harassment", 1), ("data breach", 1),
        ("privacy violation", 1), ("executive departure", 1),
    ],
    "legal": [
        # High weight (3)
        ("sued", 3), ("lawsuit", 3), ("sec charges", 3), ("class action", 3),
        ("antitrust", 3), ("injunction", 3), ("indictment", 3),
        # Medium weight (2)
        ("regulatory", 2), ("fine", 2), ("penalty", 2), ("compliance", 2),
        ("subpoena", 2), ("settlement", 2), ("litigation", 2),
        # Low weight (1)
        ("legal", 1), ("court", 1), ("dispute", 1), ("ruling", 1),
        ("patent", 1), ("violation", 1), ("investigation", 1), ("probe", 1),
        ("scrutiny", 1), ("congressional hearing", 1), ("ftc", 1), ("doj", 1),
    ],
    "earnings_miss": [
        # High weight (3)
        ("earnings miss", 3), ("revenue miss", 3), ("profit warning", 3),
        ("guidance cut", 3), ("lowered outlook", 3),
        # Medium weight (2)
        ("below expectations", 2), ("disappointing results", 2), ("weak earnings", 2),
        ("revenue decline", 2), ("loss widens", 2), ("downgrade", 2), ("sell rating", 2),
        ("price target cut", 2), ("margin pressure", 2), ("demand weakness", 2),
        ("inventory buildup", 2),
        # Low weight (1)
        ("missed estimates", 1), ("underperformed", 1), ("quarterly loss", 1),
        ("slowdown", 1), ("downturn", 1), ("headwinds", 1), ("challenging environment", 1),
        ("soft demand", 1), ("cautious outlook", 1), ("negative revision", 1), ("warns", 1),
        ("concern", 1), ("risk", 1), ("decline", 1), ("drops", 1), ("falls", 1),
        ("slump", 1), ("tumbles", 1), ("plunges", 1), ("selloff", 1),
    ],
    "recall": [
        # High weight (3)
        ("recall", 3), ("safety defect", 3), ("product recall", 3),
        ("hazard", 3), ("fatality", 3),
        # Medium weight (2)
        ("safety issue", 2), ("defective", 2), ("malfunction", 2),
        ("warning issued", 2), ("consumer alert", 2),
        # Low weight (1)
        ("pulled from shelves", 1), ("safety concern", 1), ("quality issue", 1),
        ("investigation into", 1),
    ],
    "fda_approval": [
        # High weight (3)
        ("fda approved", 3), ("fda approval", 3), ("fda approves", 3),
        ("breakthrough therapy", 3), ("fast track", 3), ("priority review", 3),
        # Medium weight (2)
        ("clinical trial success", 2), ("phase 3 results", 2), ("drug approved", 2),
        ("eua granted", 2), ("new drug application", 2),
        # Low weight (1)
        ("positive results", 1), ("trial data", 1), ("regulatory approval", 1),
        ("clearance", 1), ("green light", 1),
    ],
    "breakthrough": [
        # High weight (3)
        ("breakthrough", 3), ("revolutionary", 3), ("game-changing", 3),
        ("first-ever", 3), ("world's first", 3),
        # Medium weight (2)
        ("groundbreaking", 2), ("paradigm shift", 2), ("disruptive", 2),
        ("transformative", 2), ("next generation", 2),
        # Low weight (1)
        ("innovative", 1), ("cutting-edge", 1), ("milestone", 1),
        ("advanced", 1), ("pioneering", 1),
    ],
    "major_contract": [
        # High weight (3)
        ("billion dollar deal", 3), ("mega contract", 3), ("largest deal", 3),
        ("government contract", 3),
        # Medium weight (2)
        ("partnership", 2), ("major contract", 2), ("strategic alliance", 2),
        ("deal signed", 2), ("acquisition", 2),
        # Low weight (1)
        ("contract win", 1), ("agreement", 1), ("joint venture", 1),
        ("collaboration", 1), ("expanded partnership", 1),
    ],
    "earnings_beat": [
        # High weight (3)
        ("earnings beat", 3), ("blowout quarter", 3), ("record revenue", 3),
        ("raised guidance", 3), ("exceeds expectations", 3),
        # Medium weight (2)
        ("beat estimates", 2), ("strong results", 2), ("revenue surge", 2),
        ("profit soars", 2), ("above expectations", 2),
        # Low weight (1)
        ("solid quarter", 1), ("growth accelerates", 1), ("outperformed", 1),
        ("upside surprise", 1), ("bullish outlook", 1),
    ],
}

# Set of all high-weight keywords (weight 3) for confidence boosting
_HIGH_WEIGHT_KEYWORDS: set[str] = {
    kw for keywords in _KEYWORD_DICTS.values()
    for kw, weight in keywords if weight == 3
}


class EventClassifier:
    """Classifies detected events by type and direction using keyword scoring."""

    def __init__(self) -> None:
        self.keyword_dicts = _KEYWORD_DICTS
        self.direction_map = _DIRECTION_MAP

    def score_text(self, text: str, keywords: list[tuple[str, int]]) -> float:
        """Score a single text against a keyword list.

        Uses case-insensitive substring matching. Returns the sum of
        matched keyword weights.
        """
        text_lower = text.lower()
        total = 0.0
        for keyword, weight in keywords:
            if keyword in text_lower:
                total += weight
        return total

    def classify_article(self, headline: str, summary: str | None = None) -> dict:
        """Classify a single article by scoring headline + summary.

        Headline matches are weighted 1.5x compared to summary matches.
        Returns event_type, direction, scores, confidence, and matched keywords.
        """
        scores: dict[str, float] = {}
        all_matched: list[str] = []

        for event_type, keywords in self.keyword_dicts.items():
            # Headline score weighted 1.5x
            headline_score = self.score_text(headline, keywords) * 1.5

            # Summary score at 1.0x
            summary_score = 0.0
            if summary:
                summary_score = self.score_text(summary, keywords)

            scores[event_type] = headline_score + summary_score

            # Track which keywords matched
            combined_text = (headline + " " + (summary or "")).lower()
            for keyword, _ in keywords:
                if keyword in combined_text and keyword not in all_matched:
                    all_matched.append(keyword)

        # Find top two scores
        sorted_types = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        top_type, top_score = sorted_types[0]
        _, second_score = sorted_types[1] if len(sorted_types) > 1 else ("", 0.0)

        # Determine event type
        if top_score < _MIN_SCORE_THRESHOLD:
            event_type = "other"
        else:
            event_type = top_type

        # Compute confidence — how dominant the top score is
        if top_score > 0 and second_score > 0:
            confidence = top_score / (top_score + second_score)
        elif top_score >= _MIN_SCORE_THRESHOLD:
            confidence = min(0.5 + (top_score / 20.0), 0.9)
        elif top_score > 0:
            confidence = 0.3
        else:
            confidence = 0.0

        direction = self.direction_map.get(event_type, "neutral")

        return {
            "event_type": event_type,
            "direction": direction,
            "scores": scores,
            "confidence": confidence,
            "matched_keywords": all_matched,
        }

    def classify_event(
        self,
        articles: list,
        common_themes: list[str] | None = None,
        event_hint: str | None = None,
        options_flow: dict | None = None,
        fallback_direction: str | None = None,
        fallback_confidence: float | None = None,
    ) -> dict:
        """Classify a group of articles flagged as an outlier event.

        Uses majority vote across individual article classifications.
        Ties are broken by highest average score for that type.
        """
        if not articles:
            if event_hint == "options_flow":
                dynamic_direction = "neutral"
                if options_flow and options_flow.get("direction") in {"bullish", "bearish"}:
                    dynamic_direction = str(options_flow["direction"])
                elif fallback_direction in {"bullish", "bearish"}:
                    dynamic_direction = str(fallback_direction)

                confidence = (
                    float(options_flow.get("max_conviction", 0.0))
                    if options_flow
                    else float(fallback_confidence or 0.0)
                )
                return {
                    "event_type": "options_flow",
                    "direction": dynamic_direction,
                    "confidence": confidence,
                    "article_classifications": [],
                    "vote_distribution": {"options_flow": 1},
                    "top_keywords": [],
                }
            return {
                "event_type": "other",
                "direction": "neutral",
                "confidence": 0.0,
                "article_classifications": [],
                "vote_distribution": {},
                "top_keywords": [],
            }

        # Classify each article
        classifications: list[dict] = []
        for article in articles:
            headline = article.headline if hasattr(article, "headline") else str(article)
            summary = article.summary if hasattr(article, "summary") else None
            result = self.classify_article(headline, summary)
            classifications.append(result)

        # Majority vote
        vote_counter: Counter[str] = Counter()
        type_scores: dict[str, list[float]] = {}
        for cls in classifications:
            et = cls["event_type"]
            vote_counter[et] += 1
            type_scores.setdefault(et, []).append(cls["scores"].get(et, 0.0))

        # Find winner — most votes, ties broken by highest average score
        max_votes = max(vote_counter.values())
        tied_types = [t for t, v in vote_counter.items() if v == max_votes]

        if len(tied_types) == 1:
            event_type = tied_types[0]
        else:
            # Break tie by average score
            event_type = max(
                tied_types,
                key=lambda t: sum(type_scores.get(t, [0])) / max(len(type_scores.get(t, [1])), 1),
            )

        direction = self.direction_map.get(event_type, "neutral")

        # Aggregate confidence
        confidences = [cls["confidence"] for cls in classifications]
        avg_confidence = sum(confidences) / len(confidences)

        # Boost confidence if common_themes contain high-weight keywords
        if common_themes:
            for theme in common_themes:
                if theme.lower() in _HIGH_WEIGHT_KEYWORDS:
                    avg_confidence = min(avg_confidence + 0.1, 1.0)
                    break  # Only boost once

        # Collect top keywords across all articles
        keyword_counter: Counter[str] = Counter()
        for cls in classifications:
            keyword_counter.update(cls["matched_keywords"])
        top_keywords = [kw for kw, _ in keyword_counter.most_common(10)]

        vote_distribution = dict(vote_counter)

        logger.info(
            "Classified event: %s (%s), confidence=%.3f, votes=%s, top_keywords=%s",
            event_type, direction, avg_confidence, vote_distribution, top_keywords,
        )

        return {
            "event_type": event_type,
            "direction": direction,
            "confidence": avg_confidence,
            "article_classifications": classifications,
            "vote_distribution": vote_distribution,
            "top_keywords": top_keywords,
        }

    def reclassify_events(
        self,
        event_ids: list[str] | None = None,
        session: Session | None = None,
    ) -> list[dict]:
        """Re-run classification on existing events and update the database.

        Pulls events (all or by IDs), fetches their linked articles,
        re-classifies, and updates event_type, direction, and confidence.
        Returns a summary of changes.
        """
        def _run(s: Session) -> list[dict]:
            if event_ids:
                events = s.query(Event).filter(Event.id.in_(event_ids)).all()
            else:
                events = s.query(Event).all()

            if not events:
                logger.info("No events to reclassify.")
                return []

            results: list[dict] = []
            for event in events:
                # Fetch linked articles
                article_id_list = event.article_ids or []
                if not article_id_list:
                    logger.debug("Event %s has no linked articles, skipping.", event.id)
                    continue

                articles = (
                    s.query(Article)
                    .filter(Article.id.in_(article_id_list))
                    .all()
                )

                if not articles:
                    logger.debug("No articles found for event %s, skipping.", event.id)
                    continue

                # Extract common_themes from metadata if available
                common_themes = []
                if event.metadata_json and "common_themes" in event.metadata_json:
                    common_themes = event.metadata_json["common_themes"]

                # Reclassify
                cls_result = self.classify_event(articles, common_themes=common_themes)

                old_type = event.event_type
                old_direction = event.direction

                event.event_type = cls_result["event_type"]
                event.direction = cls_result["direction"]
                event.confidence = cls_result["confidence"]

                s.add(event)

                results.append({
                    "event_id": event.id,
                    "ticker": event.ticker,
                    "old_type": old_type,
                    "new_type": cls_result["event_type"],
                    "old_direction": old_direction,
                    "new_direction": cls_result["direction"],
                    "confidence": cls_result["confidence"],
                })

                logger.info(
                    "Reclassified event %s (%s): %s→%s, %s→%s, conf=%.3f",
                    event.id, event.ticker,
                    old_type, cls_result["event_type"],
                    old_direction, cls_result["direction"],
                    cls_result["confidence"],
                )

            s.flush()
            logger.info("Reclassified %d events.", len(results))
            return results

        if session is not None:
            return _run(session)
        with get_session() as s:
            return _run(s)

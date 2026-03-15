"""Tests for the Phase 2 anomaly detection pipeline.

Uses an in-memory SQLite database for fast, isolated tests.
"""

import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.database import Base
from src.db.tables import Article, Event
from src.detection.cross_source import CrossSourceValidator
from src.detection.sentiment_filter import SentimentFilter
from src.detection.volume_detector import VolumeDetector


@pytest.fixture
def db_session():
    """Create a fresh in-memory SQLite database for each test."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_article(
    ticker: str = "AAPL",
    headline: str = "Test headline",
    source: str = "TestSource",
    ingested_at: datetime | None = None,
    published_at: datetime | None = None,
) -> Article:
    """Helper to create an Article with sensible defaults."""
    now = datetime.now(timezone.utc)
    return Article(
        id=str(uuid.uuid4()),
        ticker=ticker,
        headline=headline,
        source=source,
        url=f"https://example.com/{uuid.uuid4()}",
        published_at=published_at or now,
        ingested_at=ingested_at or now,
    )


# ── VolumeDetector tests ─────────────────────────────────────────────


class TestVolumeDetector:
    def test_spike_detected(self, db_session):
        """Insert 14 days of baseline (3/day) + 15 today → z-score > 3."""
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Insert 14 days of baseline articles (3 per day)
        for day_offset in range(1, 15):
            day = today_start - timedelta(days=day_offset)
            for i in range(3):
                article = _make_article(
                    ticker="AAPL",
                    headline=f"Normal news day {day_offset} article {i}",
                    ingested_at=day + timedelta(hours=i),
                )
                db_session.add(article)

        # Insert 15 articles for today (a spike)
        for i in range(15):
            article = _make_article(
                ticker="AAPL",
                headline=f"Breaking news article {i}",
                ingested_at=today_start + timedelta(hours=1, minutes=i),
            )
            db_session.add(article)

        db_session.commit()

        detector = VolumeDetector(threshold=3.0)
        result = detector.detect_spike("AAPL", session=db_session)

        assert result is not None
        assert result["ticker"] == "AAPL"
        assert result["z_score"] > 3.0
        assert result["today_count"] == 15
        assert result["baseline_mean"] == pytest.approx(3.0)

    def test_no_spike(self, db_session):
        """Insert normal volume (3 articles today with 3/day baseline) → no spike."""
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # 14 days of baseline (3/day)
        for day_offset in range(1, 15):
            day = today_start - timedelta(days=day_offset)
            for i in range(3):
                article = _make_article(
                    ticker="AAPL",
                    headline=f"Normal news day {day_offset}",
                    ingested_at=day + timedelta(hours=i),
                )
                db_session.add(article)

        # 3 articles today (normal volume)
        for i in range(3):
            article = _make_article(
                ticker="AAPL",
                headline=f"Normal today article {i}",
                ingested_at=today_start + timedelta(hours=1, minutes=i),
            )
            db_session.add(article)

        db_session.commit()

        detector = VolumeDetector(threshold=3.0)
        result = detector.detect_spike("AAPL", session=db_session)

        assert result is None

    def test_cold_start_uses_defaults(self, db_session):
        """With fewer than 7 days of history, use default baseline."""
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Only 3 days of history
        for day_offset in range(1, 4):
            day = today_start - timedelta(days=day_offset)
            article = _make_article(
                ticker="TSLA",
                headline="Some news",
                ingested_at=day,
            )
            db_session.add(article)

        db_session.commit()

        detector = VolumeDetector()
        mean, std = detector.compute_baseline("TSLA", session=db_session)

        # Should fall back to defaults
        assert mean == 3.0
        assert std == 2.0


# ── SentimentFilter tests ────────────────────────────────────────────


class TestSentimentFilter:
    def test_extreme_headline(self):
        """Headlines with strong sentiment should be flagged as extreme."""
        sf = SentimentFilter(extreme_threshold=0.6)
        result = sf.score_headline("CEO arrested in massive fraud scandal")

        assert result["is_extreme"] is True
        # Updated for FinBERT scoring (was |compound| >= 0.6 with VADER)
        assert result["neg"] >= 0.6 or abs(result["compound"]) >= 0.6

    def test_mild_headline(self):
        """Neutral headlines should not be flagged as extreme."""
        sf = SentimentFilter(extreme_threshold=0.6)
        result = sf.score_headline("Company reports quarterly earnings")

        assert result["is_extreme"] is False

    def test_score_batch_passes(self, db_session):
        """Batch with mostly extreme headlines should pass the filter."""
        articles = [
            _make_article(headline="Massive fraud scandal rocks company"),
            _make_article(headline="CEO arrested for terrible corruption"),
            _make_article(headline="Devastating lawsuit threatens bankruptcy"),
            _make_article(headline="Normal quarterly update released"),
        ]
        for a in articles:
            db_session.add(a)
        db_session.flush()

        sf = SentimentFilter(extreme_threshold=0.6, extreme_ratio_threshold=0.5)
        result = sf.score_batch(articles)

        assert result["passes_filter"] is True
        assert result["extreme_ratio"] >= 0.5
        assert result["direction"] == "bearish"

    def test_mildly_negative_is_bearish(self, db_session):
        """Clearly negative headlines should classify the batch as bearish."""
        articles = [
            _make_article(headline="CEO indicted as accounting fraud probe expands"),
            _make_article(headline="Revenue miss triggers major guidance cut"),
            _make_article(headline="Regulators launch investigation into safety failures"),
            _make_article(headline="Normal quarterly update released"),
        ]
        for a in articles:
            db_session.add(a)
        db_session.flush()

        sf = SentimentFilter(extreme_threshold=0.3, extreme_ratio_threshold=0.05)
        result = sf.score_batch(articles)

        # Updated for FinBERT scoring (bearish threshold now -0.2)
        assert result["direction"] == "bearish"

    def test_score_batch_fails(self, db_session):
        """Batch with mostly mild headlines should not pass the filter."""
        articles = [
            _make_article(headline="Company releases quarterly report"),
            _make_article(headline="Market closes slightly higher today"),
            _make_article(headline="Board meeting scheduled for next week"),
            _make_article(headline="Terrible scandal rocks the company"),
        ]
        for a in articles:
            db_session.add(a)
        db_session.flush()

        sf = SentimentFilter(extreme_threshold=0.6, extreme_ratio_threshold=0.5)
        result = sf.score_batch(articles)

        assert result["passes_filter"] is False


# ── CrossSourceValidator tests ────────────────────────────────────────


class TestCrossSourceValidator:
    def test_passes_with_multiple_sources(self, db_session):
        """Validation should pass when articles come from 3+ sources."""
        articles = [
            _make_article(headline="Breaking news about AAPL", source="Reuters"),
            _make_article(headline="AAPL stock plummets", source="Bloomberg"),
            _make_article(headline="Apple faces crisis", source="CNBC"),
        ]
        for a in articles:
            db_session.add(a)
        db_session.flush()

        validator = CrossSourceValidator(min_sources=2)
        result = validator.validate("AAPL", articles=articles)

        assert result is not None
        assert result["passes"] is True
        assert result["distinct_sources"] == 3
        assert "reuters" in result["sources"]
        assert "bloomberg" in result["sources"]

    def test_fails_with_single_source(self, db_session):
        """Validation should fail when all articles are from one source."""
        articles = [
            _make_article(headline="AAPL news part 1", source="Reuters"),
            _make_article(headline="AAPL news part 2", source="Reuters"),
            _make_article(headline="AAPL news part 3", source="Reuters"),
        ]
        for a in articles:
            db_session.add(a)
        db_session.flush()

        validator = CrossSourceValidator(min_sources=2)
        result = validator.validate("AAPL", articles=articles)

        assert result is None

    def test_source_normalization(self, db_session):
        """Sources should be normalized (case-insensitive, stripped)."""
        articles = [
            _make_article(source="Reuters"),
            _make_article(source="REUTERS"),
            _make_article(source=" reuters "),
        ]
        for a in articles:
            db_session.add(a)
        db_session.flush()

        validator = CrossSourceValidator()
        source_info = validator.count_sources(articles)

        assert source_info["distinct_sources"] == 1

    def test_extract_common_themes(self, db_session):
        """Should extract words appearing in multiple headlines."""
        articles = [
            _make_article(headline="Apple stock crashes after scandal"),
            _make_article(headline="Apple faces major scandal investigation"),
            _make_article(headline="Apple scandal leads to CEO resignation"),
        ]

        validator = CrossSourceValidator()
        themes = validator.extract_common_themes(articles)

        assert "apple" in themes
        assert "scandal" in themes


# ── AnomalyPipeline integration test ─────────────────────────────────


class TestAnomalyPipelineDemo:
    def test_demo_mode_thresholds(self):
        """demo=True should lower sentiment and cross-source thresholds."""
        from src.detection import AnomalyPipeline

        pipeline = AnomalyPipeline(demo=True)

        assert pipeline.demo is True
        assert pipeline.sentiment_filter.extreme_threshold == 0.3
        assert pipeline.sentiment_filter.extreme_ratio_threshold == 0.05
        assert pipeline.cross_source.min_sources == 1

    def test_production_mode_thresholds(self):
        """demo=False should use normal production thresholds."""
        from src.detection import AnomalyPipeline

        pipeline = AnomalyPipeline(demo=False)

        assert pipeline.demo is False
        assert pipeline.sentiment_filter.extreme_threshold == 0.6
        assert pipeline.sentiment_filter.extreme_ratio_threshold == 0.5
        assert pipeline.cross_source.min_sources == 2

    def test_demo_flag_generates_signals(self, db_session):
        """Mild sentiment should generate signals in demo mode but not production mode."""
        from src.detection import AnomalyPipeline

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Insert 14 days of baseline (3 articles/day)
        for day_offset in range(1, 15):
            day = today_start - timedelta(days=day_offset)
            for i in range(3):
                article = _make_article(
                    ticker="MSFT",
                    headline=f"Normal Microsoft news day {day_offset}",
                    source="GenericNews",
                    ingested_at=day + timedelta(hours=i),
                )
                db_session.add(article)

        # Insert 15 articles recently with MILD sentiment (~10% extreme ratio)
        # and a single source — enough for demo mode but not production
        recent = now - timedelta(hours=1)  # within the 6-hour window
        mild_headlines = [
            ("Microsoft stock slightly lower today", "Reuters"),
            ("Company reports modest decline in cloud revenue", "Reuters"),
            ("Minor concerns about quarterly guidance", "Reuters"),
            ("Analysts divided on near-term outlook", "Reuters"),
            ("Market reacts to mixed earnings signals", "Reuters"),
            ("Team reorganization announced at division", "Reuters"),
            ("Small adjustment to product pricing expected", "Reuters"),
            ("Regulatory review progressing normally", "Reuters"),
            ("Industry trends show modest slowdown", "Reuters"),
            ("Partnership deal faces minor setback", "Reuters"),
            ("Terrible scandal rocks leadership team", "Reuters"),  # 1 extreme
            ("New office opened in regional market", "Reuters"),
            ("Employee survey shows stable satisfaction", "Reuters"),
            ("Supply chain performing within expectations", "Reuters"),
            ("Board meeting concludes with routine updates", "Reuters"),
        ]

        for headline, source in mild_headlines:
            article = _make_article(
                ticker="MSFT",
                headline=headline,
                source=source,
                ingested_at=recent,
            )
            db_session.add(article)

        db_session.commit()

        # Demo mode should detect outliers (low thresholds)
        demo_pipeline = AnomalyPipeline(demo=True)
        demo_results = demo_pipeline.scan(["MSFT"], session=db_session)

        # Production mode should NOT detect outliers (high thresholds)
        prod_pipeline = AnomalyPipeline(demo=False)
        prod_results = prod_pipeline.scan(["MSFT"], session=db_session)

        assert len(demo_results) >= 1, "Demo mode should detect the mild-sentiment data"
        assert len(prod_results) == 0, "Production mode should reject mild-sentiment data"


class TestAnomalyPipeline:
    def test_full_pipeline(self, db_session):
        """End-to-end: volume spike + extreme sentiment + multiple sources → outlier."""
        from src.detection import AnomalyPipeline

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Insert 14 days of baseline (3 articles/day)
        for day_offset in range(1, 15):
            day = today_start - timedelta(days=day_offset)
            for i in range(3):
                article = _make_article(
                    ticker="TSLA",
                    headline=f"Normal Tesla news day {day_offset}",
                    source="GenericNews",
                    ingested_at=day + timedelta(hours=i),
                )
                db_session.add(article)

        # Insert 15 extreme articles today from multiple sources
        extreme_headlines = [
            ("CEO arrested in massive fraud scandal", "Reuters"),
            ("Tesla faces devastating class action lawsuit", "Bloomberg"),
            ("Terrible safety violations uncovered at factory", "CNBC"),
            ("Shareholders furious over catastrophic losses", "AP"),
            ("Criminal investigation launched into company", "Reuters"),
            ("Stock crashes amid horrible corruption allegations", "Bloomberg"),
            ("Regulators slam company with massive fines", "WSJ"),
            ("Whistleblower reveals shocking safety failures", "CNBC"),
            ("Major recall announced amid terrible defects", "AP"),
            ("Company faces existential crisis and disaster", "Reuters"),
            ("Investors flee amid awful management scandal", "Bloomberg"),
            ("Government threatens to shut down operations", "WSJ"),
            ("Devastating report reveals systematic fraud", "CNBC"),
            ("Company stock plummets on horrific revelations", "AP"),
            ("Crisis deepens as more terrible details emerge", "Reuters"),
        ]

        for headline, source in extreme_headlines:
            article = _make_article(
                ticker="TSLA",
                headline=headline,
                source=source,
                ingested_at=today_start + timedelta(hours=1),
            )
            db_session.add(article)

        db_session.commit()

        pipeline = AnomalyPipeline(
            volume_threshold=3.0,
            sentiment_threshold=0.6,
            extreme_ratio=0.5,
            min_sources=2,
        )

        results = pipeline.scan(["TSLA"], session=db_session)

        assert len(results) == 1
        result = results[0]
        assert result["ticker"] == "TSLA"
        assert result["z_score"] > 3.0
        assert result["direction"] == "bearish"
        assert result["distinct_sources"] >= 2
        assert result["confidence_score"] > 0
        assert len(result["article_ids"]) > 0

    def test_pipeline_no_spike_no_result(self, db_session):
        """Normal volume should yield no outliers even with extreme sentiment."""
        from src.detection import AnomalyPipeline

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Baseline: 3/day for 14 days
        for day_offset in range(1, 15):
            day = today_start - timedelta(days=day_offset)
            for i in range(3):
                article = _make_article(
                    ticker="AAPL",
                    headline="Normal Apple news",
                    source="Reuters",
                    ingested_at=day + timedelta(hours=i),
                )
                db_session.add(article)

        # Only 3 articles today (normal volume) — even if extreme sentiment
        for i in range(3):
            article = _make_article(
                ticker="AAPL",
                headline="Catastrophic scandal destroys everything",
                source=["Reuters", "Bloomberg", "CNBC"][i],
                ingested_at=today_start + timedelta(hours=1, minutes=i),
            )
            db_session.add(article)

        db_session.commit()

        pipeline = AnomalyPipeline()
        results = pipeline.scan(["AAPL"], session=db_session)

        # Should not detect because volume didn't spike
        assert len(results) == 0

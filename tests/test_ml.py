"""Tests for ML feature extraction, model training, and ensemble scaffolding."""

from __future__ import annotations

import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.database import Base
from src.db.tables import Event, Signal
from src.ml.ensemble import EnsembleClassifier
from src.ml.feature_extractor import FeatureExtractor
from src.ml.model import OutlierQModel
from src.ml.trainer import ModelTrainer


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def generate_synthetic_dataset(n: int = 100) -> tuple[list[list[float]], list[int]]:
    """Generate synthetic features and labels for testing."""
    np.random.seed(42)
    n_features = len(FeatureExtractor().get_feature_names())
    X = np.random.randn(n, n_features).tolist()
    scores = np.array(X)[:, :5].sum(axis=1)
    y = (scores > np.median(scores)).astype(int).tolist()
    return X, y


def _seed_signal(
    db_session,
    idx: int,
    outcome: str,
    event_type: str = "scandal",
    confidence: float = 0.75,
) -> Signal:
    event_id = f"evt-{uuid.uuid4()}"
    base_ts = datetime.now(timezone.utc) - timedelta(days=120 - idx)
    event = Event(
        id=event_id,
        ticker="AAPL" if idx % 2 == 0 else "TSLA",
        event_type=event_type,
        direction="bearish" if event_type in {"scandal", "legal", "earnings_miss"} else "bullish",
        confidence=confidence,
        detected_at=base_ts,
        article_ids=[],
        metadata_json={
            "z_score": float(idx % 5),
            "mean_sentiment": 0.4 if outcome == "profit" else -0.2,
            "extreme_ratio": 0.4 if outcome == "profit" else 0.1,
            "distinct_sources": 2 + (idx % 3),
            "sources": ["src1", "src2"],
            "common_themes": ["theme"],
            "source": "news_pipeline",
            "options_flow": {
                "direction": "bullish" if outcome == "profit" else "bearish",
                "unusual_contract_count": 3,
                "max_conviction": 0.8 if outcome == "profit" else 0.3,
                "put_call_ratio": 0.8 if outcome == "profit" else 1.4,
                "total_unusual_call_volume": 1200 if outcome == "profit" else 400,
                "total_unusual_put_volume": 400 if outcome == "profit" else 900,
            },
            "edgar_data": {
                "combined_severity": 0.5 if outcome == "profit" else 0.2,
                "has_significant_filing": idx % 4 == 0,
                "has_unusual_insider_activity": idx % 5 == 0,
                "insider_analysis": {"total_form4s": 2},
                "8k_analysis": {"recent_8k_count": 1},
            },
            "vote_distribution": {"scandal": 3, "other": 1},
            "technical_context": {
                "rsi_14": 35 if outcome == "profit" else 75,
                "bollinger_pct_b": 0.2 if outcome == "profit" else 0.9,
                "bollinger_bandwidth": 0.15,
                "atr_pct": 2.1,
                "macd_histogram": 0.3 if outcome == "profit" else -0.2,
                "relative_volume": 1.8,
                "trend_20d": 3.0 if outcome == "profit" else -2.5,
            },
        },
    )
    db_session.add(event)
    db_session.flush()

    signal = Signal(
        id=f"sig-{uuid.uuid4()}",
        ticker=event.ticker,
        event_id=event.id,
        direction="call" if event.direction == "bullish" else "put",
        suggested_strike=150.0,
        suggested_expiry=(base_ts + timedelta(days=21)).date().isoformat(),
        confidence=event.confidence,
        created_at=base_ts,
        outcome=outcome,
        outcome_pnl=10.0 if outcome == "profit" else -50.0,
    )
    db_session.add(signal)
    db_session.flush()
    return signal


def test_feature_extractor_all_fields():
    extractor = FeatureExtractor()
    event = {
        "ticker": "AAPL",
        "z_score": 3.2,
        "today_count": 12,
        "distinct_sources": 4,
        "mean_sentiment": 0.45,
        "max_magnitude": 0.88,
        "extreme_ratio": 0.5,
        "event_type": "earnings_beat",
        "confidence": 0.81,
        "detected_at": datetime.now(timezone.utc).isoformat(),
        "options_flow": {
            "direction": "bullish",
            "max_conviction": 0.76,
            "total_unusual_call_volume": 1400,
            "total_unusual_put_volume": 300,
            "put_call_ratio": 0.21,
            "unusual_contract_count": 4,
        },
        "edgar_data": {
            "has_significant_filing": True,
            "combined_severity": 0.63,
            "has_unusual_insider_activity": True,
            "insider_analysis": {"total_form4s": 5},
            "8k_analysis": {"recent_8k_count": 1},
        },
        "metadata": {
            "vote_distribution": {"earnings_beat": 5, "other": 1},
            "technical_context": {
                "rsi_14": 48.0,
                "bollinger_pct_b": 0.35,
                "bollinger_bandwidth": 0.21,
                "atr_pct": 2.3,
                "macd_histogram": 0.08,
                "relative_volume": 1.4,
                "trend_20d": 4.6,
            },
        },
        "company_info": {"market_cap": 2500000000000, "is_sp500": True},
    }
    features = extractor.extract_from_event(event)
    expected = set(extractor.get_feature_names())
    assert set(features.keys()) == expected


def test_feature_extractor_missing_data():
    extractor = FeatureExtractor()
    features = extractor.extract_from_event({"ticker": "TSLA"})
    assert len(features) == len(extractor.get_feature_names())
    assert features["keyword_event_type_encoded"] == -1.0
    assert features["market_cap_log"] == -1.0


def test_feature_extractor_to_vector():
    extractor = FeatureExtractor()
    features = extractor.extract_from_event({"ticker": "AAPL"})
    vector = extractor.to_vector(features)
    assert len(vector) == len(extractor.get_feature_names())


def test_feature_names_order():
    extractor = FeatureExtractor()
    features = extractor.extract_from_event({"ticker": "AAPL", "z_score": 2.0})
    names = extractor.get_feature_names()
    vector = extractor.to_vector(features)
    assert len(names) == len(vector)
    assert vector[names.index("news_volume_zscore")] == 2.0


def test_build_training_dataset_empty(db_session):
    extractor = FeatureExtractor()
    X, y, signal_ids = extractor.build_training_dataset(db_session)
    assert X == []
    assert y == []
    assert signal_ids == []


def test_build_training_dataset_with_data(db_session):
    for i in range(6):
        _seed_signal(db_session, i, outcome="profit" if i % 2 == 0 else "loss")
    extractor = FeatureExtractor()
    X, y, signal_ids = extractor.build_training_dataset(db_session)
    assert len(X) == 6
    assert len(y) == 6
    assert len(signal_ids) == 6
    assert set(y) == {0, 1}


def test_model_train_insufficient_data():
    model = OutlierQModel()
    model.model_path = Path(".cache/test_ml_small.pkl")
    extractor = FeatureExtractor()
    X, y = generate_synthetic_dataset(20)
    with pytest.raises(ValueError):
        model.train(X, y, extractor.get_feature_names())


def test_model_train_success(tmp_path):
    model = OutlierQModel()
    model.model_path = tmp_path / "ml_model.pkl"
    extractor = FeatureExtractor()
    X, y = generate_synthetic_dataset(50)
    metrics = model.train(X, y, extractor.get_feature_names())
    assert model.is_trained is True
    assert "accuracy" in metrics
    assert "f1_score" in metrics
    assert (tmp_path / "ml_model.pkl").exists()


def test_model_predict(tmp_path):
    model = OutlierQModel()
    model.model_path = tmp_path / "ml_model.pkl"
    extractor = FeatureExtractor()
    X, y = generate_synthetic_dataset(50)
    model.train(X, y, extractor.get_feature_names())
    features = {
        name: float(i) / 10.0 for i, name in enumerate(extractor.get_feature_names())
    }
    pred = model.predict(features)
    assert set(pred.keys()) == {
        "prediction",
        "confidence",
        "profit_probability",
        "loss_probability",
    }
    assert pred["prediction"] in {0, 1}


def test_model_save_load(tmp_path):
    extractor = FeatureExtractor()
    X, y = generate_synthetic_dataset(60)
    features = {
        name: float(i) / 20.0 for i, name in enumerate(extractor.get_feature_names())
    }

    model1 = OutlierQModel()
    model1.model_path = tmp_path / "model.pkl"
    model1.train(X, y, extractor.get_feature_names())
    pred1 = model1.predict(features)

    model2 = OutlierQModel()
    loaded = model2.load(path=tmp_path / "model.pkl")
    assert loaded is True
    pred2 = model2.predict(features)
    assert pred1["prediction"] == pred2["prediction"]
    assert pred1["profit_probability"] == pytest.approx(pred2["profit_probability"])


def test_model_feature_importances(tmp_path):
    extractor = FeatureExtractor()
    X, y = generate_synthetic_dataset(80)
    model = OutlierQModel()
    model.model_path = tmp_path / "importances.pkl"
    model.train(X, y, extractor.get_feature_names())
    importances = model.get_feature_importances()
    assert len(importances) == len(extractor.get_feature_names())
    assert importances[0][1] >= importances[-1][1]


def test_ensemble_keyword_only():
    ensemble = EnsembleClassifier()
    ensemble.model.is_trained = False

    class _KeywordStub:
        def classify_event(self, *args, **kwargs):
            return {
                "event_type": "scandal",
                "direction": "bearish",
                "confidence": 0.7,
                "article_classifications": [],
                "vote_distribution": {"scandal": 1},
                "top_keywords": [],
            }

    ensemble.keyword_classifier = _KeywordStub()
    result = ensemble.classify([], {"ticker": "AAPL", "source": "news_pipeline"})
    assert result["event_type"] == "scandal"
    assert result["direction"] == "bearish"
    assert "ml_prediction" not in result


def test_ensemble_blended():
    ensemble = EnsembleClassifier()

    class _KeywordStub:
        def classify_event(self, *args, **kwargs):
            return {
                "event_type": "earnings_beat",
                "direction": "bullish",
                "confidence": 0.6,
                "article_classifications": [],
                "vote_distribution": {"earnings_beat": 2},
                "top_keywords": [],
            }

    class _ModelStub:
        is_trained = True

        def predict(self, features):
            return {
                "prediction": 1,
                "confidence": 0.8,
                "profit_probability": 0.8,
                "loss_probability": 0.2,
            }

    ensemble.keyword_classifier = _KeywordStub()
    ensemble.model = _ModelStub()
    result = ensemble.classify([], {"ticker": "AAPL", "source": "news_pipeline"})
    assert result["event_type"] == "earnings_beat"
    assert result["direction"] == "bullish"
    assert "ml_prediction" in result
    assert "ensemble_method" in result


def test_readiness_check(db_session):
    trainer = ModelTrainer()
    r0 = trainer.check_readiness(session=db_session)
    assert r0["ready_to_train"] is False

    for i in range(29):
        _seed_signal(db_session, i, outcome="profit" if i % 2 == 0 else "loss")
    r1 = trainer.check_readiness(session=db_session)
    assert r1["signals_with_outcomes"] == 29
    assert r1["ready_to_train"] is False

    _seed_signal(db_session, 30, outcome="profit")
    r2 = trainer.check_readiness(session=db_session)
    assert r2["ready_to_train"] is True


def test_trainer_workflow(db_session, tmp_path):
    for i in range(40):
        if i % 3 == 0:
            outcome = "profit"
        elif i % 3 == 1:
            outcome = "loss"
        else:
            outcome = "expired"
        _seed_signal(db_session, i, outcome=outcome)

    trainer = ModelTrainer()
    trainer.model.model_path = tmp_path / "workflow.pkl"
    result = trainer.train(session=db_session)
    assert "error" not in result
    assert trainer.model.is_trained is True

    recent = trainer.evaluate_on_recent(session=db_session, n=20)
    assert recent["n_evaluated"] == 20
    assert "model_accuracy" in recent
    assert "keyword_accuracy" in recent
    assert len(recent["comparison"]) == 20

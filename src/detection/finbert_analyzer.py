"""Financial sentiment analysis using FinBERT with VADER fallback."""

from __future__ import annotations

import logging
import time
from typing import Any

from config.settings import FINBERT_DEVICE, FINBERT_MODEL, LOG_FORMAT

try:
    import torch
except ImportError:  # pragma: no cover - covered via fallback behavior tests
    torch = None  # type: ignore[assignment]

try:
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
except ImportError:  # pragma: no cover - covered via fallback behavior tests
    AutoModelForSequenceClassification = None  # type: ignore[assignment]
    AutoTokenizer = None  # type: ignore[assignment]

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from src.detection.finance_lexicon import FINANCE_LEXICON

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def _make_finance_vader() -> SentimentIntensityAnalyzer:
    """VADER with finance-domain lexicon corrections (see finance_lexicon.py)."""
    analyzer = SentimentIntensityAnalyzer()
    analyzer.lexicon.update(FINANCE_LEXICON)
    return analyzer


class FinBERTAnalyzer:
    """Runs sentiment analysis with FinBERT, falling back to VADER if needed."""

    def __init__(
        self,
        device: str | None = None,
        model_name: str = FINBERT_MODEL,
        extreme_threshold: float = 0.6,
    ) -> None:
        self.model_name = model_name
        self.extreme_threshold = extreme_threshold
        self.label_map: dict[int, str] = {0: "positive", 1: "negative", 2: "neutral"}
        self.fallback = False
        self._fallback_analyzer: SentimentIntensityAnalyzer | None = None
        self.tokenizer: Any | None = None
        self.model: Any | None = None

        if device is None:
            device = FINBERT_DEVICE
        if not device:
            if torch is not None and torch.cuda.is_available():
                device = "cuda"
            else:
                device = "cpu"
        self.device = device

        self._load_model()

    def _load_model(self) -> None:
        load_start = time.perf_counter()
        try:
            if torch is None or AutoTokenizer is None or AutoModelForSequenceClassification is None:
                raise ImportError(
                    "Missing required FinBERT dependencies. Install transformers and torch."
                )

            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
            self.model.to(self.device)
            self.model.eval()
            self.label_map = self._label_map_from_config(self.model, self.label_map)
            elapsed = time.perf_counter() - load_start
            logger.info(
                "FinBERT loaded on %s in %.2fs (label order: %s)",
                self.device, elapsed,
                [self.label_map[i] for i in sorted(self.label_map)],
            )
        except Exception as exc:
            self.fallback = True
            self._fallback_analyzer = _make_finance_vader()
            logger.error(
                "Failed to load FinBERT model. Falling back to VADER. Error: %s",
                exc,
            )

    def _warn_fallback(self) -> None:
        if self.fallback:
            logger.warning("Using VADER fallback — FinBERT unavailable")

    @staticmethod
    def _label_map_from_config(model: Any, default: dict[int, str]) -> dict[int, str]:
        """Read the class-index -> label order from the model's own config.

        Different sentiment checkpoints order their heads differently
        (ProsusAI/finbert is positive/negative/neutral; finbert-tone is
        neutral/positive/negative). Hardcoding an order silently mis-maps
        every score when FINBERT_MODEL is changed, so trust the config
        whenever it names exactly our three classes.
        """
        try:
            id2label = {int(k): str(v).lower() for k, v in model.config.id2label.items()}
        except (AttributeError, TypeError, ValueError):
            return default
        if sorted(id2label) == [0, 1, 2] and set(id2label.values()) == {
            "positive", "negative", "neutral"
        }:
            return id2label
        logger.warning(
            "Model config id2label %s does not name positive/negative/neutral — "
            "keeping default label order", getattr(model.config, "id2label", None),
        )
        return default

    def _result_from_probs(self, probs: list[float]) -> dict[str, Any]:
        by_label = {self.label_map[i]: float(probs[i]) for i in range(3)}
        positive = by_label["positive"]
        negative = by_label["negative"]
        neutral = by_label["neutral"]
        confidence = max(positive, negative, neutral)
        best_idx = max(range(3), key=lambda i: probs[i])

        return {
            "label": self.label_map[best_idx],
            "positive": positive,
            "negative": negative,
            "neutral": neutral,
            "compound": positive - negative,
            "confidence": float(confidence),
            "is_extreme": max(positive, negative) >= self.extreme_threshold,
        }

    def _analyze_vader(self, text: str) -> dict[str, Any]:
        if self._fallback_analyzer is None:
            self._fallback_analyzer = _make_finance_vader()
        scores = self._fallback_analyzer.polarity_scores(text)
        positive = float(scores["pos"])
        negative = float(scores["neg"])
        neutral = float(scores["neu"])
        compound = float(scores["compound"])
        confidence = max(positive, negative, neutral)

        if positive >= negative and positive >= neutral:
            label = "positive"
        elif negative >= positive and negative >= neutral:
            label = "negative"
        else:
            label = "neutral"

        return {
            "label": label,
            "positive": positive,
            "negative": negative,
            "neutral": neutral,
            "compound": compound,
            "confidence": confidence,
            # Preserve prior behavior for fallback mode where thresholds were
            # historically based on VADER compound magnitude.
            "is_extreme": abs(compound) >= self.extreme_threshold,
        }

    def analyze(self, text: str) -> dict[str, Any]:
        """Analyze one text and return probabilities + compatibility fields."""
        if not text:
            return self._result_from_probs([0.0, 0.0, 1.0])

        if self.fallback:
            self._warn_fallback()
            return self._analyze_vader(text)

        assert self.tokenizer is not None
        assert self.model is not None
        assert torch is not None

        try:
            encoded = self.tokenizer(
                text,
                max_length=512,
                truncation=True,
                padding=True,
                return_tensors="pt",
            )
            encoded = {k: v.to(self.device) for k, v in encoded.items()}

            with torch.no_grad():
                logits = self.model(**encoded).logits
                probs_tensor = torch.softmax(logits, dim=-1)[0].detach().cpu().tolist()
            return self._result_from_probs([float(p) for p in probs_tensor])
        except RuntimeError as exc:
            if self.device == "cuda" and "out of memory" in str(exc).lower():
                logger.warning(
                    "CUDA OOM during analyze(); retrying on CPU for this model session"
                )
                torch.cuda.empty_cache()
                self.device = "cpu"
                self.model.to(self.device)
                return self.analyze(text)
            raise

    def analyze_batch(
        self,
        texts: list[str],
        batch_size: int = 16,
    ) -> list[dict[str, Any]]:
        """Analyze multiple texts in batches for better throughput."""
        if not texts:
            return []

        start = time.perf_counter()

        if self.fallback:
            self._warn_fallback()
            results = [self._analyze_vader(text) for text in texts]
            elapsed = time.perf_counter() - start
            batches = (len(texts) + max(1, batch_size) - 1) // max(1, batch_size)
            logger.info(
                "Analyzed %d texts in %d batches (%.2fs)",
                len(texts),
                batches,
                elapsed,
            )
            return results

        assert self.tokenizer is not None
        assert self.model is not None
        assert torch is not None

        safe_batch_size = max(1, batch_size)
        results: list[dict[str, Any]] = []

        try:
            for idx in range(0, len(texts), safe_batch_size):
                batch = texts[idx : idx + safe_batch_size]
                encoded = self.tokenizer(
                    batch,
                    max_length=512,
                    truncation=True,
                    padding=True,
                    return_tensors="pt",
                )
                encoded = {k: v.to(self.device) for k, v in encoded.items()}

                with torch.no_grad():
                    logits = self.model(**encoded).logits
                    probs = torch.softmax(logits, dim=-1).detach().cpu().tolist()
                for row in probs:
                    results.append(self._result_from_probs([float(p) for p in row]))
        except RuntimeError as exc:
            if self.device == "cuda" and "out of memory" in str(exc).lower():
                logger.warning(
                    "CUDA OOM during batch inference; switching to CPU and reducing batch size"
                )
                torch.cuda.empty_cache()
                self.device = "cpu"
                self.model.to(self.device)
                reduced_batch = max(1, safe_batch_size // 2)
                return self.analyze_batch(texts, batch_size=reduced_batch)
            raise

        elapsed = time.perf_counter() - start
        batches = (len(texts) + safe_batch_size - 1) // safe_batch_size
        logger.info(
            "Analyzed %d texts in %d batches (%.2fs)",
            len(texts),
            batches,
            elapsed,
        )
        return results

    def get_financial_sentiment(
        self,
        headline: str,
        summary: str | None = None,
    ) -> dict[str, Any]:
        """Convenience method that combines headline + optional summary sentiment."""
        headline_result = self.analyze(headline)
        if not summary:
            result = dict(headline_result)
            result["headline_sentiment"] = headline_result
            result["summary_sentiment"] = None
            return result

        summary_result = self.analyze(summary[:512])
        compound = headline_result["compound"] * 0.6 + summary_result["compound"] * 0.4
        confidence = (
            headline_result["confidence"] * 0.6 + summary_result["confidence"] * 0.4
        )

        if headline_result["label"] == summary_result["label"]:
            label = headline_result["label"]
        elif headline_result["confidence"] >= summary_result["confidence"]:
            label = headline_result["label"]
        else:
            label = summary_result["label"]

        positive = headline_result["positive"] * 0.6 + summary_result["positive"] * 0.4
        negative = headline_result["negative"] * 0.6 + summary_result["negative"] * 0.4
        neutral = headline_result["neutral"] * 0.6 + summary_result["neutral"] * 0.4

        return {
            "label": label,
            "positive": float(positive),
            "negative": float(negative),
            "neutral": float(neutral),
            "compound": float(compound),
            "confidence": float(confidence),
            "is_extreme": max(float(positive), float(negative)) >= self.extreme_threshold,
            "headline_sentiment": headline_result,
            "summary_sentiment": summary_result,
        }

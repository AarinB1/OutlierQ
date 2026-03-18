"""HTTP client wrapping MiroFish-Offline's Flask API (port 5001).

Interacts with MiroFish exclusively via HTTP — no source code is copied
or imported from MiroFish-Offline (AGPL-3.0).
"""

import logging
import time

import requests

from config.settings import MIROFISH_BASE_URL, MIROFISH_TIMEOUT

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_RETRY_BACKOFF = 1.5  # seconds, multiplied each retry


class MirofishClient:
    """Thin HTTP wrapper around the MiroFish-Offline REST API."""

    def __init__(self, base_url: str | None = None, timeout: int | None = None) -> None:
        self.base_url = (base_url or MIROFISH_BASE_URL).rstrip("/")
        self.timeout = timeout or MIROFISH_TIMEOUT

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    def is_available(self) -> bool:
        """Return True if MiroFish API is reachable."""
        try:
            resp = requests.get(f"{self.base_url}/", timeout=5)
            return resp.status_code < 500
        except requests.RequestException:
            return False

    # ------------------------------------------------------------------
    # Core API methods
    # ------------------------------------------------------------------

    def build_graph(self, seed_text: str) -> str:
        """Upload seed text and return the project_id."""
        data = self._post("/api/graph/build", json={"text": seed_text})
        return data["project_id"]

    def prepare_simulation(self, project_id: str) -> dict:
        """Generate agent personas from the knowledge graph."""
        return self._post("/api/simulation/prepare", json={"project_id": project_id})

    def start_simulation(self, project_id: str, num_rounds: int = 20) -> str:
        """Launch a simulation run and return the simulation id."""
        data = self._post(
            "/api/simulation/start",
            json={"project_id": project_id, "num_rounds": num_rounds},
        )
        return data.get("simulation_id") or data.get("project_id", project_id)

    def poll_status(self, simulation_id: str) -> dict:
        """Check simulation progress. Returns dict with at least a 'status' key."""
        return self._get(f"/api/simulation/status/{simulation_id}")

    def generate_report(self, project_id: str) -> dict:
        """Generate the prediction report after simulation completes."""
        return self._post("/api/report/generate", json={"project_id": project_id})

    def chat_report(self, project_id: str, question: str) -> str:
        """Query ReportAgent with a question. Returns the answer text."""
        data = self._post(
            "/api/report/chat",
            json={"project_id": project_id, "question": question},
        )
        return data.get("answer", data.get("response", ""))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _post(self, path: str, **kwargs) -> dict:
        return self._request("POST", path, **kwargs)

    def _get(self, path: str, **kwargs) -> dict:
        return self._request("GET", path, **kwargs)

    def _request(self, method: str, path: str, **kwargs) -> dict:
        url = f"{self.base_url}{path}"
        last_exc: Exception | None = None

        for attempt in range(_MAX_RETRIES):
            try:
                resp = requests.request(method, url, timeout=self.timeout, **kwargs)
                resp.raise_for_status()
                return resp.json()
            except requests.RequestException as exc:
                last_exc = exc
                wait = _RETRY_BACKOFF * (2 ** attempt)
                logger.warning(
                    "MiroFish request %s %s failed (attempt %d/%d): %s — retrying in %.1fs",
                    method, path, attempt + 1, _MAX_RETRIES, exc, wait,
                )
                time.sleep(wait)

        raise ConnectionError(
            f"MiroFish request {method} {path} failed after {_MAX_RETRIES} attempts"
        ) from last_exc

# OutlierQ

**Event-driven options trading signal generator** — detects extreme news events and recommends call/put options trades.

## Thesis

Markets overreact to extreme events (scandals, FDA approvals, lawsuits, earnings surprises). OutlierQ monitors news and social media in real time, detects statistical outliers, classifies event types, and generates actionable options signals before the market fully prices in the move.

## Interactive demo

- **Project page:** https://aarinb1.github.io/OutlierQ/
- **Dashboard demo (synthetic data):** https://aarinb1.github.io/OutlierQ/demo/

The deployed dashboard is a **static demo running on baked synthetic fixtures**. GitHub
Pages serves static files only, so the FastAPI server, SQLite database, Finnhub and
yfinance calls, and FinBERT inference are not running behind it — every number you see
there is generated, not observed. To run the real pipeline against live data, follow
[Quick Start](#quick-start) below.

## How It Works

1. **Ingest** — Pulls news articles from Finnhub and market data from yfinance on a schedule
2. **Detect** — Scores articles with FinBERT sentiment, computes z-scores for volume spikes, detects unusual options activity (UOA), and flags statistical outliers
3. **Classify** — Categorizes outlier events (scandal, FDA approval, earnings beat/miss, etc.) and infers bullish/bearish direction
4. **Signal** — Maps each classified event to a call or put recommendation with suggested strike price and expiration
5. **Track** — Evaluates past signals against actual price movement to measure accuracy and improve over time

## Architecture

| Phase | Module | Description |
|-------|--------|-------------|
| 1 | **Ingestion** | Fetch news (Finnhub), market data (yfinance), social (Reddit) |
| 2 | **Detection** | Z-score spike detection, FinBERT sentiment scoring, unusual options flow (UOA), cross-source confirmation |
| 3 | **Classification** | Categorize events (scandal, FDA, earnings, etc.) and assign direction |
| 4 | **Signals** | Generate call/put recommendations with strike & expiry suggestions |
| 5 | **Dashboard** | React frontend + feedback tracking for monitoring signals and accuracy |

## Quick Start

```bash
# Clone and enter the project
git clone https://github.com/AarinB1/OutlierQ.git
cd OutlierQ

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure API keys
cp .env.example .env
# Edit .env with your Finnhub API key (free at finnhub.io)

# Run a one-time scan with signal generation
python scripts/run_ingestion.py --once --signals --tickers AAPL,TSLA

# Evaluate past signal accuracy
python scripts/run_ingestion.py --evaluate

# Run with the scheduler (market hours only)
python scripts/run_ingestion.py --signals

# Run tests
pytest tests/
```

## Running the Dashboard

The dashboard has two parts: a FastAPI backend and a React frontend.

**Start the API server:**

```bash
python scripts/run_ingestion.py --api
# API at http://localhost:8000 — docs at http://localhost:8000/docs
```

**Start the React dashboard (in a separate terminal):**

```bash
cd dashboard
npm install
npm run dev
# Dashboard at http://localhost:5173
```

The React dev server proxies `/api` requests to the FastAPI backend automatically.

## Testing & Demo

OutlierQ's detection thresholds are tuned for real outlier events, which means normal market days won't generate signals. Two CLI flags make testing and demos easier:

- `--demo` — Lowers sentiment and cross-source thresholds so signals generate on normal market data. Volume threshold is unchanged (it already triggers on cold start).
- `--anytime` — Runs the scheduler on simple intervals instead of restricting to Mon-Fri market hours. Useful for testing on evenings and weekends.

**One-shot demo (recommended for screenshots):**

```bash
python3 scripts/run_ingestion.py --once --signals --demo --tickers AAPL,TSLA,NVDA
```

**Continuous demo (scheduled, any time of day):**

```bash
python3 scripts/run_ingestion.py --signals --demo --anytime --tickers AAPL,TSLA,NVDA
```

> **Note:** Signals generated with `--demo` use relaxed thresholds and should not be treated as real trading recommendations.

## ML Model

OutlierQ now includes an ML classifier scaffold that augments the keyword classifier.

- **Default behavior:** keyword classifier remains the primary system.
- **ML mode:** once trained, you can enable an ensemble path that blends keyword + ML confidence.
- **Training requirement:** ML training needs accumulated labeled outcomes (profit/loss/expired) before it is meaningful.

**Train the model (when enough labeled signals exist):**

```bash
python3 scripts/run_ingestion.py --train-ml
```

**Check readiness and model status:**

```bash
python3 scripts/run_ingestion.py --ml-status
```

The ML feature set combines:

- FinBERT sentiment features
- News volume anomaly features
- Unusual options flow features
- Technical indicators
- EDGAR filing/insider activity features
- Existing keyword-classifier outputs

## Tech Stack

- **Python 3.11+** — core language
- **Finnhub API** — real-time company news
- **yfinance** — price history and options chain data
- **SQLite** — local database (swap to PostgreSQL by changing `DATABASE_URL`)
- **SQLAlchemy** — ORM and database management
- **Pydantic** — data validation and serialization
- **APScheduler** — job scheduling during market hours
- **FinBERT (Transformers + PyTorch)** — financial sentiment analysis
- **Unusual Options Activity (UOA)** — options flow detection using yfinance options chain
- **FastAPI** — REST API backend
- **React + TypeScript** — dashboard frontend
- **Tailwind CSS** — dashboard styling

## Project Status

- [x] Phase 1: Data Ingestion (Finnhub news, yfinance market data, scheduler)
- [x] Phase 2: Outlier Detection (Z-score spikes, sentiment filtering, cross-source)
- [x] Phase 3: Event Classification (type categorization, direction inference)
- [x] Phase 4: Signal Generation (call/put recommendations, strike/expiry)
- [x] Phase 5: Dashboard & Feedback (React frontend, accuracy tracking)

## License

MIT

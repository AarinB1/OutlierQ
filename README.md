# OutlierQ

**Event-driven options trading signal generator** — detects extreme news events and recommends call/put options trades.

## Thesis

Markets overreact to extreme events (scandals, FDA approvals, lawsuits, earnings surprises). OutlierQ monitors news and social media in real time, detects statistical outliers, classifies event types, and generates actionable options signals before the market fully prices in the move.

## Architecture

OutlierQ is built in 5 phases:

| Phase | Module | Description |
|-------|--------|-------------|
| 1 | **Ingestion** | Fetch news (Finnhub), market data (yfinance), social (Reddit) |
| 2 | **Detection** | Z-score spike detection, sentiment scoring, cross-source confirmation |
| 3 | **Classification** | Categorize events (scandal, FDA, earnings, etc.) and assign direction |
| 4 | **Signals** | Generate call/put recommendations with strike & expiry suggestions |
| 5 | **Dashboard** | React frontend for monitoring signals and performance |

## Quick Start

```bash
# Clone and enter the project
git clone https://github.com/your-username/OutlierQ.git
cd OutlierQ

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure API keys
cp .env.example .env
# Edit .env with your Finnhub API key (free at finnhub.io)

# Run a one-time ingestion
python scripts/run_ingestion.py --once --tickers AAPL,TSLA

# Run with the scheduler (market hours only)
python scripts/run_ingestion.py

# Run tests
pytest tests/
```

## Tech Stack

- **Python 3.11+** — core language
- **Finnhub API** — real-time company news
- **yfinance** — price history and options chain data
- **SQLite** — local database (swap to PostgreSQL by changing `DATABASE_URL`)
- **SQLAlchemy** — ORM and database management
- **Pydantic** — data validation and serialization
- **APScheduler** — job scheduling during market hours
- **VADER** — sentiment analysis (Phase 2)
- **React** — dashboard frontend (Phase 5)

## Project Status

- [x] Phase 1: Data Ingestion (Finnhub news, yfinance market data, scheduler)
- [ ] Phase 2: Outlier Detection (Z-score spikes, sentiment filtering, cross-source)
- [ ] Phase 3: Event Classification (type categorization, direction inference)
- [ ] Phase 4: Signal Generation (call/put recommendations, strike/expiry)
- [ ] Phase 5: Dashboard (React frontend, performance tracking)

## License

MIT

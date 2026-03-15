import type {
  BacktestRun,
  ModelCheckpoint,
  PortfolioSnapshot,
  RegimeStatus,
  TradingMetrics,
  TradingSignal,
} from './types'

const BASE_URL = '/api/trading'

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export async function fetchTradingSignals(limit = 50): Promise<TradingSignal[]> {
  return fetchJSON(`/signals?limit=${limit}`)
}

export async function generateTradingSignals(payload: {
  ticker?: string
  tickers?: string[]
  timeframe?: string
}): Promise<{ generated: number; signals: TradingSignal[] }> {
  return fetchJSON('/signals/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function createBacktest(payload: Record<string, unknown>): Promise<{ id: string; status: string }> {
  return fetchJSON('/backtest', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchBacktest(runId: string): Promise<BacktestRun> {
  return fetchJSON(`/backtest/${runId}`)
}

export async function fetchTradingMetrics(): Promise<TradingMetrics> {
  return fetchJSON('/metrics')
}

export async function fetchPortfolio(): Promise<PortfolioSnapshot> {
  return fetchJSON('/portfolio')
}

export async function fetchModels(): Promise<ModelCheckpoint[]> {
  return fetchJSON('/models')
}

export async function fetchRegime(): Promise<RegimeStatus> {
  return fetchJSON('/regime')
}


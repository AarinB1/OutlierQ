import type {
  TradingSignal,
  BacktestResult,
  BacktestSummary,
  ModelInfo,
  PortfolioData,
  RegimeData,
  TradingMetrics,
} from './types'

const BASE = '/api/trading'

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

export const api = {
  getSignals: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return get<TradingSignal[]>(`${BASE}/signals${qs}`)
  },

  getSignal: (id: string) => get<TradingSignal>(`${BASE}/signals/${id}`),

  runBacktest: (config: {
    ticker: string
    strategy: string
    period?: string
    initial_capital?: number
    params?: Record<string, number>
  }) => post<BacktestResult>(`${BASE}/backtest`, config),

  getBacktest: (id: string) => get<BacktestResult>(`${BASE}/backtest/${id}`),
  getBacktests: () => get<BacktestSummary[]>(`${BASE}/backtests`),

  getPortfolio: () => get<PortfolioData>(`${BASE}/portfolio`),
  getModels: () => get<ModelInfo[]>(`${BASE}/models`),
  getRegime: () => get<RegimeData>(`${BASE}/regime`),
  getMetrics: () => get<TradingMetrics>(`${BASE}/metrics`),

  generateSignals: (tickers: string[], period?: string) =>
    post<{ generated: number; signals: TradingSignal[] }>(
      `${BASE}/generate-signals`,
      { tickers, period },
    ),
}

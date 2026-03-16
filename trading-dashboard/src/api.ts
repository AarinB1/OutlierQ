import type {
  BacktestRun,
  ModelCheckpoint,
  PortfolioSnapshot,
  RegimeStatus,
  TradingMetrics,
  TradingSignal,
  BacktestFullResult,
  BacktestSummary,
  PortfolioHistoryPoint,
  ClosedTrade,
  RegimeHistoryPoint,
  RiskSummary,
  RiskLimitsConfig,
  ModelVersionHistoryEntry,
  ModelTrainResult,
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

export async function fetchTradingSignals(params?: {
  ticker?: string
  direction?: string
  strategy?: string
  status?: string
  limit?: number
}): Promise<TradingSignal[]> {
  const sp = new URLSearchParams()
  if (params?.ticker) sp.set('ticker', params.ticker)
  if (params?.direction) sp.set('direction', params.direction)
  if (params?.strategy) sp.set('strategy', params.strategy)
  if (params?.status) sp.set('status', params.status)
  if (params?.limit) sp.set('limit', String(params.limit))
  const qs = sp.toString()
  return fetchJSON(`/signals${qs ? `?${qs}` : ''}`)
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

export async function runBacktest(config: Record<string, unknown>): Promise<BacktestFullResult> {
  return fetchJSON('/backtest', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export async function fetchBacktestList(): Promise<BacktestSummary[]> {
  return fetchJSON('/backtests')
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

export async function fetchPortfolioHistory(days: number = 30): Promise<PortfolioHistoryPoint[]> {
  return fetchJSON(`/portfolio/history?days=${days}`)
}

export async function fetchModels(): Promise<ModelCheckpoint[]> {
  return fetchJSON('/models')
}

export async function fetchRegime(): Promise<RegimeStatus> {
  return fetchJSON('/regime')
}

export async function fetchRegimeHistory(days: number = 90): Promise<RegimeHistoryPoint[]> {
  return fetchJSON(`/regime/history?days=${days}`)
}

export async function updateSignalStatus(id: string, status: string): Promise<TradingSignal> {
  return fetchJSON(`/signals/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function fetchRiskSummary(): Promise<RiskSummary> {
  return fetchJSON('/risk/summary')
}

export async function fetchRiskLimits(): Promise<RiskLimitsConfig> {
  return fetchJSON('/risk/limits')
}

export async function fetchExecutions(params?: {
  ticker?: string
  strategy?: string
  limit?: number
  offset?: number
}): Promise<ClosedTrade[]> {
  const sp = new URLSearchParams()
  if (params?.ticker) sp.set('ticker', params.ticker)
  if (params?.strategy) sp.set('strategy', params.strategy)
  if (params?.limit) sp.set('limit', String(params.limit))
  if (params?.offset) sp.set('offset', String(params.offset))
  const qs = sp.toString()
  return fetchJSON(`/executions${qs ? `?${qs}` : ''}`)
}

export async function fetchModelHistory(modelName: string): Promise<ModelVersionHistoryEntry[]> {
  return fetchJSON(`/models/${encodeURIComponent(modelName)}/history`)
}

export async function triggerModelTrain(payload: {
  model_type?: string
  ticker?: string
  period?: string
}): Promise<ModelTrainResult> {
  return fetchJSON('/models/train', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}


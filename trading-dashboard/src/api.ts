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
  StrategyDefaults,
  StrategyConfigSaved,
  TradingChartData,
  DemoStatus,
  WatchlistSaved,
  JournalEntry,
  JournalStats,
  TradingSettings,
  PerformanceAttribution,
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
  period?: string
  demo?: boolean
}): Promise<{ generated: number; signals: TradingSignal[] }> {
  const demoQuery = payload.demo ? '?demo=true' : ''
  return fetchJSON(`/generate-signals${demoQuery}`, {
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

export interface CompareBacktestResult {
  strategy: string
  metrics: BacktestFullResult['metrics']
  equity_curve: { dates: string[]; values: number[] }
  trades: import('./types').BacktestTrade[]
}

export async function compareBacktests(config: Record<string, unknown>): Promise<{
  ticker: string
  results: CompareBacktestResult[]
  benchmark_curve?: { dates: string[]; values: number[]; ticker: string }
}> {
  const res = await fetch(`${BASE_URL}/backtest/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error('Failed to run comparison')
  return res.json()
}

export function getBacktestExportUrl(backtestId: string, format: 'csv' | 'json' = 'csv'): string {
  return `${BASE_URL}/backtest/${encodeURIComponent(backtestId)}/export?format=${format}`
}

export async function exportBacktest(backtestId: string, format: 'csv' | 'json' = 'csv'): Promise<Blob> {
  const res = await fetch(getBacktestExportUrl(backtestId, format))
  if (!res.ok) throw new Error('Export failed')
  return res.blob()
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

export async function triggerModelTrain(modelType: string, ticker: string = 'SPY'): Promise<ModelTrainResult> {
  return fetchJSON('/models/train', {
    method: 'POST',
    body: JSON.stringify({ model_type: modelType, ticker }),
  })
}

export async function fetchStrategyDefaults(): Promise<StrategyDefaults> {
  return fetchJSON('/strategies/defaults')
}

export async function fetchStrategyConfigs(): Promise<StrategyConfigSaved[]> {
  return fetchJSON('/strategies/configs')
}

export async function saveStrategyConfig(config: Record<string, unknown>): Promise<{ id: string; name: string; status: string }> {
  return fetchJSON('/strategies/configs', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export async function deleteStrategyConfig(id: string): Promise<{ deleted: string }> {
  return fetchJSON(`/strategies/configs/${id}`, { method: 'DELETE' })
}

export async function fetchChartDataTrading(ticker: string, period: string = '6mo'): Promise<TradingChartData> {
  return fetchJSON(`/chart-data/${encodeURIComponent(ticker)}?period=${period}`)
}

export async function fetchDemoStatus(): Promise<DemoStatus> {
  return fetchJSON('/demo-status')
}

export async function toggleDemoStatus(demoMode?: boolean): Promise<DemoStatus> {
  return fetchJSON('/demo-toggle', {
    method: 'POST',
    body: JSON.stringify(typeof demoMode === 'boolean' ? { demo_mode: demoMode } : {}),
  })
}

export async function fetchWatchlists(): Promise<WatchlistSaved[]> {
  return fetchJSON('/watchlists')
}

export async function createWatchlist(payload: { name: string; tickers: string[] }): Promise<{ id: string; name: string }> {
  return fetchJSON('/watchlists', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateWatchlist(id: string, payload: { name?: string; tickers?: string[] }): Promise<{ id: string; name: string; tickers: string[] }> {
  return fetchJSON(`/watchlists/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteWatchlist(id: string): Promise<{ deleted: string }> {
  return fetchJSON(`/watchlists/${id}`, { method: 'DELETE' })
}

export async function scanWatchlist(id: string): Promise<{ generated: number; signal_ids: string[] }> {
  return fetchJSON(`/watchlists/${id}/scan`, { method: 'POST' })
}

export async function fetchJournalEntries(limit: number = 50, offset: number = 0): Promise<JournalEntry[]> {
  return fetchJSON(`/journal?limit=${limit}&offset=${offset}`)
}

export async function createJournalEntry(payload: Record<string, unknown>): Promise<{ id: string; status: string }> {
  return fetchJSON('/journal', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateJournalEntry(id: string, payload: Record<string, unknown>): Promise<{ id: string; status: string }> {
  return fetchJSON(`/journal/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteJournalEntry(id: string): Promise<{ deleted: string }> {
  return fetchJSON(`/journal/${id}`, { method: 'DELETE' })
}

export async function fetchJournalStats(): Promise<JournalStats> {
  return fetchJSON('/journal/stats')
}

export async function fetchTradingSettings(): Promise<TradingSettings> {
  return fetchJSON('/settings')
}

export async function updateTradingSettings(settings: Partial<TradingSettings>): Promise<{ status: string; keys: string[] }> {
  return fetchJSON('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export async function fetchPerformanceAttribution(): Promise<PerformanceAttribution> {
  return fetchJSON('/performance')
}

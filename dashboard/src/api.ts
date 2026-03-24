import type {
  Signal,
  EventData,
  AccuracyStats,
  ConfusionMatrix,
  TickerSummary,
  HealthStatus,
  AutopilotStatus,
  ActiveTickers,
  ScanResult,
  EvaluateResult,
  DiscoveryRecord,
  DiscoveryStats,
  DiscoverTriggerResult,
  PricePoint,
  CompanyInfo,
  KeyStats,
  ChartData,
  TickerFullSummary,
  OptionsFlowResult,
  TechnicalIndicators,
  EdgarResult,
  MlReadiness,
  MlStatus,
  MlTrainingMetrics,
} from './types';
import type {
  TradingSignal,
  BacktestFullResult,
  BacktestSummary,
  PortfolioHistoryPoint,
  ClosedTrade,
  MarketRegime,
  RegimeHistoryPoint,
  RiskSummary,
  RiskLimitsConfig,
  ModelCheckpointEnhanced,
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
} from './types';

const BASE_URL = '/api';
const SPARKLINE_TTL_MS = 5 * 60 * 1000;
const sparklineCache = new Map<string, { timestamp: number; values: number[] }>();

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchHealth(): Promise<HealthStatus> {
  return fetchJSON('/health');
}

export async function fetchStatus(): Promise<AutopilotStatus> {
  return fetchJSON('/status');
}

export async function fetchActiveTickers(): Promise<ActiveTickers> {
  return fetchJSON('/active-tickers');
}

export async function fetchSignals(params?: {
  ticker?: string;
  direction?: string;
  sort_by?: 'confidence' | 'time' | 'ticker';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}): Promise<Signal[]> {
  const sp = new URLSearchParams();
  if (params?.ticker) sp.set('ticker', params.ticker);
  if (params?.direction) sp.set('direction', params.direction);
  if (params?.sort_by) sp.set('sort_by', params.sort_by);
  if (params?.sort_order) sp.set('sort_order', params.sort_order);
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.offset) sp.set('offset', String(params.offset));
  const qs = sp.toString();
  return fetchJSON(`/signals${qs ? `?${qs}` : ''}`);
}

export async function fetchSignal(id: string): Promise<Signal> {
  return fetchJSON(`/signals/${id}`);
}

export function subscribeSignalStream(
  onSignal: (signal: Signal) => void,
  onError?: (error: Event) => void
): () => void {
  const eventSource = new EventSource('/api/stream');

  const handleSignal = (event: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(event.data) as Signal;
      onSignal(parsed);
    } catch {
      // Ignore malformed payloads and keep stream alive.
    }
  };

  eventSource.addEventListener('signal', handleSignal as EventListener);
  eventSource.onerror = (event) => {
    if (onError) onError(event);
  };

  return () => {
    eventSource.removeEventListener('signal', handleSignal as EventListener);
    eventSource.close();
  };
}

export async function fetchEvents(params?: {
  ticker?: string;
  event_type?: string;
  limit?: number;
  offset?: number;
}): Promise<EventData[]> {
  const sp = new URLSearchParams();
  if (params?.ticker) sp.set('ticker', params.ticker);
  if (params?.event_type) sp.set('event_type', params.event_type);
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.offset) sp.set('offset', String(params.offset));
  const qs = sp.toString();
  return fetchJSON(`/events${qs ? `?${qs}` : ''}`);
}

export async function fetchStats(): Promise<AccuracyStats> {
  return fetchJSON('/stats');
}

export async function fetchConfusion(): Promise<ConfusionMatrix> {
  return fetchJSON('/stats/confusion');
}

export async function fetchTickers(): Promise<TickerSummary[]> {
  return fetchJSON('/tickers');
}

export async function triggerEvaluate(): Promise<EvaluateResult> {
  return fetchJSON('/evaluate', { method: 'POST' });
}

export async function triggerScan(tickers: string[]): Promise<ScanResult> {
  return fetchJSON('/scan', {
    method: 'POST',
    body: JSON.stringify({ tickers }),
  });
}

export async function fetchDiscoveries(params?: {
  method?: string;
  limit?: number;
  offset?: number;
}): Promise<DiscoveryRecord[]> {
  const sp = new URLSearchParams();
  if (params?.method) sp.set('method', params.method);
  if (params?.limit != null) sp.set('limit', String(params.limit));
  if (params?.offset != null) sp.set('offset', String(params.offset));
  const qs = sp.toString();
  return fetchJSON(`/discoveries${qs ? `?${qs}` : ''}`);
}

export async function fetchDiscoveryStats(): Promise<DiscoveryStats> {
  return fetchJSON('/discoveries/stats');
}

export async function triggerDiscover(): Promise<DiscoverTriggerResult> {
  return fetchJSON('/discover', { method: 'POST' });
}

export async function fetchPriceHistory(
  ticker: string,
  period: string = '6mo',
  interval: string = '1d'
): Promise<PricePoint[]> {
  return fetchJSON(`/ticker/${ticker}/price-history?period=${period}&interval=${interval}`);
}

export async function fetchSparkline(ticker: string): Promise<number[]> {
  const cacheKey = ticker.toUpperCase();
  const cached = sparklineCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SPARKLINE_TTL_MS) {
    return cached.values;
  }

  try {
    const response = await fetchJSON<{ data: PricePoint[] } | PricePoint[]>(
      `/ticker/${cacheKey}/price-history?period=1mo&interval=1d`
    );
    const points = Array.isArray(response) ? response : (response.data ?? []);
    const values = points.map((point) => point.close);
    sparklineCache.set(cacheKey, { timestamp: Date.now(), values });
    return values;
  } catch {
    return [];
  }
}

export async function fetchIntraday(ticker: string): Promise<PricePoint[]> {
  return fetchJSON(`/ticker/${ticker}/intraday`);
}

export async function fetchCompanyInfo(ticker: string): Promise<CompanyInfo> {
  return fetchJSON(`/ticker/${ticker}/info`);
}

export async function fetchKeyStats(ticker: string): Promise<KeyStats> {
  return fetchJSON(`/ticker/${ticker}/stats`);
}

export async function fetchChartData(ticker: string, period: string = '6mo'): Promise<ChartData> {
  if (period === '1d') {
    const prices = await fetchJSON<PricePoint[]>(`/ticker/${ticker}/intraday`);
    return { prices, signals: [], events: [] };
  }
  return fetchJSON(`/ticker/${ticker}/chart-data?period=${period}`);
}

export async function fetchTickerSummary(ticker: string): Promise<TickerFullSummary> {
  return fetchJSON(`/ticker/${ticker}/summary`);
}

export async function fetchOptionsFlow(ticker: string): Promise<OptionsFlowResult> {
  return fetchJSON(`/ticker/${ticker}/options-flow`);
}

export async function fetchIndicators(ticker: string): Promise<TechnicalIndicators | null> {
  return fetchJSON(`/ticker/${ticker}/indicators`);
}

export async function fetchEdgar(ticker: string): Promise<EdgarResult | null> {
  return fetchJSON(`/ticker/${ticker}/edgar`);
}

export async function fetchMlReadiness(): Promise<MlReadiness> {
  return fetchJSON('/ml/readiness');
}

export async function fetchMlStatus(): Promise<MlStatus> {
  return fetchJSON('/ml/status');
}

export async function triggerMlTrain(): Promise<MlTrainingMetrics | { error: string; details?: unknown }> {
  return fetchJSON('/ml/train', { method: 'POST' });
}

// ── Prediction Markets API ───────────────────────────────────────

export async function fetchPredictionMarkets(platform?: string): Promise<{ markets: unknown[]; count: number }> {
  const sp = new URLSearchParams();
  if (platform) sp.set('platform', platform);
  const qs = sp.toString();
  return fetchJSON(`/predictions/markets${qs ? `?${qs}` : ''}`);
}

export async function scanPredictions(body: { platform?: string; min_edge?: number }): Promise<{ predictions: unknown[]; count: number }> {
  return fetchJSON('/predictions/scan', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchPredictionHistory(opts?: {
  limit?: number;
  platform?: string;
  resolved_only?: boolean;
}): Promise<{ predictions: unknown[]; count: number }> {
  const sp = new URLSearchParams();
  if (opts?.limit) sp.set('limit', String(opts.limit));
  if (opts?.platform) sp.set('platform', opts.platform);
  if (opts?.resolved_only) sp.set('resolved_only', 'true');
  const qs = sp.toString();
  return fetchJSON(`/predictions/history${qs ? `?${qs}` : ''}`);
}

export async function fetchPredictionStats(): Promise<Record<string, unknown>> {
  return fetchJSON('/predictions/stats');
}

export async function scanArbitrage(body?: {
  min_spread?: number;
  min_volume?: number;
  min_match_score?: number;
}): Promise<{ opportunities: unknown[]; count: number }> {
  return fetchJSON('/predictions/arbitrage/scan', {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}

export async function fetchArbitrageHistory(opts?: {
  status?: string;
  min_spread?: number;
  limit?: number;
}): Promise<{ opportunities: unknown[]; count: number }> {
  const sp = new URLSearchParams();
  if (opts?.status) sp.set('status', opts.status);
  if (opts?.min_spread) sp.set('min_spread', String(opts.min_spread));
  if (opts?.limit) sp.set('limit', String(opts.limit));
  const qs = sp.toString();
  return fetchJSON(`/predictions/arbitrage/history${qs ? `?${qs}` : ''}`);
}

export async function updateArbitrageStatus(
  id: number,
  status: string,
  notes?: string,
): Promise<{ id: number; status: string }> {
  return fetchJSON(`/predictions/arbitrage/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes }),
  });
}

// ── Trading API ──────────────────────────────────────────────────

const TRADING_BASE = '/api/trading';

export async function fetchTradingSignals(params?: {
  ticker?: string
  direction?: string
  strategy?: string
  status?: string
  limit?: number
}): Promise<TradingSignal[]> {
  const query = new URLSearchParams();
  if (params?.ticker) query.set('ticker', params.ticker);
  if (params?.direction) query.set('direction', params.direction);
  if (params?.strategy) query.set('strategy', params.strategy);
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', String(params.limit));
  const res = await fetch(`${TRADING_BASE}/signals?${query}`);
  if (!res.ok) throw new Error('Failed to fetch trading signals');
  return res.json();
}

export async function fetchTradingSignalById(id: string): Promise<TradingSignal> {
  const res = await fetch(`${TRADING_BASE}/signals/${id}`);
  if (!res.ok) throw new Error('Failed to fetch trading signal');
  return res.json();
}

export async function runBacktest(config: Record<string, unknown>): Promise<BacktestFullResult> {
  const res = await fetch(`${TRADING_BASE}/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to run backtest');
  return res.json();
}

export async function fetchBacktestList(): Promise<BacktestSummary[]> {
  const res = await fetch(`${TRADING_BASE}/backtests`);
  if (!res.ok) throw new Error('Failed to fetch backtest list');
  return res.json();
}

export async function fetchBacktestResult(id: string) {
  const res = await fetch(`${TRADING_BASE}/backtest/${id}`);
  if (!res.ok) throw new Error('Failed to fetch backtest result');
  return res.json();
}

export async function fetchPortfolio() {
  const res = await fetch(`${TRADING_BASE}/portfolio`);
  if (!res.ok) throw new Error('Failed to fetch portfolio');
  return res.json();
}

export async function fetchPortfolioHistory(days: number = 30): Promise<PortfolioHistoryPoint[]> {
  const res = await fetch(`${TRADING_BASE}/portfolio/history?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch portfolio history');
  return res.json();
}

export async function fetchTradingModels() {
  const res = await fetch(`${TRADING_BASE}/models`);
  if (!res.ok) throw new Error('Failed to fetch models');
  return res.json();
}

export async function fetchTradingModelsEnhanced(): Promise<ModelCheckpointEnhanced[]> {
  const res = await fetch(`${TRADING_BASE}/models`);
  if (!res.ok) throw new Error('Failed to fetch models');
  return res.json();
}

export async function fetchMarketRegime(): Promise<MarketRegime> {
  const res = await fetch(`${TRADING_BASE}/regime`);
  if (!res.ok) throw new Error('Failed to fetch regime');
  return res.json();
}

export async function fetchRegimeHistory(days: number = 30): Promise<RegimeHistoryPoint[]> {
  const res = await fetch(`${TRADING_BASE}/regime/history?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch regime history');
  return res.json();
}

export async function fetchTradingMetrics() {
  const res = await fetch(`${TRADING_BASE}/metrics`);
  if (!res.ok) throw new Error('Failed to fetch trading metrics');
  return res.json();
}

export async function fetchRiskSummary(): Promise<RiskSummary> {
  const res = await fetch(`${TRADING_BASE}/risk/summary`);
  if (!res.ok) throw new Error('Failed to fetch risk summary');
  return res.json();
}

export async function fetchRiskLimits(): Promise<RiskLimitsConfig> {
  const res = await fetch(`${TRADING_BASE}/risk/limits`);
  if (!res.ok) throw new Error('Failed to fetch risk limits');
  return res.json();
}

export async function generateTradingSignals(
  payload:
    | string[]
    | {
        ticker?: string
        tickers?: string[]
        timeframe?: string
        period?: string
        demo?: boolean
      },
) {
  const normalized = Array.isArray(payload) ? { tickers: payload } : payload
  const demoQuery = normalized.demo ? '?demo=true' : ''
  const res = await fetch(`${TRADING_BASE}/generate-signals${demoQuery}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalized),
  });
  if (!res.ok) throw new Error('Failed to generate trading signals');
  return res.json();
}

export async function fetchModelHistory(modelName: string): Promise<ModelVersionHistoryEntry[]> {
  const res = await fetch(`${TRADING_BASE}/models/${encodeURIComponent(modelName)}/history`);
  if (!res.ok) throw new Error('Failed to fetch model history');
  return res.json();
}

export async function triggerModelTrain(
  modelType: string,
  ticker: string = 'SPY',
): Promise<ModelTrainResult> {
  const res = await fetch(`${TRADING_BASE}/models/train`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_type: modelType, ticker }),
  });
  if (!res.ok) throw new Error('Failed to trigger model training');
  return res.json();
}

export async function updateSignalStatus(id: string, status: string): Promise<TradingSignal> {
  const res = await fetch(`${TRADING_BASE}/signals/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update signal status');
  return res.json();
}

export async function fetchExecutions(params?: {
  ticker?: string
  strategy?: string
  limit?: number
  offset?: number
}): Promise<ClosedTrade[]> {
  const query = new URLSearchParams();
  if (params?.ticker) query.set('ticker', params.ticker);
  if (params?.strategy) query.set('strategy', params.strategy);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const res = await fetch(`${TRADING_BASE}/executions?${query}`);
  if (!res.ok) throw new Error('Failed to fetch executions');
  return res.json();
}

// ── Sprint 4: Strategy Configs & Chart Data ─────────────────────

export async function fetchStrategyDefaults(): Promise<StrategyDefaults> {
  const res = await fetch(`${TRADING_BASE}/strategies/defaults`);
  if (!res.ok) throw new Error('Failed to fetch strategy defaults');
  return res.json();
}

export async function fetchStrategyConfigs(): Promise<StrategyConfigSaved[]> {
  const res = await fetch(`${TRADING_BASE}/strategies/configs`);
  if (!res.ok) throw new Error('Failed to fetch strategy configs');
  return res.json();
}

export async function saveStrategyConfig(config: Record<string, unknown>): Promise<{ id: string; name: string; status: string }> {
  const res = await fetch(`${TRADING_BASE}/strategies/configs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to save strategy config');
  return res.json();
}

export async function deleteStrategyConfig(id: string): Promise<{ deleted: string }> {
  const res = await fetch(`${TRADING_BASE}/strategies/configs/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete strategy config');
  return res.json();
}

export async function fetchChartDataTrading(ticker: string, period: string = '6mo'): Promise<TradingChartData> {
  const res = await fetch(`${TRADING_BASE}/chart-data/${encodeURIComponent(ticker)}?period=${period}`);
  if (!res.ok) throw new Error('Failed to fetch chart data');
  return res.json();
}

// ── Sprint 5: Watchlists & Journal ──────────────────────────────

export async function fetchDemoStatus(): Promise<DemoStatus> {
  const res = await fetch(`${TRADING_BASE}/demo-status`);
  if (!res.ok) throw new Error('Failed to fetch demo status');
  return res.json();
}

export async function toggleDemoStatus(demoMode?: boolean): Promise<DemoStatus> {
  const res = await fetch(`${TRADING_BASE}/demo-toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(typeof demoMode === 'boolean' ? { demo_mode: demoMode } : {}),
  });
  if (!res.ok) throw new Error('Failed to toggle demo mode');
  return res.json();
}

export async function fetchWatchlists(): Promise<WatchlistSaved[]> {
  const res = await fetch(`${TRADING_BASE}/watchlists`);
  if (!res.ok) throw new Error('Failed to fetch watchlists');
  return res.json();
}

export async function createWatchlist(payload: { name: string; tickers: string[] }): Promise<{ id: string; name: string }> {
  const res = await fetch(`${TRADING_BASE}/watchlists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create watchlist');
  return res.json();
}

export async function updateWatchlist(id: string, payload: { name?: string; tickers?: string[] }): Promise<{ id: string; name: string; tickers: string[] }> {
  const res = await fetch(`${TRADING_BASE}/watchlists/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update watchlist');
  return res.json();
}

export async function deleteWatchlist(id: string): Promise<{ deleted: string }> {
  const res = await fetch(`${TRADING_BASE}/watchlists/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete watchlist');
  return res.json();
}

export async function scanWatchlist(id: string): Promise<{ generated: number; signal_ids: string[] }> {
  const res = await fetch(`${TRADING_BASE}/watchlists/${id}/scan`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to scan watchlist');
  return res.json();
}

export async function fetchJournalEntries(limit: number = 50, offset: number = 0): Promise<JournalEntry[]> {
  const res = await fetch(`${TRADING_BASE}/journal?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error('Failed to fetch journal entries');
  return res.json();
}

export async function createJournalEntry(payload: Record<string, unknown>): Promise<{ id: string; status: string }> {
  const res = await fetch(`${TRADING_BASE}/journal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create journal entry');
  return res.json();
}

export async function updateJournalEntry(id: string, payload: Record<string, unknown>): Promise<{ id: string; status: string }> {
  const res = await fetch(`${TRADING_BASE}/journal/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update journal entry');
  return res.json();
}

export async function deleteJournalEntry(id: string): Promise<{ deleted: string }> {
  const res = await fetch(`${TRADING_BASE}/journal/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete journal entry');
  return res.json();
}

export async function fetchJournalStats(): Promise<JournalStats> {
  const res = await fetch(`${TRADING_BASE}/journal/stats`);
  if (!res.ok) throw new Error('Failed to fetch journal stats');
  return res.json();
}

// ── Sprint 6: Settings & Performance ────────────────────────────

export async function fetchTradingSettings(): Promise<TradingSettings> {
  const res = await fetch(`${TRADING_BASE}/settings`);
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function updateTradingSettings(settings: Partial<TradingSettings>): Promise<{ status: string; keys: string[] }> {
  const res = await fetch(`${TRADING_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to save settings');
  return res.json();
}

export async function fetchPerformanceAttribution(): Promise<PerformanceAttribution> {
  const res = await fetch(`${TRADING_BASE}/performance`);
  if (!res.ok) throw new Error('Failed to fetch performance data');
  return res.json();
}

// ── Portfolio Backtest, DSL, Replay, Greeks ──────────────────────

export async function runPortfolioBacktest(body: {
  tickers: string[];
  strategy?: string;
  period?: string;
  initial_capital?: number;
  max_positions?: number;
}): Promise<Record<string, unknown>> {
  const res = await fetch(`${TRADING_BASE}/backtest/portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Portfolio backtest failed');
  return res.json();
}

export async function runDSLBacktest(body: {
  rules: string;
  ticker?: string;
  period?: string;
  initial_capital?: number;
}): Promise<Record<string, unknown>> {
  const res = await fetch(`${TRADING_BASE}/backtest/dsl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('DSL backtest failed');
  return res.json();
}

export async function runTradeReplay(body: {
  ticker?: string;
  strategy?: string;
  period?: string;
}): Promise<Record<string, unknown>> {
  const res = await fetch(`${TRADING_BASE}/backtest/replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Trade replay failed');
  return res.json();
}

export async function computeGreeks(body: {
  spot_price: number;
  strike_price: number;
  time_to_expiry: number;
  volatility: number;
  risk_free_rate?: number;
  option_type?: string;
}): Promise<Record<string, number>> {
  const res = await fetch(`${TRADING_BASE}/options/greeks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Greeks computation failed');
  return res.json();
}

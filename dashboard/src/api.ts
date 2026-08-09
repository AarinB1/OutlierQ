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
  PortfolioState,
  GenerateSignalsResult,
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
import type {
  PredictionMarket,
  PredictionRecord,
  PredictionStats,
  ArbitrageOpportunity,
  DslBacktestResult,
  PortfolioBacktestResult,
} from './types';
import type { BacktestCompareResult } from './types';
import { DEMO_MODE } from './demo/demoConfig';

const BASE_URL = '/api';
const SPARKLINE_TTL_MS = 5 * 60 * 1000;
const sparklineCache = new Map<string, { timestamp: number; values: number[] }>();

/**
 * Single HTTP entry point for the whole dashboard.
 *
 * In demo mode (static GitHub Pages build) this delegates to the fixture
 * transport instead of touching the network — it and `subscribeSignalStream`
 * below are the only two places in the app that know demo mode exists. The
 * `DEMO_MODE` constant folds to `false` in a normal build, so Rollup drops the
 * branch and the dynamic import with it.
 *
 * `errorMessage` preserves the per-endpoint error text the trading calls used
 * to throw before they were normalised onto this function.
 */
async function fetchJSON<T>(url: string, init?: RequestInit, errorMessage?: string): Promise<T> {
  if (DEMO_MODE) {
    const { demoRequest } = await import('./demo/mockTransport');
    return demoRequest<T>(url, init);
  }
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    throw new Error(errorMessage ?? `API error: ${res.status} ${res.statusText}`);
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
  if (DEMO_MODE) {
    // Synthetic queue instead of SSE. The import is dynamic so the fixture
    // module never enters the normal bundle's graph.
    let stop: (() => void) | null = null;
    let cancelled = false;
    void import('./demo/stream').then(({ subscribeDemoSignalStream }) => {
      if (cancelled) return;
      stop = subscribeDemoSignalStream(onSignal);
    });
    return () => {
      cancelled = true;
      if (stop) stop();
    };
  }

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

export async function fetchPredictionMarkets(platform?: string): Promise<{ markets: PredictionMarket[]; count: number }> {
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
}): Promise<{ predictions: PredictionRecord[]; count: number }> {
  const sp = new URLSearchParams();
  if (opts?.limit) sp.set('limit', String(opts.limit));
  if (opts?.platform) sp.set('platform', opts.platform);
  if (opts?.resolved_only) sp.set('resolved_only', 'true');
  const qs = sp.toString();
  return fetchJSON(`/predictions/history${qs ? `?${qs}` : ''}`);
}

export async function fetchPredictionStats(): Promise<PredictionStats> {
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
}): Promise<{ opportunities: ArbitrageOpportunity[]; count: number }> {
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
//
// These used to call `fetch()` directly against `/api/trading`. They are
// normalised onto `fetchJSON` so demo mode has exactly one interception point;
// each call keeps its original URL, method, body and error text.

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
  return fetchJSON(`/trading/signals?${query}`, undefined, 'Failed to fetch trading signals');
}

export async function fetchTradingSignalById(id: string): Promise<TradingSignal> {
  return fetchJSON(`/trading/signals/${id}`, undefined, 'Failed to fetch trading signal');
}

export async function runBacktest(config: Record<string, unknown>): Promise<BacktestFullResult> {
  return fetchJSON('/trading/backtest', {
    method: 'POST',
    body: JSON.stringify(config),
  }, 'Failed to run backtest');
}

/** POST /api/trading/backtest/compare — several strategies, one ticker/window. */
export async function compareBacktests(config: Record<string, unknown>): Promise<BacktestCompareResult> {
  return fetchJSON('/trading/backtest/compare', {
    method: 'POST',
    body: JSON.stringify(config),
  }, 'Failed to run comparison');
}

export async function fetchBacktestList(): Promise<BacktestSummary[]> {
  return fetchJSON('/trading/backtests', undefined, 'Failed to fetch backtest list');
}

export async function fetchBacktestResult(id: string) {
  return fetchJSON<unknown>(`/trading/backtest/${id}`, undefined, 'Failed to fetch backtest result');
}

export async function fetchPortfolio(): Promise<PortfolioState> {
  return fetchJSON('/trading/portfolio', undefined, 'Failed to fetch portfolio');
}

export async function fetchPortfolioHistory(days: number = 30): Promise<PortfolioHistoryPoint[]> {
  return fetchJSON(`/trading/portfolio/history?days=${days}`, undefined, 'Failed to fetch portfolio history');
}

export async function fetchTradingModels() {
  return fetchJSON<unknown>('/trading/models', undefined, 'Failed to fetch models');
}

export async function fetchTradingModelsEnhanced(): Promise<ModelCheckpointEnhanced[]> {
  return fetchJSON('/trading/models', undefined, 'Failed to fetch models');
}

export async function fetchMarketRegime(): Promise<MarketRegime> {
  return fetchJSON('/trading/regime', undefined, 'Failed to fetch regime');
}

export async function fetchRegimeHistory(days: number = 30): Promise<RegimeHistoryPoint[]> {
  return fetchJSON(`/trading/regime/history?days=${days}`, undefined, 'Failed to fetch regime history');
}

export async function fetchTradingMetrics() {
  return fetchJSON<unknown>('/trading/metrics', undefined, 'Failed to fetch trading metrics');
}

export async function fetchRiskSummary(): Promise<RiskSummary> {
  return fetchJSON('/trading/risk/summary', undefined, 'Failed to fetch risk summary');
}

export async function fetchRiskLimits(): Promise<RiskLimitsConfig> {
  return fetchJSON('/trading/risk/limits', undefined, 'Failed to fetch risk limits');
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
): Promise<GenerateSignalsResult> {
  const normalized = Array.isArray(payload) ? { tickers: payload } : payload
  const demoQuery = normalized.demo ? '?demo=true' : ''
  return fetchJSON(`/trading/generate-signals${demoQuery}`, {
    method: 'POST',
    body: JSON.stringify(normalized),
  }, 'Failed to generate trading signals');
}

export async function fetchModelHistory(modelName: string): Promise<ModelVersionHistoryEntry[]> {
  return fetchJSON(
    `/trading/models/${encodeURIComponent(modelName)}/history`,
    undefined,
    'Failed to fetch model history',
  );
}

export async function triggerModelTrain(
  modelType: string,
  ticker: string = 'SPY',
): Promise<ModelTrainResult> {
  return fetchJSON('/trading/models/train', {
    method: 'POST',
    body: JSON.stringify({ model_type: modelType, ticker }),
  }, 'Failed to trigger model training');
}

export async function updateSignalStatus(id: string, status: string): Promise<TradingSignal> {
  return fetchJSON(`/trading/signals/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }, 'Failed to update signal status');
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
  return fetchJSON(`/trading/executions?${query}`, undefined, 'Failed to fetch executions');
}

// ── Sprint 4: Strategy Configs & Chart Data ─────────────────────

export async function fetchStrategyDefaults(): Promise<StrategyDefaults> {
  return fetchJSON('/trading/strategies/defaults', undefined, 'Failed to fetch strategy defaults');
}

export async function fetchStrategyConfigs(): Promise<StrategyConfigSaved[]> {
  return fetchJSON('/trading/strategies/configs', undefined, 'Failed to fetch strategy configs');
}

export async function saveStrategyConfig(config: Record<string, unknown>): Promise<{ id: string; name: string; status: string }> {
  return fetchJSON('/trading/strategies/configs', {
    method: 'POST',
    body: JSON.stringify(config),
  }, 'Failed to save strategy config');
}

export async function deleteStrategyConfig(id: string): Promise<{ deleted: string }> {
  return fetchJSON(`/trading/strategies/configs/${id}`, { method: 'DELETE' }, 'Failed to delete strategy config');
}

export async function fetchChartDataTrading(ticker: string, period: string = '6mo'): Promise<TradingChartData> {
  return fetchJSON(
    `/trading/chart-data/${encodeURIComponent(ticker)}?period=${period}`,
    undefined,
    'Failed to fetch chart data',
  );
}

// ── Sprint 5: Watchlists & Journal ──────────────────────────────

export async function fetchDemoStatus(): Promise<DemoStatus> {
  return fetchJSON('/trading/demo-status', undefined, 'Failed to fetch demo status');
}

export async function toggleDemoStatus(demoMode?: boolean): Promise<DemoStatus> {
  return fetchJSON('/trading/demo-toggle', {
    method: 'POST',
    body: JSON.stringify(typeof demoMode === 'boolean' ? { demo_mode: demoMode } : {}),
  }, 'Failed to toggle demo mode');
}

export async function fetchWatchlists(): Promise<WatchlistSaved[]> {
  return fetchJSON('/trading/watchlists', undefined, 'Failed to fetch watchlists');
}

export async function createWatchlist(payload: { name: string; tickers: string[] }): Promise<{ id: string; name: string }> {
  return fetchJSON('/trading/watchlists', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Failed to create watchlist');
}

export async function updateWatchlist(id: string, payload: { name?: string; tickers?: string[] }): Promise<{ id: string; name: string; tickers: string[] }> {
  return fetchJSON(`/trading/watchlists/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Failed to update watchlist');
}

export async function deleteWatchlist(id: string): Promise<{ deleted: string }> {
  return fetchJSON(`/trading/watchlists/${id}`, { method: 'DELETE' }, 'Failed to delete watchlist');
}

export async function scanWatchlist(id: string): Promise<{ generated: number; signal_ids: string[] }> {
  return fetchJSON(`/trading/watchlists/${id}/scan`, { method: 'POST' }, 'Failed to scan watchlist');
}

export async function fetchJournalEntries(limit: number = 50, offset: number = 0): Promise<JournalEntry[]> {
  return fetchJSON(`/trading/journal?limit=${limit}&offset=${offset}`, undefined, 'Failed to fetch journal entries');
}

export async function createJournalEntry(payload: Record<string, unknown>): Promise<{ id: string; status: string }> {
  return fetchJSON('/trading/journal', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Failed to create journal entry');
}

export async function updateJournalEntry(id: string, payload: Record<string, unknown>): Promise<{ id: string; status: string }> {
  return fetchJSON(`/trading/journal/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, 'Failed to update journal entry');
}

export async function deleteJournalEntry(id: string): Promise<{ deleted: string }> {
  return fetchJSON(`/trading/journal/${id}`, { method: 'DELETE' }, 'Failed to delete journal entry');
}

export async function fetchJournalStats(): Promise<JournalStats> {
  return fetchJSON('/trading/journal/stats', undefined, 'Failed to fetch journal stats');
}

// ── Sprint 6: Settings & Performance ────────────────────────────

export async function fetchTradingSettings(): Promise<TradingSettings> {
  return fetchJSON('/trading/settings', undefined, 'Failed to fetch settings');
}

export async function updateTradingSettings(settings: Partial<TradingSettings>): Promise<{ status: string; keys: string[] }> {
  return fetchJSON('/trading/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  }, 'Failed to save settings');
}

export async function fetchPerformanceAttribution(): Promise<PerformanceAttribution> {
  return fetchJSON('/trading/performance', undefined, 'Failed to fetch performance data');
}

// ── Portfolio Backtest, DSL, Replay, Greeks ──────────────────────

export async function runPortfolioBacktest(body: {
  tickers: string[];
  strategy?: string;
  period?: string;
  initial_capital?: number;
  max_positions?: number;
}): Promise<PortfolioBacktestResult> {
  return fetchJSON('/trading/backtest/portfolio', {
    method: 'POST',
    body: JSON.stringify(body),
  }, 'Portfolio backtest failed');
}

export async function runDSLBacktest(body: {
  rules: string;
  ticker?: string;
  period?: string;
  initial_capital?: number;
}): Promise<DslBacktestResult> {
  return fetchJSON('/trading/backtest/dsl', {
    method: 'POST',
    body: JSON.stringify(body),
  }, 'DSL backtest failed');
}

export async function runTradeReplay(body: {
  ticker?: string;
  strategy?: string;
  period?: string;
}): Promise<Record<string, unknown>> {
  return fetchJSON('/trading/backtest/replay', {
    method: 'POST',
    body: JSON.stringify(body),
  }, 'Trade replay failed');
}

export async function computeGreeks(body: {
  spot_price: number;
  strike_price: number;
  time_to_expiry: number;
  volatility: number;
  risk_free_rate?: number;
  option_type?: string;
}): Promise<Record<string, number>> {
  return fetchJSON('/trading/options/greeks', {
    method: 'POST',
    body: JSON.stringify(body),
  }, 'Greeks computation failed');
}

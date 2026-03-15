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
} from './types';

const BASE_URL = '/api';

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
  limit?: number;
  offset?: number;
}): Promise<Signal[]> {
  const sp = new URLSearchParams();
  if (params?.ticker) sp.set('ticker', params.ticker);
  if (params?.direction) sp.set('direction', params.direction);
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.offset) sp.set('offset', String(params.offset));
  const qs = sp.toString();
  return fetchJSON(`/signals${qs ? `?${qs}` : ''}`);
}

export async function fetchSignal(id: string): Promise<Signal> {
  return fetchJSON(`/signals/${id}`);
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

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

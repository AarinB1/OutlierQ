/**
 * URL -> fixture response router for the static demo.
 *
 * `api.ts:fetchJSON` delegates every request here when `DEMO_MODE` is on, so
 * the deployed bundle makes zero network calls. The URL passed in is exactly
 * what `fetchJSON` would have appended to `/api`, e.g. `/signals?limit=20` or
 * `/trading/backtest/compare`.
 *
 * The store below is mutable: POST actions (`/scan`, `/evaluate`, prediction
 * scans, arbitrage status, ML train) and the synthetic signal stream write to
 * it, and every aggregate is recomputed from the primitives on each request by
 * the reduction functions in `fixtures.ts`. That keeps the numbers internally
 * consistent after a mutation instead of drifting away from the records.
 */

import {
  ACTION_LATENCY_MAX_MS,
  ACTION_LATENCY_MIN_MS,
  DEMO_SEED,
  LATENCY_MAX_MS,
  LATENCY_MIN_MS,
} from './demoConfig'
import { createRng } from './rng'
import {
  ANCHOR_TODAY_ISO,
  DATASET,
  EVENT_DIRECTION,
  buildComparison,
  buildBacktestRun,
  chartDataFor,
  companyInfoFor,
  computeAccuracyStats,
  computeConfusion,
  computeDiscoveryStats,
  computeMlReadiness,
  computeMlTrainingMetrics,
  computePredictionStats,
  computeTickerSummaries,
  edgarFor,
  indicatorsFor,
  intradayFor,
  keyStatsFor,
  optionsFlowFor,
  seriesFor,
} from './fixtures'
import type {
  ArbitrageOpportunity,
  AutopilotStatus,
  DemoStatus,
  EvaluateResult,
  EventData,
  HealthStatus,
  MlStatus,
  MlTrainingMetrics,
  PredictionRecord,
  ScanResult,
  Signal,
  TickerFullSummary,
  TradingSettings,
} from '../types'

// ── Mutable session store ───────────────────────────────────────────────────

interface DemoStore {
  signals: Signal[]
  events: EventData[]
  predictions: PredictionRecord[]
  arbitrage: ArbitrageOpportunity[]
  mlTrained: boolean
  mlMetrics: MlTrainingMetrics | null
  settings: TradingSettings
  scanCount: number
}

export const store: DemoStore = {
  signals: [...DATASET.signals],
  events: [...DATASET.events],
  predictions: [...DATASET.predictionRecords],
  arbitrage: [...DATASET.arbitrage],
  mlTrained: false,
  mlMetrics: null,
  settings: {
    notifications_enabled: true,
    notify_on_signal: true,
    notify_on_backtest_complete: true,
    notify_on_drawdown_breach: true,
    min_signal_confidence: 0.55,
    drawdown_alert_threshold: 12,
    email: null,
    watched_tickers_only: false,
  },
  scanCount: 0,
}

/** Called by demo/stream.ts so streamed signals also show up on refetch. */
export function ingestStreamSignal(signal: Signal): void {
  if (store.signals.some((s) => s.id === signal.id)) return
  store.signals = [signal, ...store.signals]
  if (signal.event && !store.events.some((e) => e.id === signal.event!.id)) {
    store.events = [signal.event, ...store.events]
  }
}

// ── Latency ─────────────────────────────────────────────────────────────────

const latencyRng = createRng(DEMO_SEED ^ 0x5eed)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function jitter(min: number, max: number): number {
  return Math.round(latencyRng.float(min, max))
}

// ── Request parsing ─────────────────────────────────────────────────────────

interface ParsedRequest {
  path: string
  params: URLSearchParams
  method: string
  body: Record<string, unknown>
}

function parse(url: string, init?: RequestInit): ParsedRequest {
  const [rawPath, query = ''] = url.split('?')
  let body: Record<string, unknown> = {}
  if (typeof init?.body === 'string' && init.body.length > 0) {
    try {
      const parsed = JSON.parse(init.body)
      if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
    } catch {
      body = {}
    }
  }
  return {
    path: rawPath.replace(/\/+$/, '') || '/',
    params: new URLSearchParams(query),
    method: (init?.method ?? 'GET').toUpperCase(),
    body,
  }
}

function num(value: string | null, fallback: number): number {
  const parsed = value == null ? NaN : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function page<T>(items: T[], params: URLSearchParams, defaultLimit: number): T[] {
  const limit = num(params.get('limit'), defaultLimit)
  const offset = num(params.get('offset'), 0)
  return items.slice(offset, offset + limit)
}

// ── Handlers ────────────────────────────────────────────────────────────────

function health(): HealthStatus {
  const newest = store.signals.reduce<string | null>((acc, s) => {
    if (!s.created_at) return acc
    return acc == null || s.created_at > acc ? s.created_at : acc
  }, null)
  return {
    status: 'ok',
    signals_count: store.signals.length,
    events_count: store.events.length,
    last_scan: newest,
  }
}

function autopilotStatus(): AutopilotStatus {
  const today = store.signals.filter((s) => (s.created_at ?? '').startsWith(ANCHOR_TODAY_ISO))
  const discoveriesToday = store.signals.filter(
    (s) => s.discovery_source != null && (s.created_at ?? '').startsWith(ANCHOR_TODAY_ISO),
  )
  return {
    is_autopilot_running: false,
    tickers_monitored: computeTickerSummaries(store.signals).length,
    signals_today: today.length,
    discoveries_today: discoveriesToday.length,
    last_scan: health().last_scan,
    next_scan: null,
  }
}

function listSignals(params: URLSearchParams): Signal[] {
  const ticker = params.get('ticker')?.toUpperCase()
  const direction = params.get('direction')
  const sortBy = params.get('sort_by') ?? 'time'
  const desc = (params.get('sort_order') ?? 'desc') === 'desc'

  let rows = store.signals
  if (ticker) rows = rows.filter((s) => s.ticker === ticker)
  if (direction) rows = rows.filter((s) => s.direction === direction)

  // Mirrors the backend: sort_by=time orders by suggested_expiry.
  const keyed = [...rows].sort((a, b) => {
    if (sortBy === 'confidence') return a.confidence - b.confidence
    if (sortBy === 'ticker') return a.ticker.localeCompare(b.ticker)
    return String(a.suggested_expiry ?? '').localeCompare(String(b.suggested_expiry ?? ''))
  })
  if (desc) keyed.reverse()
  return page(keyed, params, 50)
}

function listEvents(params: URLSearchParams): EventData[] {
  const ticker = params.get('ticker')?.toUpperCase()
  const eventType = params.get('event_type')
  let rows = store.events
  if (ticker) rows = rows.filter((e) => e.ticker === ticker)
  if (eventType) rows = rows.filter((e) => e.event_type === eventType)
  const sorted = [...rows].sort((a, b) => String(b.detected_at ?? '').localeCompare(String(a.detected_at ?? '')))
  return page(sorted, params, 50)
}

function mlStatus(): MlStatus {
  const readiness = computeMlReadiness(store.signals)
  const metrics = store.mlTrained ? store.mlMetrics ?? computeMlTrainingMetrics(store.signals) : {}
  const importances = store.mlTrained
    ? (store.mlMetrics?.feature_importances_top10 ?? [])
    : []
  const evaluated = store.signals.filter((s) => s.outcome != null).slice(0, 20)
  return {
    is_trained: store.mlTrained,
    training_metrics: metrics,
    feature_importances: importances,
    training_data_size: store.mlTrained ? (store.mlMetrics?.n_samples ?? 0) : 0,
    readiness_check: readiness,
    recent_comparison: store.mlTrained
      ? {
          n_evaluated: evaluated.length,
          model_accuracy: store.mlMetrics?.accuracy ?? 0,
          keyword_accuracy: Math.max(0, (store.mlMetrics?.accuracy ?? 0) - 0.07),
          comparison: evaluated.map((s) => ({
            ticker: s.ticker,
            keyword_prediction: s.direction === 'call' ? 'bullish' : 'bearish',
            ml_prediction: s.confidence >= 0.62 ? 'win' : 'no_win',
            actual_outcome: s.outcome ?? 'pending',
          })),
        }
      : { n_evaluated: 0, model_accuracy: 0, keyword_accuracy: 0, comparison: [] },
  }
}

/**
 * Evaluates up to `MAX_PER_CALL` pending signals whose expiry has passed —
 * so the Accuracy page's calibrator progress bar visibly advances without
 * jumping straight past the activation threshold.
 */
function evaluatePending(): EvaluateResult {
  const MAX_PER_CALL = 3
  const rng = createRng(DEMO_SEED ^ (0xa11 + store.signals.length))
  // Mirror FeedbackTracker.evaluate_all_pending: only signals whose
  // suggested_expiry is on or before the build-anchor "today".
  const candidates = store.signals
    .filter(
      (s) =>
        s.outcome == null &&
        s.suggested_expiry != null &&
        s.suggested_expiry <= ANCHOR_TODAY_ISO,
    )
    .slice(-MAX_PER_CALL)
  const results: EvaluateResult['results'] = []
  for (const signal of candidates) {
    const roll = rng.next()
    const outcome = roll < 0.55 ? 'profit' : roll < 0.9 ? 'loss' : 'expired'
    const pnl = outcome === 'profit'
      ? Math.round(rng.float(8, 110) * 100) / 100
      : outcome === 'loss'
        ? Math.round(-rng.float(6, 95) * 100) / 100
        : -100
    signal.outcome = outcome
    signal.outcome_pnl = pnl
    results.push({
      signal_id: signal.id,
      ticker: signal.ticker,
      direction: signal.direction,
      outcome,
      estimated_pnl: pnl,
    })
  }
  store.signals = [...store.signals]
  return { evaluated: results.length, results }
}

/** Generates new pending signals for the requested tickers and stores them. */
function runScan(tickers: string[]): ScanResult {
  store.scanCount += 1
  const rng = createRng(DEMO_SEED ^ (0x5ca0 + store.scanCount))
  const known = tickers.map((t) => t.toUpperCase()).filter((t) => t.length > 0)
  const generated: ScanResult['signals'] = []

  known.forEach((ticker, i) => {
    // Not every scanned ticker produces a signal — that is the honest outcome.
    if (!rng.chance(0.6)) return
    const series = seriesFor(ticker)
    const spot = series[series.length - 1].close
    const isCall = rng.chance(0.55)
    const eventType = 'options_flow'
    const eventId = `evt-scan-${store.scanCount}-${i + 1}`
    // Anchor to the fixture calendar so overlays land on existing price bars.
    const detectedAt = new Date(
      Date.parse(`${ANCHOR_TODAY_ISO}T00:00:00Z`) + (15 * 60 + store.scanCount * 3 + i) * 60_000,
    ).toISOString()
    const event: EventData = {
      id: eventId,
      ticker,
      event_type: eventType,
      direction: EVENT_DIRECTION[eventType] ?? 'neutral',
      confidence: Math.round(rng.clustered(0.45, 0.9) * 100) / 100,
      detected_at: detectedAt,
      article_ids: [`art-${eventId}-1`],
      metadata: {
        common_themes: ['Unusual near-dated volume', 'Volume/open-interest ratio elevated'],
        source_count: 1,
      } as EventData['metadata'],
    }
    const confidence = Math.round(rng.clustered(0.42, 0.88) * 100) / 100
    const strike = Math.round(spot * (isCall ? 1.03 : 0.97) * 100) / 100
    const expiry = new Date(Date.parse(`${ANCHOR_TODAY_ISO}T00:00:00Z`) + rng.int(10, 32) * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const signal: Signal = {
      id: `sig-scan-${store.scanCount}-${i + 1}`,
      ticker,
      direction: isCall ? 'call' : 'put',
      suggested_strike: strike,
      suggested_expiry: expiry,
      confidence,
      raw_confidence: confidence,
      outcome: null,
      outcome_pnl: null,
      entry_price: spot,
      entry_iv: Math.round(rng.float(0.22, 0.85) * 100) / 100,
      created_at: detectedAt,
      event_id: eventId,
      event,
      exploratory: false,
      discovery_source: null,
      simulation_enhanced: false,
    }
    store.events = [event, ...store.events]
    store.signals = [signal, ...store.signals]
    generated.push({
      ticker,
      direction: signal.direction,
      strike,
      expiry,
      confidence,
    })
  })

  return { signals_generated: generated.length, signals: generated }
}

function tickerSummary(ticker: string): TickerFullSummary {
  const chart = chartDataFor(ticker, '6mo', store.signals, store.events)
  return {
    info: companyInfoFor(ticker),
    stats: keyStatsFor(ticker),
    signals: chart.signals,
    events: chart.events,
  }
}

function scanPredictionMarkets(minEdge: number): { predictions: unknown[]; count: number } {
  const matched = store.predictions.filter((p) => p.edge >= minEdge && p.actual_outcome == null)
  return { predictions: matched, count: matched.length }
}

// ── Router ──────────────────────────────────────────────────────────────────

class DemoTransportError extends Error {}

function route(req: ParsedRequest): unknown {
  const { path, params, method, body } = req

  // ── Options / core ──
  if (path === '/health') return health()
  if (path === '/status') return autopilotStatus()
  if (path === '/active-tickers') {
    const tickers = computeTickerSummaries(store.signals).map((t) => t.ticker)
    return {
      tickers,
      by_source: {
        manual: tickers.slice(0, 5),
        news_scanner: tickers.slice(5, 7),
        volume_screener: tickers.slice(7),
        both: [],
      },
      count: tickers.length,
    }
  }
  if (path === '/signals') return listSignals(params)
  if (path.startsWith('/signals/')) {
    const id = path.slice('/signals/'.length)
    const found = store.signals.find((s) => s.id === id)
    if (!found) throw new DemoTransportError(`Demo fixture has no signal ${id}`)
    return found
  }
  if (path === '/events') return listEvents(params)
  if (path === '/stats') return computeAccuracyStats(store.signals, store.events)
  if (path === '/stats/confusion') return computeConfusion(store.signals)
  if (path === '/tickers') return computeTickerSummaries(store.signals)
  if (path === '/evaluate' && method === 'POST') return evaluatePending()
  if (path === '/scan' && method === 'POST') {
    const tickers = Array.isArray(body.tickers) ? (body.tickers as string[]) : []
    return runScan(tickers)
  }

  // ── Discovery ──
  if (path === '/discoveries') return page(DATASET.discoveries, params, 50)
  if (path === '/discoveries/stats') return computeDiscoveryStats(DATASET.discoveries)
  if (path === '/discover' && method === 'POST') {
    return {
      discovered: DATASET.discoveries.length,
      tickers: DATASET.discoveries.map((d) => ({
        ticker: d.ticker,
        discovery_methods: [d.discovery_method],
        discovery_confidence: d.discovery_confidence,
        mention_count: d.mention_count,
        volume_ratio: d.volume_ratio,
        sample_headlines: d.sample_headlines,
      })),
    }
  }

  // ── ML ──
  if (path === '/ml/readiness') return computeMlReadiness(store.signals)
  if (path === '/ml/status') return mlStatus()
  if (path === '/ml/train' && method === 'POST') {
    const readiness = computeMlReadiness(store.signals)
    if (!readiness.ready_to_train) {
      return { error: 'Not enough labeled data', details: readiness }
    }
    store.mlMetrics = computeMlTrainingMetrics(store.signals)
    store.mlTrained = true
    return store.mlMetrics
  }

  // ── Per-ticker ──
  const tickerMatch = /^\/ticker\/([^/]+)\/(.+)$/.exec(path)
  if (tickerMatch) {
    const ticker = decodeURIComponent(tickerMatch[1]).toUpperCase()
    const leaf = tickerMatch[2]
    if (leaf.startsWith('price-history')) {
      const period = params.get('period') ?? '6mo'
      return chartDataFor(ticker, period, store.signals, store.events).prices
    }
    if (leaf === 'intraday') return intradayFor(ticker)
    if (leaf === 'info') return companyInfoFor(ticker)
    if (leaf === 'stats') return keyStatsFor(ticker)
    if (leaf.startsWith('chart-data')) {
      return chartDataFor(ticker, params.get('period') ?? '6mo', store.signals, store.events)
    }
    if (leaf === 'summary') return tickerSummary(ticker)
    if (leaf === 'options-flow') return optionsFlowFor(ticker, store.events)
    if (leaf === 'indicators') return indicatorsFor(ticker)
    if (leaf === 'edgar') return edgarFor(ticker, store.events)
  }

  // ── Prediction markets ──
  if (path === '/predictions/markets') {
    const platform = params.get('platform')
    const markets = platform
      ? DATASET.predictionMarkets.filter((m) => m.platform === platform)
      : DATASET.predictionMarkets
    return { markets, count: markets.length }
  }
  if (path === '/predictions/scan' && method === 'POST') {
    return scanPredictionMarkets(typeof body.min_edge === 'number' ? body.min_edge : 0.03)
  }
  if (path === '/predictions/history') {
    const platform = params.get('platform')
    const resolvedOnly = params.get('resolved_only') === 'true'
    let rows = store.predictions
    if (platform) rows = rows.filter((p) => p.platform === platform)
    if (resolvedOnly) rows = rows.filter((p) => p.actual_outcome != null)
    const limit = num(params.get('limit'), 50)
    const sliced = [...rows]
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
      .slice(0, limit)
    return { predictions: sliced, count: sliced.length }
  }
  if (path === '/predictions/stats') return computePredictionStats(store.predictions)
  if (path === '/predictions/arbitrage/scan' && method === 'POST') {
    const minSpread = typeof body.min_spread === 'number' ? body.min_spread : 0
    const found = store.arbitrage.filter((o) => o.spread >= minSpread && o.status === 'open')
    return { opportunities: found, count: found.length }
  }
  if (path === '/predictions/arbitrage/history') {
    const status = params.get('status')
    const minSpread = num(params.get('min_spread'), 0)
    let rows = store.arbitrage.filter((o) => o.spread >= minSpread)
    if (status) rows = rows.filter((o) => o.status === status)
    const limit = num(params.get('limit'), 50)
    const sliced = rows.slice(0, limit)
    return { opportunities: sliced, count: sliced.length }
  }
  const arbStatus = /^\/predictions\/arbitrage\/(\d+)\/status$/.exec(path)
  if (arbStatus && method === 'PATCH') {
    const id = Number(arbStatus[1])
    const nextStatus = typeof body.status === 'string' ? body.status : 'open'
    store.arbitrage = store.arbitrage.map((o) => (o.id === id ? { ...o, status: nextStatus } : o))
    return { id, status: nextStatus }
  }

  // ── Trading (only the curated Backtest page and the settings context) ──
  if (path === '/trading/settings' && method === 'GET') return store.settings
  if (path === '/trading/settings' && method === 'PUT') {
    store.settings = { ...store.settings, ...(body as Partial<TradingSettings>) }
    return { status: 'ok', keys: Object.keys(body) }
  }
  if (path === '/trading/demo-status') return { demo_mode: true } satisfies DemoStatus
  if (path === '/trading/demo-toggle' && method === 'POST') {
    return { demo_mode: true } satisfies DemoStatus
  }
  if (path === '/trading/backtests') return DATASET.backtests.map((b) => b.summary)
  if (path === '/trading/backtest' && method === 'POST') {
    const strategy = String(body.strategy ?? body.strategy_name ?? 'momentum')
    const ticker = String(body.ticker ?? 'SPY').toUpperCase()
    const capital = typeof body.initial_capital === 'number' ? body.initial_capital : 100_000
    const benchmark = typeof body.benchmark === 'string' && body.benchmark ? body.benchmark.toUpperCase() : 'SPY'
    const prebuilt = DATASET.backtests.find(
      (b) => b.summary.strategy_name === strategy && b.summary.ticker === ticker && capital === 100_000 && benchmark === 'SPY',
    )
    return prebuilt ? prebuilt.result : buildBacktestRun(strategy, ticker, capital, benchmark)
  }
  if (path === '/trading/backtest/compare' && method === 'POST') {
    const strategies = Array.isArray(body.strategies) && body.strategies.length > 0
      ? (body.strategies as string[])
      : ['momentum', 'mean_reversion', 'breakout']
    const ticker = String(body.ticker ?? 'SPY').toUpperCase()
    const capital = typeof body.initial_capital === 'number' ? body.initial_capital : 100_000
    const benchmark = typeof body.benchmark === 'string' && body.benchmark ? body.benchmark.toUpperCase() : 'SPY'
    return buildComparison(strategies, ticker, capital, benchmark)
  }
  const backtestById = /^\/trading\/backtest\/([^/]+)$/.exec(path)
  if (backtestById && method === 'GET') {
    const found = DATASET.backtests.find((b) => b.summary.id === backtestById[1])
    if (!found) throw new DemoTransportError(`Demo fixture has no backtest ${backtestById[1]}`)
    return found.result
  }

  throw new DemoTransportError(
    `${method} ${path} is not part of the static demo. The full API surface runs locally against FastAPI.`,
  )
}

// ── Entry point used by api.ts ──────────────────────────────────────────────

export async function demoRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const req = parse(url, init)
  const isAction = req.method !== 'GET'
  await sleep(
    isAction
      ? jitter(ACTION_LATENCY_MIN_MS, ACTION_LATENCY_MAX_MS)
      : jitter(LATENCY_MIN_MS, LATENCY_MAX_MS),
  )
  return route(req) as T
}

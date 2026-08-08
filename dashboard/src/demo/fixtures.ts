/**
 * Synthetic dataset for the static GitHub Pages demo.
 *
 * Rules this file is written to (see the workstream brief):
 *  1. Deterministic  — one fixed seed, no `Date.now()` anywhere. Identical
 *                      output for a given build timestamp.
 *  2. Consistent     — every aggregate (accuracy stats, confusion matrix,
 *                      ticker summaries, prediction stats, backtest metrics)
 *                      is *computed* from the primitive records by the
 *                      reduction functions at the bottom of this file. No
 *                      hand-written totals.
 *  3. Referential    — every `Signal.event_id` points at an event in `events`;
 *                      every ticker with a signal has a price series and a
 *                      `TickerSummary`; signal markers land on dates that
 *                      exist in the series.
 *  4. Build-anchored — all dates are offsets from the injected build time, so
 *                      the demo always looks recent and never drifts between
 *                      page loads or shows a future date.
 *  5. Plausible      — losses, expired-flat and pending outcomes all present;
 *                      confidence is clustered, not uniform.
 *
 * Editorial constraint (hard): no fabricated negative news about real
 * companies. Real large-cap tickers only ever carry bullish/neutral event
 * types with generic, non-specific themes. Every bearish event type
 * (`scandal`, `legal`, `earnings_miss`, `recall`) is attached to an invented
 * company with a ticker verified as unlisted (NRVX, ALTQ, TQNX).
 */

import { BUILD_TIME, DEMO_SEED, SIGNAL_WINDOW_DAYS } from './demoConfig'
import { createRng, hashSeed, type Rng } from './rng'
import type {
  AccuracyStats,
  ArbitrageOpportunity,
  BacktestCompareResult,
  BacktestFullResult,
  BacktestSummary,
  BacktestTrade,
  ChartData,
  CompanyInfo,
  ConfusionMatrix,
  DiscoveryRecord,
  DiscoveryStats,
  EdgarResult,
  EventData,
  EventOverlay,
  KeyStats,
  MlReadiness,
  MlTrainingMetrics,
  OptionsFlowContract,
  OptionsFlowResult,
  PredictionMarket,
  PredictionRecord,
  PredictionStats,
  PricePoint,
  Signal,
  SignalOverlay,
  TechnicalIndicators,
  TickerSummary,
} from '../types'

// ── Event taxonomy (mirrors src/classification/event_classifier.py) ─────────

export const EVENT_DIRECTION: Record<string, string> = {
  scandal: 'bearish',
  legal: 'bearish',
  earnings_miss: 'bearish',
  recall: 'bearish',
  fda_approval: 'bullish',
  breakthrough: 'bullish',
  major_contract: 'bullish',
  earnings_beat: 'bullish',
  options_flow: 'neutral',
  edgar: 'neutral',
  other: 'neutral',
}

const BEARISH_TYPES = ['scandal', 'legal', 'earnings_miss', 'recall'] as const
const BULLISH_TYPES = ['fda_approval', 'breakthrough', 'major_contract', 'earnings_beat'] as const
const NEUTRAL_TYPES = ['options_flow', 'edgar', 'other'] as const

// ── Universe ────────────────────────────────────────────────────────────────

interface TickerSpec {
  ticker: string
  name: string
  sector: string
  industry: string
  /** Real listed symbol — restricted to bullish/neutral generic themes. */
  real: boolean
  basePrice: number
  /** Annualised drift and volatility for the GBM path. */
  drift: number
  vol: number
  sharesOut: number
  strikeStep: number
  ivBase: number
}

const UNIVERSE: TickerSpec[] = [
  { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology', industry: 'Consumer Electronics', real: true, basePrice: 214.4, drift: 0.11, vol: 0.24, sharesOut: 15.2e9, strikeStep: 5, ivBase: 0.26 },
  { ticker: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', industry: 'Software — Infrastructure', real: true, basePrice: 402.8, drift: 0.13, vol: 0.22, sharesOut: 7.43e9, strikeStep: 10, ivBase: 0.24 },
  { ticker: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', industry: 'Semiconductors', real: true, basePrice: 121.6, drift: 0.24, vol: 0.48, sharesOut: 24.4e9, strikeStep: 5, ivBase: 0.47 },
  { ticker: 'AMD', name: 'Advanced Micro Devices, Inc.', sector: 'Technology', industry: 'Semiconductors', real: true, basePrice: 148.2, drift: 0.07, vol: 0.44, sharesOut: 1.62e9, strikeStep: 5, ivBase: 0.45 },
  { ticker: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financial Services', industry: 'Banks — Diversified', real: true, basePrice: 206.9, drift: 0.09, vol: 0.19, sharesOut: 2.86e9, strikeStep: 5, ivBase: 0.21 },
  // Invented companies. Symbols checked against listed-symbol lookups before use.
  { ticker: 'NRVX', name: 'Nervexa Therapeutics (fictional)', sector: 'Healthcare', industry: 'Biotechnology', real: false, basePrice: 23.85, drift: -0.06, vol: 0.72, sharesOut: 8.4e7, strikeStep: 1, ivBase: 0.86 },
  { ticker: 'ALTQ', name: 'Altiq Systems (fictional)', sector: 'Technology', industry: 'Software — Application', real: false, basePrice: 61.3, drift: 0.02, vol: 0.55, sharesOut: 1.9e8, strikeStep: 2.5, ivBase: 0.61 },
  { ticker: 'TQNX', name: 'Tenquix Industrial (fictional)', sector: 'Industrials', industry: 'Specialty Machinery', real: false, basePrice: 46.75, drift: -0.03, vol: 0.41, sharesOut: 2.6e8, strikeStep: 2.5, ivBase: 0.48 },
]

export const DEMO_TICKERS: readonly string[] = UNIVERSE.map((t) => t.ticker)
const SPEC_BY_TICKER = new Map(UNIVERSE.map((t) => [t.ticker, t]))

/** Benchmark / backtest underlying. Not part of the signal universe. */
const BENCHMARK_SPEC: TickerSpec = {
  ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', sector: 'Financial Services', industry: 'Exchange Traded Fund',
  real: true, basePrice: 548.2, drift: 0.09, vol: 0.14, sharesOut: 9.4e8, strikeStep: 5, ivBase: 0.15,
}

// ── Generic, non-defamatory theme copy ──────────────────────────────────────
// Real tickers: bullish/neutral only, nothing company-specific or accusatory.

const THEMES_REAL: Record<string, string[]> = {
  earnings_beat: ['Quarterly results exceed consensus', 'Margin expansion noted', 'Segment revenue ahead of guidance'],
  major_contract: ['Multi-year supply agreement disclosed', 'Enterprise deal expands existing partnership', 'Backlog commentary improves'],
  breakthrough: ['Product roadmap accelerated', 'Efficiency gains demonstrated at conference', 'Next-generation platform detailed'],
  options_flow: ['Unusual near-dated call volume', 'Volume/open-interest ratio elevated', 'Skew flattening into expiry'],
  edgar: ['8-K filed — material agreement', 'Buyback authorization increased', 'Form 4 cluster from routine vesting'],
  other: ['Analyst upgrade cites margin expansion', 'Guidance raised on segment strength', 'Index rebalance flow expected'],
}

// Fictional tickers only. These are invented companies, so directional and
// negative framing is safe here.
const THEMES_FICTIONAL: Record<string, string[]> = {
  scandal: ['Internal review disclosed', 'Executive departure announced', 'Governance questions raised by holder'],
  legal: ['Civil complaint filed by competitor', 'Regulatory inquiry acknowledged', 'Patent dispute escalates'],
  earnings_miss: ['Quarterly revenue below consensus', 'Full-year outlook lowered', 'Bookings growth decelerates'],
  recall: ['Voluntary field action announced', 'Batch inspection expanded', 'Service advisory issued to customers'],
  fda_approval: ['Regulatory clearance granted for lead program', 'Label expansion accepted for review'],
  breakthrough: ['Trial readout beats primary endpoint', 'Pilot deployment reaches scale'],
  major_contract: ['Framework agreement signed with distributor', 'Government purchase order received'],
  earnings_beat: ['Quarterly results exceed consensus', 'Gross margin improves sequentially'],
  options_flow: ['Unusual put volume clustered near-dated', 'Open interest builds at lower strikes'],
  edgar: ['8-K filed — results of operations', 'Insider filings above baseline'],
  other: ['Coverage initiated with neutral rating', 'Liquidity commentary in filing'],
}

// ── Calendar helpers (all UTC, all anchored to build time) ───────────────────

const BUILD_DATE = new Date(BUILD_TIME)
/** UTC midnight of the build day — the fixture's "today". */
const ANCHOR_MS = Date.UTC(
  BUILD_DATE.getUTCFullYear(),
  BUILD_DATE.getUTCMonth(),
  BUILD_DATE.getUTCDate(),
)
const DAY_MS = 86_400_000

export const ANCHOR_TODAY_ISO = new Date(ANCHOR_MS).toISOString().slice(0, 10)

function isWeekend(ms: number): boolean {
  const day = new Date(ms).getUTCDay()
  return day === 0 || day === 6
}

/** Trading days (weekdays; exchange holidays ignored) ending at the anchor. */
function tradingDaysEndingAtAnchor(count: number): string[] {
  const out: string[] = []
  let cursor = ANCHOR_MS
  while (out.length < count) {
    if (!isWeekend(cursor)) out.push(new Date(cursor).toISOString().slice(0, 10))
    cursor -= DAY_MS
  }
  return out.reverse()
}

/** Most recent trading day at or before `daysAgo` calendar days back. */
function tradingDayAgo(daysAgo: number): string {
  let cursor = ANCHOR_MS - daysAgo * DAY_MS
  while (isWeekend(cursor)) cursor -= DAY_MS
  return new Date(cursor).toISOString().slice(0, 10)
}

function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

function atTime(iso: string, hours: number, minutes: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + (hours * 60 + minutes) * 60_000).toISOString()
}

const TRADING_DAYS_2Y = 504
/** Shared calendar: every price series uses the same trading-day grid. */
const CALENDAR = tradingDaysEndingAtAnchor(TRADING_DAYS_2Y)
const CALENDAR_INDEX = new Map(CALENDAR.map((d, i) => [d, i]))

export const PERIOD_BARS: Record<string, number> = {
  '1w': 5,
  '5d': 5,
  '1mo': 21,
  '3mo': 63,
  '6mo': 126,
  '1y': 252,
  '2y': TRADING_DAYS_2Y,
  max: TRADING_DAYS_2Y,
}

// ── Price series (geometric Brownian motion) ────────────────────────────────

function buildSeries(spec: TickerSpec): PricePoint[] {
  const rng = createRng(hashSeed(`series:${spec.ticker}`) ^ DEMO_SEED)
  const dt = 1 / 252
  const points: PricePoint[] = []
  // Walk backwards from basePrice as "today", so the last close is the base.
  const closes: number[] = new Array(CALENDAR.length)
  closes[closes.length - 1] = spec.basePrice
  for (let i = closes.length - 2; i >= 0; i -= 1) {
    const shock = (spec.drift - (spec.vol * spec.vol) / 2) * dt + spec.vol * Math.sqrt(dt) * rng.normal()
    closes[i] = closes[i + 1] / Math.exp(shock)
  }

  for (let i = 0; i < CALENDAR.length; i += 1) {
    const close = closes[i]
    const prev = i > 0 ? closes[i - 1] : close
    const open = prev * (1 + rng.float(-0.004, 0.004))
    const spread = close * spec.vol * rng.float(0.004, 0.02)
    const high = Math.max(open, close) + spread * rng.next()
    const low = Math.min(open, close) - spread * rng.next()
    const baseVolume = (spec.sharesOut / 1000) * rng.float(0.6, 1.6)
    points.push({
      date: CALENDAR[i],
      open: round2(open),
      high: round2(high),
      low: round2(Math.max(low, 0.5)),
      close: round2(close),
      volume: Math.round(baseVolume),
    })
  }
  return points
}

const seriesCache = new Map<string, PricePoint[]>()

/**
 * Price series for any symbol. Known tickers use their curated spec; anything
 * the user types (e.g. into the backtest ticker box) gets a stable synthetic
 * spec derived from a hash of the symbol, so the demo never has to fail.
 */
export function seriesFor(ticker: string): PricePoint[] {
  const key = ticker.toUpperCase()
  const cached = seriesCache.get(key)
  if (cached) return cached
  let spec = SPEC_BY_TICKER.get(key)
  if (!spec && key === BENCHMARK_SPEC.ticker) spec = BENCHMARK_SPEC
  if (!spec) {
    const rng = createRng(hashSeed(`spec:${key}`))
    spec = {
      ticker: key,
      name: `${key} (synthetic demo series)`,
      sector: 'Unclassified',
      industry: 'Unclassified',
      real: false,
      basePrice: round2(rng.float(18, 340)),
      drift: rng.float(-0.05, 0.18),
      vol: rng.float(0.18, 0.6),
      sharesOut: rng.float(8e7, 4e9),
      strikeStep: 5,
      ivBase: rng.float(0.22, 0.7),
    }
  }
  const built = buildSeries(spec)
  seriesCache.set(key, built)
  return built
}

function closeOn(ticker: string, iso: string): number {
  const series = seriesFor(ticker)
  const idx = CALENDAR_INDEX.get(iso)
  if (idx != null && series[idx]) return series[idx].close
  // Fall back to the nearest earlier bar.
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i].date <= iso) return series[i].close
  }
  return series[series.length - 1].close
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function roundToStep(v: number, step: number): number {
  return Math.round(v / step) * step
}

// ── Event generation ────────────────────────────────────────────────────────

const rng: Rng = createRng(DEMO_SEED)

function themesFor(spec: TickerSpec, eventType: string, r: Rng): string[] {
  const pool = spec.real ? THEMES_REAL[eventType] : THEMES_FICTIONAL[eventType]
  const safePool = pool ?? THEMES_FICTIONAL.other
  const shuffled = r.shuffle(safePool)
  return shuffled.slice(0, Math.min(safePool.length, r.int(2, 3)))
}

function optionsFlowMeta(spec: TickerSpec, dateIso: string, bias: 'bullish' | 'bearish' | 'neutral', r: Rng) {
  const spot = closeOn(spec.ticker, dateIso)
  const isCallSide = bias !== 'bearish'
  const strike = roundToStep(spot * (isCallSide ? r.float(1.01, 1.09) : r.float(0.91, 0.99)), spec.strikeStep)
  const expiry = addDaysIso(dateIso, r.int(9, 45))
  const contracts: OptionsFlowContract[] = Array.from({ length: r.int(3, 5) }).map((_, i) => {
    const type: 'call' | 'put' = isCallSide ? 'call' : 'put'
    const k = roundToStep(strike * (1 + (i - 1) * 0.02), spec.strikeStep)
    const volume = r.int(1800, 42000)
    const oi = r.int(300, 12000)
    return {
      contract_symbol: `${spec.ticker}${expiry.replace(/-/g, '').slice(2)}${type === 'call' ? 'C' : 'P'}${String(Math.round(k * 1000)).padStart(8, '0')}`,
      type,
      strike: round2(k),
      expiry,
      volume,
      open_interest: oi,
      volume_oi_ratio: round2(volume / Math.max(oi, 1)),
      implied_volatility: round2(spec.ivBase * r.float(0.85, 1.4)),
      otm_pct: round2(Math.abs(k - spot) / spot * 100),
      days_to_expiry: Math.round((Date.parse(expiry) - Date.parse(dateIso)) / DAY_MS),
      conviction_score: round2(r.clustered(0.42, 0.94)),
      flags: r.shuffle(['high_vol_oi', 'near_dated', 'otm_sweep', 'repeat_strike']).slice(0, r.int(1, 2)),
    }
  })
  const maxConviction = contracts.reduce((m, c) => Math.max(m, c.conviction_score), 0)
  return {
    direction: bias,
    unusual_contract_count: contracts.length,
    max_conviction: maxConviction,
    dominant_expiry: expiry,
    dominant_strike: round2(strike),
    top_contracts: contracts,
    put_call_ratio: round2(isCallSide ? r.float(0.28, 0.75) : r.float(1.3, 3.4)),
  }
}

function edgarMeta(spec: TickerSpec, dateIso: string, direction: string, r: Rng): EdgarResult {
  const filingCount = r.int(1, 3)
  const bearish = direction === 'bearish'
  const items = bearish ? ['2.06', '8.01'] : ['1.01', '2.01']
  return {
    ticker: spec.ticker,
    significant_findings: true,
    combined_direction: (bearish ? 'bearish' : direction === 'bullish' ? 'bullish' : 'neutral'),
    combined_severity: round2(r.float(0.25, 0.78)),
    has_significant_filing: true,
    has_unusual_insider_activity: r.chance(0.4),
    summary: bearish
      ? `${filingCount} recent 8-K filing(s) with items ${items.join(', ')}; insider filings above baseline.`
      : `${filingCount} recent 8-K filing(s) with items ${items.join(', ')}; no unusual insider pattern.`,
    '8k_analysis': {
      total_filings: filingCount + r.int(2, 8),
      recent_8k_count: filingCount,
      highly_bearish_count: bearish ? r.int(0, 1) : 0,
      moderately_bearish_count: bearish ? r.int(1, 2) : 0,
      potentially_bullish_count: bearish ? 0 : r.int(1, 2),
      most_significant_item: items[0],
      direction: bearish ? 'bearish' : direction === 'bullish' ? 'bullish' : 'neutral',
      severity: round2(r.float(0.2, 0.7)),
      filings: Array.from({ length: filingCount }).map((_, i) => ({
        filing_date: addDaysIso(dateIso, -i),
        form_type: '8-K',
        description: bearish ? 'Material impairments / other events' : 'Entry into a material definitive agreement',
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${spec.ticker}`,
        items: items.slice(0, r.int(1, items.length)),
      })),
    },
    insider_analysis: {
      total_form4s: r.int(0, 9),
      days_covered: 7,
      filings_per_day: round2(r.float(0, 1.4)),
      is_unusual: r.chance(0.35),
      activity_level: r.weighted(['high', 'moderate', 'normal'] as const, [1, 2, 5]),
    },
  }
}

function technicalContext(spec: TickerSpec, r: Rng) {
  const rsi = round2(r.clustered(22, 82))
  return {
    rsi: rsi,
    rsi_signal: (rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral') as 'overbought' | 'oversold' | 'neutral',
    bollinger_pct_b: round2(r.clustered(-0.1, 1.15)),
    bollinger_signal: r.pick(['upper_band_touch', 'mid_band', 'lower_band_touch', 'squeeze']),
    atr_pct: round2(spec.vol * r.float(4, 9)),
    macd_signal: r.pick(['bullish_cross', 'bearish_cross', 'bullish_trend', 'bearish_trend', 'flat']),
    relative_volume: round2(r.clustered(0.6, 3.4)),
    adjustments_applied: r.shuffle(['rsi_extreme', 'volume_confirmation', 'atr_widened_strike', 'macd_alignment']).slice(0, r.int(0, 2)),
  }
}

interface BuiltEvent {
  event: EventData
  spec: TickerSpec
  dateIso: string
}

let eventCounter = 0

function makeEvent(spec: TickerSpec, eventType: string, dateIso: string, hour: number, r: Rng): BuiltEvent {
  eventCounter += 1
  const direction = EVENT_DIRECTION[eventType] ?? 'neutral'
  const articleCount = eventType === 'options_flow' || eventType === 'edgar' ? r.int(0, 2) : r.int(1, 4)
  const metadata: Record<string, unknown> = {
    common_themes: themesFor(spec, eventType, r),
    source_count: articleCount,
  }
  if (eventType === 'options_flow') {
    metadata.options_flow = optionsFlowMeta(spec, dateIso, direction === 'bearish' ? 'bearish' : direction === 'bullish' ? 'bullish' : r.pick(['bullish', 'bearish'] as const), r)
  }
  if (eventType === 'edgar') {
    metadata.edgar_data = edgarMeta(spec, dateIso, direction, r)
  }
  if (r.chance(0.55)) {
    metadata.technical_context = technicalContext(spec, r)
    metadata.technical_notes = [`ATR-adjusted strike offset applied for ${spec.ticker}`]
  }
  const id = `evt-${String(eventCounter).padStart(3, '0')}`
  return {
    spec,
    dateIso,
    event: {
      id,
      ticker: spec.ticker,
      event_type: eventType,
      direction,
      confidence: round2(r.clustered(0.41, 0.94)),
      detected_at: atTime(dateIso, hour, r.int(0, 59)),
      article_ids: articleCount > 0
        ? Array.from({ length: articleCount }).map((_, i) => `art-${id}-${i + 1}`)
        : null,
      metadata: metadata as EventData['metadata'],
    },
  }
}

function allowedTypes(spec: TickerSpec): { types: string[]; weights: number[] } {
  if (spec.real) {
    return {
      types: [...BULLISH_TYPES.filter((t) => t !== 'fda_approval'), ...NEUTRAL_TYPES],
      weights: [4, 3, 4, 5, 3, 2],
    }
  }
  return {
    types: [...BEARISH_TYPES, ...BULLISH_TYPES, ...NEUTRAL_TYPES],
    weights: [3, 3, 4, 2, 2, 2, 2, 2, 3, 2, 1],
  }
}

// ── Signals ─────────────────────────────────────────────────────────────────

const SIGNAL_COUNT = 40
const PENDING_COUNT = 6
/** Deliberately below the calibrator's MIN_SAMPLES (40) — see B6. */
const EVALUATED_COUNT = SIGNAL_COUNT - PENDING_COUNT // 34
const TARGET_WINS = 20
const TARGET_LOSSES = 11
const TARGET_EXPIRED = 3
if (TARGET_WINS + TARGET_LOSSES + TARGET_EXPIRED !== EVALUATED_COUNT) {
  throw new Error('demo fixture outcome plan must cover every evaluated signal exactly once')
}

interface BuiltDataset {
  events: EventData[]
  signals: Signal[]
  streamQueue: Signal[]
  discoveries: DiscoveryRecord[]
}

function pickTickerForSlot(index: number, r: Rng): TickerSpec {
  // First pass round-robins so every ticker is guaranteed a signal (and hence
  // a TickerSummary and a chart series), then it goes weighted-random.
  if (index < UNIVERSE.length) return UNIVERSE[index]
  return r.weighted(UNIVERSE, [5, 4, 6, 4, 3, 4, 4, 3])
}

function buildSignalsAndEvents(r: Rng): BuiltDataset {
  const events: EventData[] = []
  const signals: Signal[] = []

  // Evaluated slots: 88 -> 27 days ago (old enough for a past expiry).
  // Pending slots: 20 -> 2 days ago (expiry still in the future).
  const evaluatedDaysAgo = Array.from({ length: EVALUATED_COUNT }, (_, i) =>
    Math.round(88 - (i * (88 - 27)) / (EVALUATED_COUNT - 1)))
  const pendingDaysAgo = [20, 17, 13, 9, 5, 2]
  const slotDaysAgo = [...evaluatedDaysAgo, ...pendingDaysAgo]

  interface Draft {
    signal: Signal
    isPending: boolean
  }
  const drafts: Draft[] = []

  slotDaysAgo.forEach((daysAgo, index) => {
    const spec = pickTickerForSlot(index, r)
    const { types, weights } = allowedTypes(spec)
    const eventType = r.weighted(types, weights)
    const dateIso = tradingDayAgo(daysAgo)
    const built = makeEvent(spec, eventType, dateIso, r.int(9, 15), r)
    events.push(built.event)

    const eventDirection = built.event.direction
    const direction = eventDirection === 'bullish'
      ? 'call'
      : eventDirection === 'bearish'
        ? 'put'
        : r.chance(0.55) ? 'call' : 'put'

    const entryPrice = closeOn(spec.ticker, dateIso)
    const strike = roundToStep(
      entryPrice * (direction === 'call' ? r.float(1.01, 1.07) : r.float(0.93, 0.99)),
      spec.strikeStep,
    )
    // Confidence: clustered around ~0.63, nudged by the event's own score.
    const confidence = round2(Math.min(0.94, Math.max(0.34,
      r.clustered(0.38, 0.86) * 0.75 + built.event.confidence * 0.3)))

    const isPending = index >= EVALUATED_COUNT
    const expiry = isPending
      ? addDaysIso(ANCHOR_TODAY_ISO, r.int(8, 30))
      : addDaysIso(dateIso, r.int(14, 24))

    drafts.push({
      isPending,
      signal: {
        id: `sig-${String(index + 1).padStart(3, '0')}`,
        ticker: spec.ticker,
        direction,
        suggested_strike: round2(strike),
        suggested_expiry: expiry,
        confidence,
        // The calibrator is inert below MIN_SAMPLES, so stored confidence is
        // the raw model confidence — mirrored here for auditability.
        raw_confidence: confidence,
        outcome: null,
        outcome_pnl: null,
        entry_price: round2(entryPrice),
        entry_iv: round2(spec.ivBase * r.float(0.8, 1.3)),
        created_at: atTime(dateIso, r.int(10, 15), r.int(0, 59)),
        event_id: built.event.id,
        event: built.event,
        exploratory: r.chance(0.15),
        discovery_source: r.chance(0.3) ? r.pick(['news_scanner', 'volume_screener']) : null,
        simulation_enhanced: r.chance(0.22),
      },
    })
  })

  // ── Outcome assignment ───────────────────────────────────────────────────
  // Exact target counts (so the aggregate reductions land on 20/11/3 of 34)
  // but ordered by a confidence-weighted score, so higher-confidence signals
  // win more often than lower-confidence ones instead of winning at random.
  const evaluated = drafts.filter((d) => !d.isPending)
  const scored = evaluated
    .map((d) => ({ draft: d, score: d.signal.confidence * 0.7 + r.next() * 0.3 }))
    .sort((a, b) => b.score - a.score)

  scored.forEach((entry, rank) => {
    const s = entry.draft.signal
    if (rank < TARGET_WINS) {
      s.outcome = 'profit'
      // Long options multi-bag; skew the distribution rather than centring it.
      s.outcome_pnl = round2(r.clustered(6, 95, 2) * (r.chance(0.16) ? r.float(1.6, 2.8) : 1))
    } else if (rank < TARGET_WINS + TARGET_LOSSES) {
      s.outcome = 'loss'
      s.outcome_pnl = round2(-r.clustered(6, 96, 2))
    } else {
      s.outcome = 'expired'
      // The real evaluator pins worthless expiries to exactly -100%.
      s.outcome_pnl = -100
    }
  })

  drafts.forEach((d) => signals.push(d.signal))

  // ── Events with no signal (the engine filters most events out) ───────────
  const STANDALONE_EVENTS = 12
  for (let i = 0; i < STANDALONE_EVENTS; i += 1) {
    const spec = r.weighted(UNIVERSE, [5, 4, 5, 4, 4, 3, 3, 3])
    const { types, weights } = allowedTypes(spec)
    const dateIso = tradingDayAgo(r.int(1, SIGNAL_WINDOW_DAYS))
    events.push(makeEvent(spec, r.weighted(types, weights), dateIso, r.int(9, 16), r).event)
  }

  // ── Pre-authored live-stream queue (8 signals + their events) ────────────
  const streamQueue: Signal[] = []
  for (let i = 0; i < 8; i += 1) {
    const spec = r.weighted(UNIVERSE, [4, 3, 5, 4, 3, 4, 4, 3])
    const { types, weights } = allowedTypes(spec)
    const dateIso = ANCHOR_TODAY_ISO
    const built = makeEvent(spec, r.weighted(types, weights), dateIso, 13 + Math.floor(i / 4), r)
    events.push(built.event)

    const eventDirection = built.event.direction
    const direction = eventDirection === 'bullish'
      ? 'call'
      : eventDirection === 'bearish'
        ? 'put'
        : r.chance(0.5) ? 'call' : 'put'
    const entryPrice = closeOn(spec.ticker, dateIso)
    const confidence = round2(Math.min(0.93, Math.max(0.36, r.clustered(0.42, 0.88) * 0.8 + built.event.confidence * 0.25)))
    streamQueue.push({
      id: `sig-live-${String(i + 1).padStart(2, '0')}`,
      ticker: spec.ticker,
      direction,
      suggested_strike: round2(roundToStep(
        entryPrice * (direction === 'call' ? r.float(1.01, 1.06) : r.float(0.94, 0.99)),
        spec.strikeStep,
      )),
      suggested_expiry: addDaysIso(ANCHOR_TODAY_ISO, r.int(10, 34)),
      confidence,
      raw_confidence: confidence,
      outcome: null,
      outcome_pnl: null,
      entry_price: round2(entryPrice),
      entry_iv: round2(spec.ivBase * r.float(0.85, 1.25)),
      created_at: atTime(ANCHOR_TODAY_ISO, 15, 5 + i * 3),
      event_id: built.event.id,
      event: built.event,
      exploratory: r.chance(0.2),
      discovery_source: r.chance(0.4) ? r.pick(['news_scanner', 'volume_screener']) : null,
      simulation_enhanced: r.chance(0.25),
    })
  }

  events.sort((a, b) => String(b.detected_at).localeCompare(String(a.detected_at)))

  // ── Discovery records (ticker discovery feed) ────────────────────────────
  const discoveries: DiscoveryRecord[] = UNIVERSE.flatMap((spec, i) => {
    const count = i < 4 ? 2 : 1
    return Array.from({ length: count }).map((_, k) => {
      const method = r.pick(['news_scanner', 'volume_screener', 'both'])
      const dateIso = tradingDayAgo(r.int(1, 30))
      return {
        id: `disc-${spec.ticker}-${k + 1}`,
        ticker: spec.ticker,
        discovery_method: method,
        discovery_confidence: round2(r.clustered(0.4, 0.92)),
        mention_count: method === 'volume_screener' ? null : r.int(3, 41),
        volume_ratio: method === 'news_scanner' ? null : round2(r.float(1.6, 5.2)),
        sample_headlines: themesFor(spec, spec.real ? 'other' : 'earnings_miss', r),
        discovered_at: atTime(dateIso, r.int(8, 17), r.int(0, 59)),
        scanned: r.chance(0.8),
        signal_generated: r.chance(0.45),
      }
    })
  })

  return { events, signals, streamQueue, discoveries }
}

// ── Prediction markets ──────────────────────────────────────────────────────

interface PredictionSeed {
  platform: 'polymarket' | 'kalshi'
  question: string
  category: string
  tickers: string
  eventType: string
}

const PREDICTION_SEEDS: PredictionSeed[] = [
  { platform: 'polymarket', question: 'Will AAPL close above $240 on the last trading day of the quarter?', category: 'Equities', tickers: 'AAPL', eventType: 'earnings_beat' },
  { platform: 'kalshi', question: 'Will MSFT report quarterly revenue above consensus?', category: 'Earnings', tickers: 'MSFT', eventType: 'earnings_beat' },
  { platform: 'polymarket', question: 'Will NVDA trade above $150 before quarter end?', category: 'Equities', tickers: 'NVDA', eventType: 'options_flow' },
  { platform: 'kalshi', question: 'Will AMD announce a new data-center design win this quarter?', category: 'Technology', tickers: 'AMD', eventType: 'major_contract' },
  { platform: 'polymarket', question: 'Will JPM raise its quarterly dividend this year?', category: 'Financials', tickers: 'JPM', eventType: 'other' },
  { platform: 'kalshi', question: 'Will Nervexa Therapeutics (NRVX) receive regulatory clearance for its lead program?', category: 'Healthcare', tickers: 'NRVX', eventType: 'fda_approval' },
  { platform: 'polymarket', question: 'Will Nervexa Therapeutics (NRVX) report topline data before year end?', category: 'Healthcare', tickers: 'NRVX', eventType: 'breakthrough' },
  { platform: 'kalshi', question: 'Will Altiq Systems (ALTQ) lower its full-year outlook?', category: 'Technology', tickers: 'ALTQ', eventType: 'earnings_miss' },
  { platform: 'polymarket', question: 'Will Altiq Systems (ALTQ) close a framework agreement with a top-10 distributor?', category: 'Technology', tickers: 'ALTQ', eventType: 'major_contract' },
  { platform: 'kalshi', question: 'Will Tenquix Industrial (TQNX) expand its voluntary field action?', category: 'Industrials', tickers: 'TQNX', eventType: 'recall' },
  { platform: 'polymarket', question: 'Will Tenquix Industrial (TQNX) beat consensus on gross margin?', category: 'Industrials', tickers: 'TQNX', eventType: 'earnings_beat' },
  { platform: 'kalshi', question: 'Will the S&P 500 end the month higher than it started?', category: 'Indices', tickers: 'SPY', eventType: 'other' },
  { platform: 'polymarket', question: 'Will realised 30-day volatility on NVDA exceed 45%?', category: 'Volatility', tickers: 'NVDA', eventType: 'options_flow' },
  { platform: 'kalshi', question: 'Will semiconductor sector breadth improve month over month?', category: 'Technology', tickers: 'NVDA,AMD', eventType: 'other' },
]

function buildPredictionMarkets(r: Rng): PredictionMarket[] {
  return PREDICTION_SEEDS.map((seed, i) => {
    const yes = round2(r.clustered(0.08, 0.92))
    return {
      platform: seed.platform,
      market_id: `${seed.platform === 'polymarket' ? 'pm' : 'ka'}-${String(i + 1).padStart(3, '0')}`,
      slug: seed.question.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60),
      question: seed.question,
      category: seed.category,
      yes_price: yes,
      no_price: round2(1 - yes),
      volume: Math.round(r.float(45_000, 4_200_000)),
      resolution_date: addDaysIso(ANCHOR_TODAY_ISO, r.int(9, 120)),
      status: 'open',
    }
  })
}

function buildPredictionRecords(markets: PredictionMarket[], r: Rng): PredictionRecord[] {
  const records: PredictionRecord[] = []
  const COUNT = 25
  for (let i = 0; i < COUNT; i += 1) {
    const seedIndex = i % PREDICTION_SEEDS.length
    const seed = PREDICTION_SEEDS[seedIndex]
    const market = markets[seedIndex]
    const marketProb = round2(Math.min(0.95, Math.max(0.05, market.yes_price + r.float(-0.12, 0.12))))
    const edge = round2(r.clustered(-0.09, 0.24))
    const predictedProb = round2(Math.min(0.98, Math.max(0.02, marketProb + edge)))
    const predictedOutcome = predictedProb >= 0.5 ? 'yes' : 'no'
    // ~60% of records are resolved; the rest are still open (no outcome yet).
    const resolved = i < 15
    const createdIso = tradingDayAgo(r.int(4, SIGNAL_WINDOW_DAYS))
    let isCorrect: boolean | null = null
    let actual: string | null = null
    let pnl: number | null = null
    if (resolved) {
      // Correctness correlates with edge — bigger disagreement with the market
      // is right more often, but not always.
      isCorrect = r.next() < Math.min(0.82, Math.max(0.32, 0.5 + edge * 1.4))
      actual = isCorrect ? predictedOutcome : predictedOutcome === 'yes' ? 'no' : 'yes'
      const entry = predictedOutcome === 'yes' ? marketProb : round2(1 - marketProb)
      pnl = round2(isCorrect ? 1 - entry : -entry)
    }
    const simEnhanced = r.chance(0.36)
    records.push({
      id: i + 1,
      market_id: market.market_id,
      platform: seed.platform,
      question: seed.question,
      predicted_outcome: predictedOutcome,
      predicted_probability: predictedProb,
      market_probability: marketProb,
      edge,
      confidence: round2(r.clustered(0.42, 0.9)),
      matched_event_type: seed.eventType,
      matched_tickers: seed.tickers,
      actual_outcome: actual,
      is_correct: isCorrect,
      pnl_if_bet: pnl,
      simulation_enhanced: simEnhanced,
      sim_estimated_probability: simEnhanced ? round2(Math.min(0.97, Math.max(0.03, predictedProb + r.float(-0.08, 0.08)))) : null,
      sim_consensus_strength: simEnhanced ? round2(r.clustered(0.35, 0.95)) : null,
      created_at: atTime(createdIso, r.int(9, 17), r.int(0, 59)),
      resolved_at: resolved ? atTime(addDaysIso(createdIso, r.int(3, 25)), 21, 0) : null,
    })
  }
  return records
}

function buildArbitrage(r: Rng): ArbitrageOpportunity[] {
  const pairs: { poly: string; kalshi: string }[] = [
    { poly: 'Will AAPL close above $240 on the last trading day of the quarter?', kalshi: 'AAPL above $240 at quarter end?' },
    { poly: 'Will NVDA trade above $150 before quarter end?', kalshi: 'NVDA above $150 before quarter end?' },
    { poly: 'Will the S&P 500 end the month higher than it started?', kalshi: 'S&P 500 monthly close higher?' },
    { poly: 'Will Nervexa Therapeutics (NRVX) report topline data before year end?', kalshi: 'NRVX topline readout before year end?' },
    { poly: 'Will Altiq Systems (ALTQ) close a framework agreement with a top-10 distributor?', kalshi: 'ALTQ distributor framework agreement signed?' },
    { poly: 'Will realised 30-day volatility on NVDA exceed 45%?', kalshi: 'NVDA 30-day realised vol above 45%?' },
  ]
  return pairs.map((pair, i) => {
    const polyYes = round2(r.clustered(0.15, 0.85))
    const spread = round2(r.float(0.03, 0.16))
    const buyPoly = r.chance(0.5)
    const kalshiYes = round2(Math.min(0.97, Math.max(0.03, buyPoly ? polyYes + spread : polyYes - spread)))
    const theoretical = round2(Math.abs(kalshiYes - polyYes))
    const fees = round2(theoretical * r.float(0.12, 0.3))
    return {
      id: i + 1,
      poly_market_id: `pm-arb-${i + 1}`,
      poly_question: pair.poly,
      poly_yes_price: polyYes,
      poly_volume: Math.round(r.float(80_000, 3_100_000)),
      kalshi_market_id: `ka-arb-${i + 1}`,
      kalshi_question: pair.kalshi,
      kalshi_yes_price: kalshiYes,
      kalshi_volume: Math.round(r.float(30_000, 900_000)),
      spread: theoretical,
      spread_pct: round2(theoretical / Math.max(polyYes, 0.01)),
      direction: buyPoly ? 'buy_poly_yes' : 'buy_kalshi_yes',
      match_score: round2(r.clustered(0.62, 0.98)),
      match_method: r.pick(['embedding', 'token_overlap', 'ticker_and_threshold']),
      theoretical_profit: theoretical,
      estimated_fees: fees,
      profit_after_fees: round2(theoretical - fees),
      status: i === pairs.length - 1 ? 'false_positive' : 'open',
      detected_at: atTime(tradingDayAgo(r.int(1, 18)), r.int(9, 17), r.int(0, 59)),
    }
  })
}

// ── Backtests ───────────────────────────────────────────────────────────────

const BACKTEST_STRATEGIES = ['momentum', 'mean_reversion', 'breakout'] as const

interface StrategyProfile {
  /** Number of trades over the 1y window. */
  trades: number
  /** Share of trades the strategy exits favourably. */
  winProb: number
  /** Maximum bars held; the exit search runs over this window. */
  maxHold: number
}

const STRATEGY_PROFILES: Record<string, StrategyProfile> = {
  momentum: { trades: 44, winProb: 0.52, maxHold: 16 },
  mean_reversion: { trades: 61, winProb: 0.64, maxHold: 8 },
  breakout: { trades: 27, winProb: 0.4, maxHold: 24 },
  ensemble: { trades: 52, winProb: 0.55, maxHold: 14 },
}

/** Notional deployed per trade, as a fraction of initial capital. */
const POSITION_NOTIONAL = 0.5

function stdev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  // Sample standard deviation (ddof=1) to match pandas `Series.std()`.
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

function pctChange(values: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < values.length; i += 1) {
    out.push(values[i - 1] === 0 ? 0 : values[i] / values[i - 1] - 1)
  }
  return out
}

/**
 * Mirrors src/trading/backtesting/metrics.py:compute_metrics — same units
 * (cagr/alpha/max_drawdown/expectancy in percent, win_rate as a fraction,
 * best/worst/avg trade pnl in pnl_pct) so the panel renders demo and live
 * results identically.
 */
function computeBacktestMetrics(
  equity: number[],
  trades: BacktestTrade[],
  benchmark: number[] | null,
): BacktestFullResult['metrics'] {
  const TRADING_DAYS = 252
  const RISK_FREE = 0.05
  const returns = pctChange(equity)
  const excess = returns.map((r) => r - RISK_FREE / TRADING_DAYS)
  const excessStd = stdev(excess)
  const sharpe = excessStd === 0 ? 0 : (Math.sqrt(TRADING_DAYS) * mean(excess)) / excessStd
  const downside = returns.filter((r) => r < 0)
  const downsideStd = stdev(downside)
  const sortino = downsideStd === 0 ? 0 : (Math.sqrt(TRADING_DAYS) * mean(excess)) / downsideStd

  let peak = equity[0] ?? 0
  let worstDd = 0
  let ddRun = 0
  let maxDdRun = 0
  for (const v of equity) {
    peak = Math.max(peak, v)
    const dd = peak === 0 ? 0 : (v - peak) / peak
    worstDd = Math.min(worstDd, dd)
    if (dd < 0) {
      ddRun += 1
      maxDdRun = Math.max(maxDdRun, ddRun)
    } else {
      ddRun = 0
    }
  }
  const maxDrawdownPct = Math.abs(worstDd * 100)

  const pnls = trades.map((t) => t.pnl_pct)
  const winning = pnls.filter((p) => p > 0)
  const losing = pnls.filter((p) => p < 0)
  const winRate = pnls.length ? winning.length / pnls.length : 0
  const lossSum = Math.abs(losing.reduce((a, b) => a + b, 0))
  const profitFactor = winning.length === 0 ? 0 : lossSum === 0 ? Infinity : winning.reduce((a, b) => a + b, 0) / lossSum
  const avgWin = mean(winning)
  const avgLoss = Math.abs(mean(losing))
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss

  const totalReturnPct = equity.length > 1 ? (equity[equity.length - 1] / equity[0] - 1) * 100 : 0
  const nYears = equity.length / TRADING_DAYS
  const cagr = equity.length > 1
    ? ((equity[equity.length - 1] / equity[0]) ** (1 / Math.max(nYears, 0.01)) - 1) * 100
    : 0
  const annualReturn = mean(returns) * TRADING_DAYS * 100
  const calmar = maxDrawdownPct === 0 ? 0 : annualReturn / maxDrawdownPct

  let alpha = 0
  let beta = 0
  if (benchmark && benchmark.length > 1) {
    const benchReturns = pctChange(benchmark)
    const n = Math.min(returns.length, benchReturns.length)
    if (n > 1) {
      const a = returns.slice(0, n)
      const b = benchReturns.slice(0, n)
      const ma = mean(a)
      const mb = mean(b)
      let cov = 0
      let varB = 0
      for (let i = 0; i < n; i += 1) {
        cov += (a[i] - ma) * (b[i] - mb)
        varB += (b[i] - mb) ** 2
      }
      cov /= n - 1
      varB /= n - 1
      beta = varB === 0 ? 0 : cov / varB
      alpha = (ma - beta * mb) * TRADING_DAYS * 100
    }
  }

  return {
    sharpe_ratio: round2(sharpe),
    sortino_ratio: round2(sortino),
    calmar_ratio: round2(calmar),
    alpha_vs_spy: round2(alpha),
    beta: round2(beta),
    max_drawdown_pct: round2(maxDrawdownPct),
    max_drawdown_duration_days: maxDdRun,
    win_rate: Math.round(winRate * 10000) / 10000,
    profit_factor: Number.isFinite(profitFactor) ? round2(profitFactor) : 0,
    expectancy: round2(expectancy),
    avg_trade_pnl: round2(mean(pnls)),
    best_trade_pnl: round2(pnls.length ? Math.max(...pnls) : 0),
    worst_trade_pnl: round2(pnls.length ? Math.min(...pnls) : 0),
    total_trades: trades.length,
    total_return_pct: round2(totalReturnPct),
    cagr: round2(cagr),
    avg_holding_period_days: round2(mean(trades.map((t) => t.holding_days))),
    total_pnl: round2(trades.reduce((a, t) => a + t.pnl_dollars, 0)),
  }
}

interface BuiltBacktest {
  id: string
  strategy: string
  ticker: string
  createdAt: string
  result: BacktestFullResult
}

/**
 * One backtest run. Entry and exit prices are taken from the *actual* price
 * series, so the trade log reconciles against the chart. "Skill" is modelled by
 * which exit bar inside the holding window the strategy picks: a winning trade
 * takes the most favourable close available, a losing trade the least. That
 * keeps the win rate controllable while every price remains real, and the
 * magnitudes come from the ticker's own volatility rather than being invented.
 *
 * Trades -> equity curve -> metrics, in that order. The equity curve books
 * realised P&L on exit bars only, so `final - initial === sum(pnl_dollars)`
 * exactly.
 */
function buildBacktest(
  strategy: string,
  ticker: string,
  initialCapital: number,
  benchmarkTicker: string,
  runIndex: number,
): BuiltBacktest {
  const r = createRng(hashSeed(`backtest:${strategy}:${ticker}:${initialCapital}`) ^ DEMO_SEED)
  const series = seriesFor(ticker)
  const window = series.slice(-PERIOD_BARS['1y'])
  const dates = window.map((p) => p.date)

  const profile = STRATEGY_PROFILES[strategy] ?? STRATEGY_PROFILES.momentum
  const stride = Math.max(1, Math.floor((window.length - 4) / profile.trades))

  const trades: BacktestTrade[] = []
  const realisedByBar = new Array<number>(window.length).fill(0)

  for (let i = 0; i < profile.trades; i += 1) {
    const entryIdx = 2 + i * stride
    if (entryIdx >= window.length - 2) break
    const lastExit = Math.min(window.length - 1, entryIdx + profile.maxHold)
    if (lastExit <= entryIdx) break

    const entryPrice = window[entryIdx].close
    const direction = r.chance(0.78) ? 'BUY' : 'SHORT'
    const sign = direction === 'SHORT' ? -1 : 1
    const isWin = r.chance(profile.winProb)

    // Pick the best (win) or worst (loss) close inside the holding window.
    let exitIdx = entryIdx + 1
    let bestReturn = ((window[exitIdx].close - entryPrice) / entryPrice) * sign
    for (let k = entryIdx + 2; k <= lastExit; k += 1) {
      const ret = ((window[k].close - entryPrice) / entryPrice) * sign
      if (isWin ? ret > bestReturn : ret < bestReturn) {
        bestReturn = ret
        exitIdx = k
      }
    }

    const exitPrice = window[exitIdx].close
    const quantity = Math.max(1, Math.floor((initialCapital * POSITION_NOTIONAL) / entryPrice))
    const pnlPct = round2(bestReturn * 100)
    const pnlDollars = round2(bestReturn * entryPrice * quantity)
    realisedByBar[exitIdx] += pnlDollars
    trades.push({
      trade_id: `bt-${runIndex}-${String(i + 1).padStart(3, '0')}`,
      ticker,
      direction,
      entry_price: round2(entryPrice),
      exit_price: round2(exitPrice),
      entry_time: atTime(window[entryIdx].date, 14, 32),
      exit_time: atTime(window[exitIdx].date, 19, 55),
      quantity,
      pnl_dollars: pnlDollars,
      pnl_pct: pnlPct,
      exit_reason: pnlPct > 0
        ? r.pick(['target_hit', 'signal_flip', 'trailing_stop'])
        : r.pick(['stop_loss', 'time_exit', 'signal_flip']),
      holding_days: exitIdx - entryIdx,
    })
  }

  // Equity curve: realised P&L booked on exit bars, nothing else, so the curve
  // and the trade log cannot disagree.
  const equity: number[] = []
  let cash = initialCapital
  for (let i = 0; i < window.length; i += 1) {
    cash += realisedByBar[i]
    equity.push(round2(cash))
  }

  const drawdown: number[] = []
  let peak = equity[0]
  for (const v of equity) {
    peak = Math.max(peak, v)
    drawdown.push(round2(((v - peak) / peak) * 100))
  }

  const benchSeries = seriesFor(benchmarkTicker).slice(-PERIOD_BARS['1y'])
  const benchFirst = benchSeries[0].close
  const benchmarkValues = benchSeries.map((p) => round2((p.close / benchFirst) * initialCapital))

  // Monthly returns: last equity value of each calendar month, pct-changed —
  // the same resample('ME').last().pct_change() the backend performs.
  const monthlyLast = new Map<string, number>()
  dates.forEach((d, i) => monthlyLast.set(d.slice(0, 7), equity[i]))
  const months = [...monthlyLast.keys()].sort()
  const monthlyReturns = months.slice(1).map((m, i) => {
    const prev = monthlyLast.get(months[i]) ?? 0
    const cur = monthlyLast.get(m) ?? 0
    return { month: m, return_pct: round2(prev === 0 ? 0 : (cur / prev - 1) * 100) }
  })

  const metrics = computeBacktestMetrics(equity, trades, benchmarkValues)
  const benchReturnPct = round2((benchmarkValues[benchmarkValues.length - 1] / initialCapital - 1) * 100)

  return {
    id: `bt-${strategy}-${ticker.toLowerCase()}`,
    strategy,
    ticker,
    createdAt: atTime(tradingDayAgo(runIndex * 3 + 1), 18, 12),
    result: {
      id: `bt-${strategy}-${ticker.toLowerCase()}`,
      metrics,
      equity_curve: { dates, values: equity },
      drawdown_curve: { dates, values: drawdown },
      monthly_returns: monthlyReturns,
      trades,
      config: {
        strategy_name: strategy,
        ticker,
        period: '1y',
        initial_capital: initialCapital,
        benchmark: benchmarkTicker,
        source: 'static demo fixture',
      },
      benchmark_curve: { dates, values: benchmarkValues, ticker: benchmarkTicker },
      benchmark_return_pct: benchReturnPct,
    },
  }
}

export function buildBacktestRun(
  strategy: string,
  ticker: string,
  initialCapital: number,
  benchmarkTicker: string,
): BacktestFullResult {
  return buildBacktest(strategy, ticker, initialCapital, benchmarkTicker, 0).result
}

export function buildComparison(
  strategies: string[],
  ticker: string,
  initialCapital: number,
  benchmarkTicker: string,
): BacktestCompareResult {
  const runs = strategies.map((s, i) => buildBacktest(s, ticker, initialCapital, benchmarkTicker, i))
  const out: BacktestCompareResult = {
    ticker,
    results: runs.map((run) => ({
      strategy: run.strategy,
      metrics: run.result.metrics,
      equity_curve: run.result.equity_curve,
      trades: run.result.trades.slice(0, 50),
    })),
  }
  if (runs.length > 0 && runs[0].result.benchmark_curve) {
    out.benchmark_curve = runs[0].result.benchmark_curve
  }
  return out
}

// ── Reductions: every aggregate is derived, never authored ───────────────────

export function computeAccuracyStats(signals: Signal[], events: EventData[]): AccuracyStats {
  const eventTypeById = new Map(events.map((e) => [e.id, e.event_type]))
  const evaluated = signals.filter((s) => s.outcome != null)
  // Mirrors FeedbackTracker.get_accuracy_stats: pending means "no outcome and
  // the expiry has not passed". `today` is the build anchor, not the clock, so
  // the number does not drift while the page is open.
  const pending = signals.filter(
    (s) => s.outcome == null && s.suggested_expiry != null && s.suggested_expiry > ANCHOR_TODAY_ISO,
  )
  const wins = evaluated.filter((s) => s.outcome === 'profit')
  const losses = evaluated.filter((s) => s.outcome === 'loss')
  const expiredFlat = evaluated.filter((s) => s.outcome === 'expired')
  const total = evaluated.length

  const byEventType: AccuracyStats['by_event_type'] = {}
  const pnlByType: Record<string, number> = {}
  for (const s of evaluated) {
    const et = eventTypeById.get(s.event_id) ?? 'unknown'
    if (!byEventType[et]) {
      byEventType[et] = { count: 0, wins: 0, win_rate: 0, avg_pnl: 0 }
      pnlByType[et] = 0
    }
    byEventType[et].count += 1
    if (s.outcome === 'profit') byEventType[et].wins += 1
    pnlByType[et] += s.outcome_pnl ?? 0
  }
  for (const [et, data] of Object.entries(byEventType)) {
    data.win_rate = data.count > 0 ? data.wins / data.count : 0
    data.avg_pnl = data.count > 0 ? pnlByType[et] / data.count : 0
  }

  const byDirection: AccuracyStats['by_direction'] = {}
  for (const dir of ['call', 'put']) {
    const dirSignals = evaluated.filter((s) => s.direction === dir)
    const dirWins = dirSignals.filter((s) => s.outcome === 'profit')
    byDirection[dir] = {
      count: dirSignals.length,
      wins: dirWins.length,
      win_rate: dirSignals.length > 0 ? dirWins.length / dirSignals.length : 0,
    }
  }

  const recent = [...signals]
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    .slice(0, 10)
    .map((s) => ({
      id: s.id,
      ticker: s.ticker,
      direction: s.direction,
      strike: s.suggested_strike,
      expiry: s.suggested_expiry,
      confidence: s.confidence,
      outcome: s.outcome,
      pnl: s.outcome_pnl,
      created_at: s.created_at,
    }))

  return {
    total_evaluated: total,
    total_pending: pending.length,
    wins: wins.length,
    losses: losses.length,
    expired_flat: expiredFlat.length,
    win_rate: total > 0 ? wins.length / total : 0,
    avg_pnl: total > 0 ? evaluated.reduce((a, s) => a + (s.outcome_pnl ?? 0), 0) / total : 0,
    by_event_type: byEventType,
    by_direction: byDirection,
    recent_signals: recent,
  }
}

export function computeConfusion(signals: Signal[]): ConfusionMatrix {
  // Mirrors FeedbackTracker.get_confusion_matrix: an expired-worthless option
  // counts against the predicted direction, same as a loss.
  let tb = 0
  let fb = 0
  let tbe = 0
  let fbe = 0
  for (const s of signals) {
    if (s.outcome == null) continue
    if (s.direction === 'call') {
      if (s.outcome === 'profit') tb += 1
      else if (s.outcome === 'loss' || s.outcome === 'expired') fb += 1
    } else if (s.direction === 'put') {
      if (s.outcome === 'profit') tbe += 1
      else if (s.outcome === 'loss' || s.outcome === 'expired') fbe += 1
    }
  }
  const totalBull = tb + fb
  const totalBear = tbe + fbe
  const totalAll = totalBull + totalBear
  return {
    true_bullish: tb,
    false_bullish: fb,
    true_bearish: tbe,
    false_bearish: fbe,
    precision_bullish: totalBull > 0 ? tb / totalBull : 0,
    precision_bearish: totalBear > 0 ? tbe / totalBear : 0,
    overall_accuracy: totalAll > 0 ? (tb + tbe) / totalAll : 0,
  }
}

export function computeTickerSummaries(signals: Signal[]): TickerSummary[] {
  const byTicker = new Map<string, Signal[]>()
  for (const s of signals) {
    const list = byTicker.get(s.ticker)
    if (list) list.push(s)
    else byTicker.set(s.ticker, [s])
  }
  return [...byTicker.entries()]
    .map(([ticker, list]) => {
      const evaluated = list.filter((s) => s.outcome != null)
      const wins = evaluated.filter((s) => s.outcome === 'profit')
      const last = list.reduce<string | null>((acc, s) => {
        if (!s.created_at) return acc
        return acc == null || s.created_at > acc ? s.created_at : acc
      }, null)
      return {
        ticker,
        total_signals: list.length,
        evaluated: evaluated.length,
        win_rate: evaluated.length > 0 ? wins.length / evaluated.length : 0,
        last_signal_date: last,
      }
    })
    .sort((a, b) => b.total_signals - a.total_signals || a.ticker.localeCompare(b.ticker))
}

export function computePredictionStats(records: PredictionRecord[]): PredictionStats {
  const resolved = records.filter((p) => p.is_correct != null)
  const correct = resolved.filter((p) => p.is_correct === true)
  const byPlatform: PredictionStats['by_platform'] = {}
  const byEventType: PredictionStats['by_event_type'] = {}
  for (const p of resolved) {
    for (const [bucket, key] of [
      [byPlatform, p.platform],
      [byEventType, p.matched_event_type],
    ] as const) {
      if (!bucket[key]) bucket[key] = { total: 0, correct: 0, accuracy: 0 }
      bucket[key].total += 1
      if (p.is_correct) bucket[key].correct += 1
    }
  }
  for (const bucket of [byPlatform, byEventType]) {
    for (const data of Object.values(bucket)) {
      data.accuracy = data.total > 0 ? data.correct / data.total : 0
    }
  }
  return {
    total: resolved.length,
    correct: correct.length,
    accuracy: resolved.length > 0 ? correct.length / resolved.length : 0,
    avg_edge: records.length > 0 ? records.reduce((a, p) => a + p.edge, 0) / records.length : 0,
    avg_pnl: resolved.length > 0 ? resolved.reduce((a, p) => a + (p.pnl_if_bet ?? 0), 0) / resolved.length : 0,
    by_platform: byPlatform,
    by_event_type: byEventType,
  }
}

export function computeMlReadiness(signals: Signal[]): MlReadiness {
  // Mirrors ModelTrainer.check_readiness (threshold 30, both classes needed).
  const labeled = signals.filter((s) => s.outcome === 'profit' || s.outcome === 'loss' || s.outcome === 'expired')
  const profit = labeled.filter((s) => s.outcome === 'profit').length
  const loss = labeled.filter((s) => s.outcome === 'loss').length
  const expired = labeled.filter((s) => s.outcome === 'expired').length
  const negative = loss + expired
  const ready = labeled.length >= 30 && profit > 0 && negative > 0
  const message = ready
    ? `Ready to train: ${labeled.length} labeled signals (${profit} profit, ${negative} non-profit).`
    : `Need ${Math.max(0, 30 - labeled.length)} more labeled signals before training (${labeled.length}/30 available).`
  return {
    total_signals: signals.length,
    signals_with_outcomes: labeled.length,
    profit_count: profit,
    loss_count: loss,
    expired_count: expired,
    ready_to_train: ready,
    message,
  }
}

/**
 * Deterministic stand-in for a training pass. Metrics are derived from the
 * labeled fixture signals (an 80/20 split with a confidence-threshold rule),
 * so the numbers are consistent with the data on screen rather than invented.
 */
export function computeMlTrainingMetrics(signals: Signal[]): MlTrainingMetrics {
  const labeled = signals.filter((s) => s.outcome != null)
  const trainSize = Math.floor(labeled.length * 0.8)
  const test = labeled.slice(trainSize)
  const threshold = mean(labeled.map((s) => s.confidence))
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0
  for (const s of test) {
    const predictedWin = s.confidence >= threshold
    const actualWin = s.outcome === 'profit'
    if (predictedWin && actualWin) tp += 1
    else if (predictedWin && !actualWin) fp += 1
    else if (!predictedWin && !actualWin) tn += 1
    else fn += 1
  }
  const accuracy = test.length ? (tp + tn) / test.length : 0
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  return {
    model_type: 'gradient_boosting',
    n_samples: labeled.length,
    n_features: 14,
    train_size: trainSize,
    test_size: test.length,
    accuracy: round2(accuracy),
    precision: round2(precision),
    recall: round2(recall),
    f1_score: round2(f1),
    confusion_matrix: [[tn, fp], [fn, tp]],
    feature_importances_top10: [
      ['event_confidence', 0.19],
      ['relative_volume', 0.15],
      ['days_to_expiry', 0.12],
      ['rsi_14', 0.11],
      ['atr_pct', 0.09],
      ['entry_iv', 0.08],
      ['put_call_ratio', 0.07],
      ['article_count', 0.07],
      ['event_type_bullish', 0.06],
      ['otm_pct', 0.06],
    ],
  }
}

export function computeDiscoveryStats(discoveries: DiscoveryRecord[]): DiscoveryStats {
  const byMethod: Record<string, number> = {}
  for (const d of discoveries) {
    byMethod[d.discovery_method] = (byMethod[d.discovery_method] ?? 0) + 1
  }
  const todayPrefix = ANCHOR_TODAY_ISO
  const today = discoveries.filter((d) => (d.discovered_at ?? '').startsWith(todayPrefix))
  return {
    total_discovered: discoveries.length,
    total_led_to_signals: discoveries.filter((d) => d.signal_generated).length,
    discovered_today: today.length,
    led_to_signals_today: today.filter((d) => d.signal_generated).length,
    by_method: byMethod,
  }
}

// ── Per-ticker derived views ────────────────────────────────────────────────

export function companyInfoFor(ticker: string): CompanyInfo {
  const key = ticker.toUpperCase()
  const spec = SPEC_BY_TICKER.get(key) ?? (key === 'SPY' ? BENCHMARK_SPEC : undefined)
  const series = seriesFor(key)
  const last = series[series.length - 1]
  const prev = series[series.length - 2] ?? last
  const yearWindow = series.slice(-PERIOD_BARS['1y'])
  const r = createRng(hashSeed(`info:${key}`))
  return {
    ticker: key,
    name: spec?.name ?? `${key} (synthetic demo series)`,
    sector: spec?.sector ?? 'Unclassified',
    industry: spec?.industry ?? 'Unclassified',
    market_cap: Math.round((spec?.sharesOut ?? 5e8) * last.close),
    current_price: last.close,
    previous_close: prev.close,
    day_high: last.high,
    day_low: last.low,
    fifty_two_week_high: round2(Math.max(...yearWindow.map((p) => p.high))),
    fifty_two_week_low: round2(Math.min(...yearWindow.map((p) => p.low))),
    avg_volume: Math.round(mean(yearWindow.map((p) => p.volume))),
    beta: round2(r.float(0.6, 1.9)),
    change: round2(last.close - prev.close),
    change_percent: round2(((last.close - prev.close) / prev.close) * 100),
  }
}

export function keyStatsFor(ticker: string): KeyStats {
  const series = seriesFor(ticker)
  const last = series[series.length - 1].close
  const at = (barsBack: number) => series[Math.max(0, series.length - 1 - barsBack)].close
  const returns = pctChange(series.slice(-31).map((p) => p.close))
  const ytdBars = Number(ANCHOR_TODAY_ISO.slice(5, 7)) * 21
  return {
    weekly_return: round2(((last - at(5)) / at(5)) * 100),
    monthly_return: round2(((last - at(21)) / at(21)) * 100),
    ytd_return: round2(((last - at(ytdBars)) / at(ytdBars)) * 100),
    volatility_30d: round2(stdev(returns) * Math.sqrt(252) * 100),
  }
}

export function indicatorsFor(ticker: string): TechnicalIndicators {
  const series = seriesFor(ticker)
  const closes = series.map((p) => p.close)
  const last = closes[closes.length - 1]
  const window = closes.slice(-15)
  // Wilder-lite RSI over the last 14 changes.
  let gain = 0
  let loss = 0
  for (let i = 1; i < window.length; i += 1) {
    const diff = window[i] - window[i - 1]
    if (diff >= 0) gain += diff
    else loss -= diff
  }
  const rs = loss === 0 ? 100 : gain / loss
  const rsi = round2(100 - 100 / (1 + rs))
  const last20 = closes.slice(-20)
  const sma20 = mean(last20)
  const sd20 = stdev(last20)
  const pctB = sd20 === 0 ? 0.5 : (last - (sma20 - 2 * sd20)) / (4 * sd20)
  const trs = series.slice(-14).map((p) => p.high - p.low)
  const atr = mean(trs)
  const sma50 = mean(closes.slice(-50))
  const volumes = series.slice(-20).map((p) => p.volume)
  return {
    ticker: ticker.toUpperCase(),
    current_price: last,
    rsi_14: rsi,
    rsi_signal: rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral',
    bollinger_pct_b: round2(pctB),
    bollinger_bandwidth: round2(sma20 === 0 ? 0 : (4 * sd20) / sma20),
    bollinger_signal: pctB > 1 ? 'above_upper' : pctB < 0 ? 'below_lower' : 'inside_bands',
    atr_14: round2(atr),
    atr_pct: round2(last === 0 ? 0 : (atr / last) * 100),
    macd_signal: last > sma20 && sma20 > sma50 ? 'bullish_trend' : last < sma20 && sma20 < sma50 ? 'bearish_trend' : 'flat',
    macd_histogram: round2(sma20 - sma50),
    relative_volume: round2(mean(volumes.slice(-3)) / Math.max(mean(volumes), 1)),
    trend_20d: round2(((last - closes[closes.length - 21]) / closes[closes.length - 21]) * 100),
    trend_50d: round2(((last - closes[closes.length - 51]) / closes[closes.length - 51]) * 100),
  }
}

export function optionsFlowFor(ticker: string, events: EventData[]): OptionsFlowResult {
  const key = ticker.toUpperCase()
  const flowEvent = events.find(
    (e) => e.ticker === key && e.event_type === 'options_flow' && e.metadata?.options_flow,
  )
  const flow = flowEvent?.metadata?.options_flow
  if (!flow) return { ticker: key, unusual_activity: false }
  const contracts = flow.top_contracts ?? []
  const callVolume = contracts.filter((c) => c.type === 'call').reduce((a, c) => a + c.volume, 0)
  const putVolume = contracts.filter((c) => c.type === 'put').reduce((a, c) => a + c.volume, 0)
  return {
    ticker: key,
    unusual_activity: true,
    direction: (flow.direction as 'bullish' | 'bearish' | 'neutral') ?? 'neutral',
    bullish_weight: round2(callVolume / Math.max(callVolume + putVolume, 1)),
    bearish_weight: round2(putVolume / Math.max(callVolume + putVolume, 1)),
    total_unusual_call_volume: callVolume,
    total_unusual_put_volume: putVolume,
    max_conviction: flow.max_conviction,
    dominant_expiry: flow.dominant_expiry,
    dominant_strike: flow.dominant_strike,
    unusual_contract_count: flow.unusual_contract_count,
    top_contracts: contracts,
    unusual_contracts: contracts,
    put_call_ratio: flow.put_call_ratio,
  }
}

export function edgarFor(ticker: string, events: EventData[]): EdgarResult | null {
  const key = ticker.toUpperCase()
  const evt = events.find((e) => e.ticker === key && e.metadata?.edgar_data)
  return (evt?.metadata?.edgar_data as EdgarResult | undefined) ?? null
}

export function chartDataFor(
  ticker: string,
  period: string,
  signals: Signal[],
  events: EventData[],
): ChartData {
  const key = ticker.toUpperCase()
  const bars = PERIOD_BARS[period] ?? PERIOD_BARS['6mo']
  const prices = seriesFor(key).slice(-bars)
  const dateSet = new Set(prices.map((p) => p.date))

  // Overlays only on dates that exist in the sliced series.
  const signalOverlays: SignalOverlay[] = signals
    .filter((s) => s.ticker === key && s.created_at != null && dateSet.has(s.created_at.slice(0, 10)))
    .map((s) => ({
      id: s.id,
      date: s.created_at!.slice(0, 10),
      direction: s.direction,
      strike: s.suggested_strike,
      expiry: s.suggested_expiry,
      confidence: s.confidence,
      outcome: s.outcome,
      pnl: s.outcome_pnl,
    }))

  const eventOverlays: EventOverlay[] = events
    .filter((e) => e.ticker === key && e.detected_at != null && dateSet.has(e.detected_at.slice(0, 10)))
    .map((e) => ({
      id: e.id,
      date: e.detected_at!.slice(0, 10),
      event_type: e.event_type,
      direction: e.direction,
      confidence: e.confidence,
    }))

  return { prices, signals: signalOverlays, events: eventOverlays, indicators: indicatorsFor(key) }
}

export function intradayFor(ticker: string): PricePoint[] {
  const key = ticker.toUpperCase()
  const r = createRng(hashSeed(`intraday:${key}:${ANCHOR_TODAY_ISO}`))
  const series = seriesFor(key)
  const last = series[series.length - 1]
  const prev = series[series.length - 2] ?? last
  const points: PricePoint[] = []
  let price = prev.close
  // 09:30 -> 16:00 ET at 5-minute bars = 78 bars (13:30 -> 20:00 UTC).
  const bars = 78
  const drift = (last.close - prev.close) / bars
  for (let i = 0; i < bars; i += 1) {
    const open = price
    price = Math.max(0.5, price + drift + prev.close * r.float(-0.0016, 0.0016))
    const high = Math.max(open, price) * (1 + r.float(0, 0.0008))
    const low = Math.min(open, price) * (1 - r.float(0, 0.0008))
    points.push({
      date: new Date(Date.parse(`${ANCHOR_TODAY_ISO}T13:30:00Z`) + i * 5 * 60_000).toISOString(),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(price),
      volume: Math.round(last.volume / bars * r.float(0.4, 2.2)),
    })
  }
  return points
}

// ── Dataset assembly (runs once, at module load) ─────────────────────────────

const built = buildSignalsAndEvents(rng)
const predictionMarkets = buildPredictionMarkets(rng)
const predictionRecords = buildPredictionRecords(predictionMarkets, rng)
const arbitrage = buildArbitrage(rng)
const backtestRuns = BACKTEST_STRATEGIES.map((s, i) => buildBacktest(s, 'SPY', 100_000, 'SPY', i))

export interface DemoDataset {
  buildTime: string
  today: string
  events: EventData[]
  signals: Signal[]
  streamQueue: Signal[]
  discoveries: DiscoveryRecord[]
  predictionMarkets: PredictionMarket[]
  predictionRecords: PredictionRecord[]
  arbitrage: ArbitrageOpportunity[]
  backtests: { summary: BacktestSummary; result: BacktestFullResult }[]
}

export const DATASET: DemoDataset = {
  buildTime: BUILD_TIME,
  today: ANCHOR_TODAY_ISO,
  events: built.events,
  // Newest first, matching the dashboard's default sort (expiry desc).
  signals: [...built.signals].sort((a, b) =>
    String(b.suggested_expiry ?? '').localeCompare(String(a.suggested_expiry ?? ''))),
  streamQueue: built.streamQueue,
  discoveries: built.discoveries,
  predictionMarkets,
  predictionRecords,
  arbitrage,
  backtests: backtestRuns.map((run) => ({
    summary: {
      id: run.id,
      strategy_name: run.strategy,
      ticker: run.ticker,
      total_return_pct: run.result.metrics.total_return_pct,
      sharpe: run.result.metrics.sharpe_ratio,
      total_trades: run.result.metrics.total_trades,
      created_at: run.createdAt,
    },
    result: run.result,
  })),
}

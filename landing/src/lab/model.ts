/**
 * Signal lab: a deterministic browser model of OutlierQ's detection cascade.
 *
 * This is NOT the Python pipeline. It runs no FinBERT, fetches no data, and
 * every input below is synthetic. What it does reproduce, rule for rule, is the
 * decision logic in the repository, so a scenario here passes or fails for the
 * same reason it would there. Each constant names the file it was taken from;
 * if one of those changes, this file is what goes stale.
 *
 * Deliberately left out: the technical-indicator nudges (RSI, Bollinger, MACD,
 * each worth a few hundredths) and the live contract lookup. Both are disclosed
 * next to the lab.
 */

// ── Rules, with their sources ──────────────────────────────────────────────

/** src/detection/__init__.py AnomalyPipeline(volume_threshold=3.0) */
export const Z_THRESHOLD = 3.0;
/** src/detection/finbert_analyzer.py: is_extreme = max(pos, neg) >= 0.6 */
export const EXTREME_PROB = 0.6;
/** src/detection/sentiment_filter.py: passes = extreme_ratio >= 0.5 */
export const EXTREME_RATIO = 0.5;
/** src/detection/sentiment_filter.py: mean compound beyond ±0.2 sets direction */
export const DIRECTION_BAND = 0.2;
/** src/detection/cross_source.py CrossSourceValidator(min_sources=2) */
export const MIN_SOURCES = 2;
/** src/detection/__init__.py options-only path */
export const OPTIONS_ONLY_CONVICTION = 0.7;
export const OPTIONS_ONLY_CONTRACTS = 3;
/** src/signals/confidence_calibrator.py MIN_SAMPLES */
export const CALIBRATOR_MIN_SAMPLES = 40;
/** src/signals/feedback_tracker.py */
export const RISK_FREE_RATE = 0.04;
const MIN_ENTRY_PREMIUM = 0.01;
const PNL_CAP_PCT = 2000;

/** Subset of src/signals/signal_engine.py EVENT_PROFILES used by the scenarios. */
export const PROFILES = {
  earnings_miss: {
    direction: "put",
    strikeOffset: 0.03,
    expiryMin: 7,
    expiryMax: 21,
    decay: "moderate",
    base: 0.75,
  },
  options_flow: {
    direction: "call", // overridden by flow direction, as in generate_signal
    strikeOffset: 0,
    expiryMin: 5,
    expiryMax: 14,
    decay: "spike_fade",
    base: 0.7,
  },
} as const;

export type EventType = keyof typeof PROFILES;
export type Direction = "bullish" | "bearish" | "neutral";

// ── Scenario inputs ────────────────────────────────────────────────────────

export interface Article {
  source: string;
  headline: string;
  /** FinBERT class probabilities (synthetic). neutral = 1 - pos - neg. */
  pos: number;
  neg: number;
}

export interface OptionsFlow {
  direction: Direction;
  unusualContracts: number;
  maxConviction: number;
  dominantStrike?: number;
  /** Days after entry. */
  dominantExpiryDays?: number;
}

export interface Contract {
  openInterest: number;
  volume: number;
  impliedVol: number;
}

export interface Scenario {
  id: "earnings-miss" | "one-source" | "quiet" | "options-only";
  label: string;
  ticker: string;
  fictional: boolean;
  summary: string;
  /** Daily article counts over the 14-day rolling window, zeros included. */
  history: number[];
  today: number;
  /** Articles ingested in the last six hours. */
  articles: Article[];
  options: OptionsFlow | null;
  /** What the keyword classifier would label the event. */
  eventType: EventType;
  price: number;
  contract: Contract;
  /** Underlying close on expiry day, for grading. */
  exitPrice: number;
}

// ── Output ─────────────────────────────────────────────────────────────────

export type StageId = "volume" | "sentiment" | "sources" | "options" | "signal" | "grade";
export type StageStatus = "pass" | "fail" | "skip" | "adjust";

export interface Step {
  stage: StageId;
  status: StageStatus;
  /** Short value shown on the node, e.g. "z = 4.12". */
  value: string;
  /** One sentence for the event log. */
  note: string;
  /** Running confidence once this step has run, when one exists yet. */
  confidence?: number;
}

export interface Signal {
  ticker: string;
  eventType: EventType;
  source: "news_pipeline" | "options_flow";
  direction: "call" | "put";
  strike: number;
  expiryDays: number;
  detectionConfidence: number;
  confidence: number;
}

export interface Grade {
  outcome: "profit" | "loss" | "expired";
  entryPremium: number;
  exitValue: number;
  pnlPct: number;
}

export interface MathLine {
  /** The step that produces this line, so the UI can reveal it in order. */
  stage: StageId;
  label: string;
  expr: string;
  result: string;
}

export interface LabRun {
  scenario: Scenario;
  steps: Step[];
  baseline: { mean: number; std: number };
  z: number;
  extremeCount: number;
  extremeRatio: number | null;
  meanCompound: number | null;
  sentimentDirection: Direction | null;
  distinctSources: number | null;
  detectionConfidence: number | null;
  signal: Signal | null;
  grade: Grade | null;
  math: MathLine[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const f2 = (v: number) => v.toFixed(2);

/** Population std, with the pipeline's std == 0 -> 1 guard (volume_detector.py). */
export function baseline(counts: number[]): { mean: number; std: number } {
  const n = counts.length;
  const mean = counts.reduce((a, b) => a + b, 0) / n;
  const variance = counts.reduce((a, c) => a + (c - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  return { mean, std: std === 0 ? 1 : std };
}

export const isExtreme = (a: Article) => Math.max(a.pos, a.neg) >= EXTREME_PROB;
export const compound = (a: Article) => a.pos - a.neg;

/** signal_engine.py _get_strike_increment */
export function strikeIncrement(price: number): number {
  if (price < 50) return 1;
  if (price < 200) return 2.5;
  if (price < 500) return 5;
  return 10;
}

/** signal_engine.py compute_strike: OTM by offset, rounded to the increment. */
export function computeStrike(price: number, direction: "call" | "put", offset: number): number {
  const raw = direction === "put" ? price * (1 - offset) : price * (1 + offset);
  const inc = strikeIncrement(price);
  return Math.round(raw / inc) * inc;
}

/** signal_engine.py compute_expiry, in days after a Monday entry, rounded to Friday. */
export function computeExpiryDays(min: number, max: number, decay: string): number {
  const target = decay === "spike_fade" ? min : decay === "sustained" ? max : Math.floor((min + max) / 2);
  // Entry is day 0, a Monday (weekday 0). Friday is weekday 4.
  const weekday = target % 7;
  const ahead = weekday <= 4 ? 4 - weekday : 11 - weekday;
  return target + ahead;
}

/** signal_engine.py compute_confidence */
export function signalConfidence(event: number, base: number, c: Contract): number {
  let conf = (event + base) / 2;
  if (c.openInterest > 100) conf += 0.05;
  if (c.volume > 50) conf += 0.05;
  if (c.impliedVol > 1.0) conf -= 0.1;
  return clamp(conf, 0.1, 0.95);
}

// Black-Scholes, as in src/signals/options_pricer.py.
function normCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26, max abs error 7.5e-8.
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export function bsPrice(
  kind: "call" | "put",
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number
): number {
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return kind === "call"
    ? S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2)
    : K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

/** feedback_tracker.py evaluate_signal: Black-Scholes entry, intrinsic at expiry. */
export function gradeSignal(sig: Signal, entry: number, exit: number, iv: number): Grade {
  const T = Math.max(sig.expiryDays, 1) / 365;
  const entryPremium = Math.max(bsPrice(sig.direction, entry, sig.strike, T, RISK_FREE_RATE, iv), MIN_ENTRY_PREMIUM);
  const exitValue = sig.direction === "call" ? Math.max(exit - sig.strike, 0) : Math.max(sig.strike - exit, 0);
  let pnlPct = clamp(((exitValue - entryPremium) / entryPremium) * 100, -100, PNL_CAP_PCT);
  let outcome: Grade["outcome"];
  if (exitValue <= 0) {
    outcome = "expired";
    pnlPct = -100;
  } else if (pnlPct > 0) outcome = "profit";
  else outcome = "loss";
  return { outcome, entryPremium, exitValue, pnlPct };
}

// ── The cascade ────────────────────────────────────────────────────────────

/** Runs one scenario through the same stages, in the same order, as
 *  AnomalyPipeline.scan followed by SignalEngine.generate_signal. */
export function runScenario(s: Scenario): LabRun {
  const steps: Step[] = [];
  const math: MathLine[] = [];
  const { mean, std } = baseline(s.history);
  const z = (s.today - mean) / std;

  const run: LabRun = {
    scenario: s,
    steps,
    baseline: { mean, std },
    z,
    extremeCount: 0,
    extremeRatio: null,
    meanCompound: null,
    sentimentDirection: null,
    distinctSources: null,
    detectionConfidence: null,
    signal: null,
    grade: null,
    math,
  };

  // Stage 1: news volume against the ticker's own baseline.
  const volumePass = z >= Z_THRESHOLD;
  steps.push({
    stage: "volume",
    status: volumePass ? "pass" : "fail",
    value: `z = ${f2(z)}`,
    note: `${s.today} articles today against a 14-day baseline of ${mean.toFixed(1)} ± ${std.toFixed(1)}: z = ${f2(z)}, ${volumePass ? "above" : "below"} the ${Z_THRESHOLD.toFixed(1)} threshold.`,
  });

  // Stages 2 and 3 only run on tickers that spiked.
  let newsOutlier = false;
  if (volumePass) {
    const extreme = s.articles.filter(isExtreme).length;
    const ratio = s.articles.length ? extreme / s.articles.length : 0;
    const meanC = s.articles.reduce((a, x) => a + compound(x), 0) / Math.max(s.articles.length, 1);
    const dir: Direction = meanC < -DIRECTION_BAND ? "bearish" : meanC > DIRECTION_BAND ? "bullish" : "neutral";
    run.extremeCount = extreme;
    run.extremeRatio = ratio;
    run.meanCompound = meanC;
    run.sentimentDirection = dir;
    const sentPass = ratio >= EXTREME_RATIO;
    steps.push({
      stage: "sentiment",
      status: sentPass ? "pass" : "fail",
      value: `${extreme}/${s.articles.length} extreme`,
      note: `FinBERT marks ${extreme} of ${s.articles.length} recent articles extreme (ratio ${f2(ratio)}); mean tone ${meanC >= 0 ? "+" : ""}${f2(meanC)} reads ${dir}.`,
    });

    if (sentPass) {
      const distinct = new Set(s.articles.map((a) => a.source)).size;
      run.distinctSources = distinct;
      const srcPass = distinct >= MIN_SOURCES;
      newsOutlier = srcPass;
      let conf: number | undefined;
      if (srcPass) {
        const nz = Math.min(z / 5, 1);
        const ns = Math.min(distinct / 5, 1);
        conf = (nz + ratio + ns) / 3;
        run.detectionConfidence = conf;
        math.push(
          { stage: "sources", label: "News volume", expr: `min(${f2(z)} / 5, 1)`, result: f2(nz) },
          { stage: "sources", label: "Extreme ratio", expr: `${extreme} / ${s.articles.length}`, result: f2(ratio) },
          { stage: "sources", label: "Sources", expr: `min(${distinct} / 5, 1)`, result: f2(ns) },
          {
            stage: "sources",
            label: "Detection confidence",
            expr: `(${f2(nz)} + ${f2(ratio)} + ${f2(ns)}) / 3`,
            result: f2(conf),
          }
        );
      }
      steps.push({
        stage: "sources",
        status: srcPass ? "pass" : "fail",
        value: `${distinct} source${distinct === 1 ? "" : "s"}`,
        note: srcPass
          ? `${distinct} independent outlets carry the story. The event is confirmed at detection confidence ${f2(conf!)}.`
          : `Every article comes from one outlet. A single loud source is not an event, so the cascade stops here.`,
        confidence: conf,
      });
    } else {
      steps.push({ stage: "sources", status: "skip", value: "not reached", note: "" });
    }
  } else {
    steps.push({ stage: "sentiment", status: "skip", value: "not reached", note: "" });
    steps.push({ stage: "sources", status: "skip", value: "not reached", note: "" });
  }

  // Stage 4: options flow corroborates a news outlier, or stands alone.
  const flow = s.options;
  let eventType: EventType | null = null;
  let source: Signal["source"] = "news_pipeline";
  let direction: "call" | "put" = "call";
  if (newsOutlier && run.detectionConfidence !== null) {
    let conf = run.detectionConfidence;
    if (flow && flow.unusualContracts > 0) {
      const before = conf;
      conf += 0.1;
      let extra = "";
      const sd = run.sentimentDirection;
      if (flow.direction !== "neutral" && sd && sd !== "neutral") {
        if (flow.direction === sd) {
          conf += 0.05;
          extra = " + 0.05 (agrees)";
        } else {
          conf -= 0.1;
          extra = " − 0.10 (conflicts)";
        }
      }
      conf = clamp(conf, 0, 1);
      math.push({ stage: "options", label: "Options flow", expr: `${f2(before)} + 0.10${extra}`, result: f2(conf) });
      steps.push({
        stage: "options",
        status: "adjust",
        value: `${flow.unusualContracts} unusual · ${flow.direction}`,
        note: `${flow.unusualContracts} unusual contracts lean ${flow.direction}, ${flow.direction === sd ? "matching" : "against"} the news tone. Confidence moves to ${f2(conf)}.`,
        confidence: conf,
      });
    } else {
      steps.push({
        stage: "options",
        status: "skip",
        value: "no unusual flow",
        note: "No unusual options activity. Confidence unchanged.",
        confidence: conf,
      });
    }
    run.detectionConfidence = conf;
    eventType = s.eventType;
    direction = PROFILES[eventType].direction as "call" | "put";
  } else if (flow && flow.maxConviction >= OPTIONS_ONLY_CONVICTION && flow.unusualContracts >= OPTIONS_ONLY_CONTRACTS) {
    const conf = flow.maxConviction * 0.8;
    run.detectionConfidence = conf;
    eventType = "options_flow";
    source = "options_flow";
    direction = flow.direction === "bearish" ? "put" : "call";
    math.push({ stage: "options", label: "Options-only confidence", expr: `${f2(flow.maxConviction)} × 0.8`, result: f2(conf) });
    steps.push({
      stage: "options",
      status: "pass",
      value: `conviction ${f2(flow.maxConviction)}`,
      note: `No news event, but ${flow.unusualContracts} unusual contracts at conviction ${f2(flow.maxConviction)} clear the options-only bar (≥ ${OPTIONS_ONLY_CONVICTION} with ≥ ${OPTIONS_ONLY_CONTRACTS} contracts).`,
      confidence: conf,
    });
  } else {
    steps.push({
      stage: "options",
      status: flow ? "fail" : "skip",
      value: flow ? `conviction ${f2(flow.maxConviction)}` : "no unusual flow",
      note: flow
        ? `Options activity is too thin to stand alone (conviction ${f2(flow.maxConviction)}, ${flow.unusualContracts} unusual contract${flow.unusualContracts === 1 ? "" : "s"}).`
        : "No unusual options activity either.",
    });
  }

  // Signal generation.
  if (eventType === null || run.detectionConfidence === null) {
    steps.push({
      stage: "signal",
      status: "skip",
      value: "no output",
      note: "The scan finishes with nothing to report. That is the correct answer, not a failure to find something.",
    });
    steps.push({ stage: "grade", status: "skip", value: "nothing to grade", note: "" });
    return run;
  }

  const profile = PROFILES[eventType];
  let strike = computeStrike(s.price, direction, profile.strikeOffset);
  let expiryDays = computeExpiryDays(profile.expiryMin, profile.expiryMax, profile.decay);
  if (eventType === "options_flow" && flow) {
    if (flow.dominantStrike !== undefined) strike = flow.dominantStrike;
    if (flow.dominantExpiryDays !== undefined) expiryDays = flow.dominantExpiryDays;
  }
  const conf = signalConfidence(run.detectionConfidence, profile.base, s.contract);
  const liq: string[] = [];
  if (s.contract.openInterest > 100) liq.push("+ 0.05 OI");
  if (s.contract.volume > 50) liq.push("+ 0.05 vol");
  if (s.contract.impliedVol > 1.0) liq.push("− 0.10 IV");
  math.push({
    stage: "signal",
    label: "Signal confidence",
    expr: `(${f2(run.detectionConfidence)} + ${f2(profile.base)} base) / 2 ${liq.join(" ")}`.trim(),
    result: f2(conf),
  });

  run.signal = {
    ticker: s.ticker,
    eventType,
    source,
    direction,
    strike,
    expiryDays,
    detectionConfidence: run.detectionConfidence,
    confidence: conf,
  };
  steps.push({
    stage: "signal",
    status: "pass",
    value: `${direction.toUpperCase()} $${strike.toFixed(strike % 1 ? 2 : 0)}`,
    note: `${eventType.charAt(0).toUpperCase()}${eventType.slice(1).replace("_", " ")} → ${direction.toUpperCase()} at $${strike.toFixed(2)}, expiring day ${expiryDays} (a Friday). Confidence ${f2(conf)}, raw: the calibrator stays inactive until ${CALIBRATOR_MIN_SAMPLES} graded signals with both outcomes exist.`,
    confidence: conf,
  });

  const grade = gradeSignal(run.signal, s.price, s.exitPrice, s.contract.impliedVol);
  run.grade = grade;
  steps.push({
    stage: "grade",
    status: grade.outcome === "profit" ? "pass" : "fail",
    value: grade.outcome,
    note: `At expiry the underlying closes at $${s.exitPrice.toFixed(2)}. Worth $${grade.exitValue.toFixed(2)} against a $${grade.entryPremium.toFixed(2)} Black-Scholes entry: ${grade.outcome} (${grade.pnlPct >= 0 ? "+" : ""}${grade.pnlPct.toFixed(0)}%).`,
  });

  return run;
}

// ── Scenarios ──────────────────────────────────────────────────────────────
// Tickers marked fictional are the invented symbols the dashboard demo uses.

export const SCENARIOS: Scenario[] = [
  {
    id: "earnings-miss",
    label: "Earnings miss",
    ticker: "NRVX",
    fictional: true,
    summary: "A quarterly miss, picked up across several outlets, with bearish options flow.",
    history: [3, 4, 2, 5, 3, 4, 3, 2, 4, 3, 5, 3, 4, 3],
    today: 7,
    articles: [
      { source: "Newswire 1", headline: "NRVX quarterly revenue falls short of consensus", pos: 0.03, neg: 0.91 },
      { source: "Newswire 2", headline: "NRVX lowers full-year outlook after soft bookings", pos: 0.05, neg: 0.86 },
      { source: "Financial daily", headline: "NRVX gross margin narrows for a second quarter", pos: 0.08, neg: 0.72 },
      { source: "Newswire 1", headline: "Analysts trim NRVX targets after results", pos: 0.1, neg: 0.64 },
      { source: "Trade press", headline: "What the NRVX guidance cut means for the year", pos: 0.12, neg: 0.48 },
      { source: "Trade press", headline: "NRVX management keeps buyback plan unchanged", pos: 0.3, neg: 0.21 },
    ],
    options: { direction: "bearish", unusualContracts: 4, maxConviction: 0.75 },
    eventType: "earnings_miss",
    price: 48.2,
    contract: { openInterest: 1840, volume: 412, impliedVol: 0.62 },
    exitPrice: 44.1,
  },
  {
    id: "one-source",
    label: "One loud source",
    ticker: "TQNX",
    fictional: true,
    summary: "A single outlet runs a burst of stories. Volume and tone both spike.",
    history: [2, 1, 3, 2, 2, 1, 2, 3, 2, 1, 2, 2, 3, 2],
    today: 6,
    articles: [
      { source: "Blog network", headline: "TQNX faces supplier dispute, sources say", pos: 0.04, neg: 0.82 },
      { source: "Blog network", headline: "TQNX supplier dispute could delay shipments", pos: 0.06, neg: 0.77 },
      { source: "Blog network", headline: "Inside the TQNX supplier standoff", pos: 0.09, neg: 0.69 },
      { source: "Blog network", headline: "TQNX declines to comment on supplier report", pos: 0.1, neg: 0.52 },
    ],
    options: null,
    eventType: "earnings_miss",
    price: 46.75,
    contract: { openInterest: 0, volume: 0, impliedVol: 0.5 },
    exitPrice: 46.75,
  },
  {
    id: "quiet",
    label: "Quiet day",
    ticker: "AAPL",
    fictional: false,
    summary: "An ordinary session: normal coverage, nothing unusual in the options chain.",
    history: [11, 9, 12, 10, 8, 11, 13, 10, 9, 12, 10, 11, 9, 10],
    today: 11,
    articles: [
      { source: "Newswire 1", headline: "Large caps drift in light trading", pos: 0.22, neg: 0.18 },
      { source: "Newswire 2", headline: "Tech shares steady ahead of data", pos: 0.25, neg: 0.12 },
    ],
    options: { direction: "neutral", unusualContracts: 1, maxConviction: 0.45 },
    eventType: "earnings_miss",
    price: 214.4,
    contract: { openInterest: 0, volume: 0, impliedVol: 0.25 },
    exitPrice: 214.4,
  },
  {
    id: "options-only",
    label: "Options only",
    ticker: "ALTQ",
    fictional: true,
    summary: "No news at all, but a cluster of unusual out-of-the-money call buying.",
    history: [2, 3, 2, 2, 3, 1, 2, 2, 3, 2, 2, 1, 2, 3],
    today: 2,
    articles: [],
    options: { direction: "bullish", unusualContracts: 4, maxConviction: 0.82, dominantStrike: 65, dominantExpiryDays: 11 },
    eventType: "options_flow",
    price: 61.3,
    contract: { openInterest: 960, volume: 180, impliedVol: 0.58 },
    exitPrice: 62.4,
  },
];

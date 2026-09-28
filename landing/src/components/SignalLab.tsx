import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Icon, { type IconName } from "./Icon";
import SectionHeading from "./SectionHeading";
import {
  CALIBRATOR_MIN_SAMPLES,
  SCENARIOS,
  compound,
  isExtreme,
  runScenario,
  type Scenario,
  type StageId,
  type StageStatus,
} from "../lab/model";

type NodeState = StageStatus | "idle" | "active";

const NODES: { stage: StageId; icon: IconName; title: string; desc: string; rule: string }[] = [
  { stage: "volume", icon: "activity", title: "News volume", desc: "Against its own baseline", rule: "z ≥ 3.0" },
  { stage: "sentiment", icon: "newspaper", title: "FinBERT tone", desc: "Half the articles extreme", rule: "p ≥ 0.6 on ≥ 50%" },
  { stage: "sources", icon: "layers", title: "Sources", desc: "Independent outlets", rule: "distinct ≥ 2" },
  { stage: "options", icon: "zap", title: "Options flow", desc: "Corroborate or stand alone", rule: "+0.10 · agree ±" },
  { stage: "signal", icon: "target", title: "Signal", desc: "Direction, strike, expiry", rule: "(event + base) / 2" },
];

const SPEEDS = [
  { label: "1× speed", ms: 750 },
  { label: "3× speed", ms: 260 },
  { label: "0.5× speed", ms: 1500 },
];

const TABS = ["articles", "math", "log"] as const;
type Tab = (typeof TABS)[number];

/** Steps revealed by an ordinary run: everything up to and including the
 *  signal. Grading is its own action, as it is in the pipeline. */
const RUN_TARGET = 5;
const GRADE_TARGET = 6;

const tickerLabel = (s: Scenario) => `${s.ticker}${s.fictional ? "*" : ""}`;

export default function SignalLab() {
  const [scenarioId, setScenarioId] = useState<Scenario["id"]>("earnings-miss");
  const [speed, setSpeed] = useState(SPEEDS[0].ms);
  const [cursor, setCursor] = useState(0);
  const [target, setTarget] = useState(RUN_TARGET);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<Tab>("articles");
  const shellRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  const run = useMemo(() => runScenario(scenario), [scenario]);
  const hasSignal = run.signal !== null;
  const maxCursor = hasSignal ? GRADE_TARGET : RUN_TARGET;
  const revealed = run.steps.slice(0, cursor);
  const stepFor = (stage: StageId) => revealed.find((s) => s.stage === stage);

  // Advance one step per tick while running.
  useEffect(() => {
    if (!running) return;
    const goal = Math.min(target, maxCursor);
    if (cursor >= goal) {
      setRunning(false);
      return;
    }
    const t = window.setTimeout(() => setCursor((c) => c + 1), cursor === 0 ? 120 : speed);
    return () => window.clearTimeout(t);
  }, [running, cursor, target, speed, maxCursor]);

  const reset = (id: Scenario["id"] = scenarioId) => {
    setScenarioId(id);
    setCursor(0);
    setTarget(RUN_TARGET);
    setRunning(false);
  };

  const finished = cursor >= RUN_TARGET;
  const graded = cursor >= GRADE_TARGET;

  const onRun = () => {
    if (running) return setRunning(false);
    if (finished) setCursor(0);
    setTarget(RUN_TARGET);
    setRunning(true);
  };
  const onStep = () => {
    setRunning(false);
    setCursor((c) => Math.min(c + 1, maxCursor));
  };
  const onGrade = () => {
    setTarget(GRADE_TARGET);
    setRunning(true);
  };

  const preset = (id: Scenario["id"], opts: { grade?: boolean; tab?: Tab } = {}) => {
    setScenarioId(id);
    setCursor(0);
    setTarget(opts.grade ? GRADE_TARGET : RUN_TARGET);
    setTab(opts.tab ?? "log");
    setRunning(true);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    shellRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  // Status line.
  const stageIndex = Math.min(cursor, RUN_TARGET);
  let status: string;
  if (cursor === 0) status = running ? "Starting" : "Ready to run";
  else if (!finished) status = running ? `Running stage ${stageIndex + 1} of 5` : `Paused at stage ${stageIndex} of 5`;
  else if (!hasSignal) status = "Finished · no output";
  else if (!graded) status = running ? "Grading at expiry" : "Finished · 1 signal";
  else status = `Graded · ${run.grade!.outcome}`;

  const runLabel = running ? "Pause" : finished ? "Run again" : cursor > 0 ? "Resume" : "Run scenario";

  const nodeState = (stage: StageId, i: number): NodeState => {
    const st = stepFor(stage);
    if (st) return st.status;
    if (running && i === cursor) return "active";
    return "idle";
  };

  // Metrics.
  const vol = stepFor("volume");
  const sent = stepFor("sentiment");
  const src = stepFor("sources");
  const lastConf = [...revealed].reverse().find((s) => s.confidence !== undefined)?.confidence;
  const sentimentShown = sent && sent.status !== "skip";

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[next]);
    tabRefs.current[next]?.focus();
  };

  const logItems = revealed.filter((s) => s.note).map((s, i) => ({ ...s, n: i + 1 })).reverse();
  const mathLines = run.math.filter((m) => revealed.some((s) => s.stage === m.stage));

  return (
    <section id="lab" aria-labelledby="lab-title" className="border-t border-line bg-paper-2 pb-14 pt-20 sm:pt-24">
      <div className="wrap">
        <SectionHeading
          id="lab-title"
          eyebrow="02 / The signal lab"
          title={
            <>
              Feed it a headline.
              <br />
              Watch it say no.
            </>
          }
          aside={
            <>
              <p>
                Run a scenario through the same rules the pipeline uses, then grade what comes
                out. Most of the interesting runs end with nothing.
              </p>
              <p className="mt-4 flex items-center gap-2 font-mono text-[12px] text-faint">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-up" />
                Browser model · 4 synthetic scenarios
              </p>
            </>
          }
        />

        <div
          ref={shellRef}
          className="scroll-mt-24 overflow-hidden rounded-[9px] border border-deep-line bg-deep text-deep-ink shadow-[0_26px_50px_-30px_rgba(19,28,46,0.6)]"
        >
          {/* Top bar */}
          <div className="flex items-center justify-between gap-4 border-b border-deep-line bg-deep-2 px-4 py-4 sm:px-6">
            <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-[14px] font-semibold">
              <Icon name="spike" className="h-[18px] w-[18px] text-ice" strokeWidth={2} />
              Signal lab
              <span className="label hidden rounded border border-deep-line px-1.5 py-0.5 text-deep-muted sm:inline">
                browser model
              </span>
            </div>
            <div className="flex items-center gap-2 text-right font-mono text-[12px] text-deep-muted" aria-live="polite">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${running ? "bg-ice" : finished ? "bg-up-d" : "bg-deep-faint"}`}
              />
              {status}
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-end gap-3 px-4 pb-4 pt-5 sm:gap-5 sm:px-6">
            <label className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-none">
              <span className="label text-deep-muted">Scenario</span>
              <select
                value={scenarioId}
                onChange={(e) => reset(e.target.value as Scenario["id"])}
                className="min-h-[40px] rounded border border-deep-line bg-deep-2 px-3 text-[13px] text-deep-ink [color-scheme:dark] sm:w-56"
              >
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} · {tickerLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-28 flex-col gap-2 sm:w-32">
              <span className="label text-deep-muted">Playback</span>
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="min-h-[40px] rounded border border-deep-line bg-deep-2 px-3 text-[13px] text-deep-ink [color-scheme:dark]"
              >
                {SPEEDS.map((s) => (
                  <option key={s.ms} value={s.ms}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
              <button
                type="button"
                onClick={onRun}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded border border-ice bg-ice px-4 text-[13px] font-semibold text-deep transition-colors hover:bg-[#d3e0ff] sm:flex-none"
              >
                <Icon name={running ? "pause" : finished ? "rotate" : "play"} className="h-4 w-4" />
                {runLabel}
              </button>
              <button
                type="button"
                onClick={onStep}
                disabled={cursor >= maxCursor}
                title="Advance one stage"
                aria-label="Advance one stage"
                className="inline-flex h-[42px] w-[42px] items-center justify-center rounded border border-deep-line bg-deep-2 text-deep-muted transition-colors hover:bg-deep-3 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name="step" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => reset()}
                title="Reset scenario"
                aria-label="Reset scenario"
                className="inline-flex h-[42px] w-[42px] items-center justify-center rounded border border-deep-line bg-deep-2 text-deep-muted transition-colors hover:bg-deep-3"
              >
                <Icon name="rotate" className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p className="px-4 pb-5 text-[13px] leading-relaxed text-deep-muted sm:px-6">{scenario.summary}</p>

          {/* Metrics */}
          <div className="mx-4 grid grid-cols-2 overflow-hidden rounded-md border border-deep-line bg-deep-2 sm:mx-6 lg:grid-cols-4">
            <Metric label="News z-score" value={vol ? run.z.toFixed(2) : "—"} hint="≥ 3.0 passes" tone={vol?.status} />
            <Metric
              label="Extreme tone"
              value={sentimentShown ? `${run.extremeCount}/${scenario.articles.length}` : "—"}
              hint="≥ 50% at p ≥ 0.6"
              tone={sentimentShown ? sent.status : undefined}
            />
            <Metric
              label="Distinct sources"
              value={src && src.status !== "skip" ? String(run.distinctSources) : "—"}
              hint="≥ 2 required"
              tone={src && src.status !== "skip" ? src.status : undefined}
            />
            <Metric
              label="Confidence"
              value={lastConf !== undefined ? lastConf.toFixed(2) : "—"}
              hint="raw, uncalibrated"
              bar={lastConf}
            />
          </div>

          {/* Cascade */}
          <div className="panel-dots px-4 pb-7 pt-6 sm:px-6">
            <div className="label mb-5 flex flex-wrap items-center justify-between gap-3 text-deep-muted">
              <span>Detection cascade</span>
              <span className="flex items-center gap-3 normal-case tracking-normal">
                <Legend className="bg-up-d" label="pass" />
                <Legend className="bg-down-d" label="stop" />
                <Legend className="bg-gate" label="adjust" />
              </span>
            </div>
            <ol className="grid gap-2 lg:grid-cols-[1fr_22px_1fr_22px_1fr_22px_1fr_22px_1fr] lg:items-stretch lg:gap-0">
              {NODES.map((n, i) => {
                const state = nodeState(n.stage, i);
                const st = stepFor(n.stage);
                return (
                  <li key={n.stage} className="contents">
                    {i > 0 && <Connector active={running && cursor === i} />}
                    <Node {...n} state={state} value={st ? st.value : state === "active" ? "checking…" : "waiting"} />
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Grade rail */}
          <div className="flex flex-col gap-3 border-y border-deep-line bg-deep-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-start gap-2.5 text-[13px] sm:items-center">
              <Icon name="calendar" className="mt-0.5 h-4 w-4 text-gate sm:mt-0" />
              <span>
                <b className="font-medium text-deep-ink">Grade at expiry.</b>{" "}
                <span className="text-deep-muted">
                  {!finished
                    ? "Waiting for the cascade to finish."
                    : !hasSignal
                      ? "Nothing to grade. An empty scan is a correct result."
                      : !graded
                        ? `Expires day ${run.signal!.expiryDays}. Mark it against Black-Scholes.`
                        : run.steps[5].note}
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={onGrade}
              disabled={!finished || !hasSignal || graded || running}
              className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded border border-gate/60 bg-gate/10 px-3 text-[13px] text-gate transition-colors hover:bg-gate/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name="clock" className="h-4 w-4" />
              Jump to expiry
            </button>
          </div>

          {/* Inspector */}
          <div role="tablist" aria-label="Lab inspector" className="flex gap-6 overflow-x-auto border-b border-deep-line px-4 sm:px-6">
            {TABS.map((t, i) => {
              const label = t === "articles" ? "Articles" : t === "math" ? "Confidence math" : "Event log";
              const count = t === "articles" ? scenario.articles.length : t === "log" ? logItems.length : mathLines.length;
              return (
                <button
                  key={t}
                  ref={(el) => (tabRefs.current[i] = el)}
                  id={`lab-tab-${t}`}
                  role="tab"
                  aria-selected={tab === t}
                  aria-controls={`lab-panel-${t}`}
                  tabIndex={tab === t ? 0 : -1}
                  onClick={() => setTab(t)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={`min-h-[48px] whitespace-nowrap border-b-2 text-[13px] transition-colors ${
                    tab === t ? "border-ice text-deep-ink" : "border-transparent text-deep-muted hover:text-deep-ink"
                  }`}
                >
                  {label}
                  <span className="ml-1.5 rounded bg-deep-3 px-1.5 py-0.5 font-mono text-[11px]">{count}</span>
                </button>
              );
            })}
          </div>
          <div id={`lab-panel-${tab}`} role="tabpanel" aria-labelledby={`lab-tab-${tab}`} className="min-h-[15rem] px-4 py-5 sm:px-6">
            {tab === "articles" && <Articles scenario={scenario} marked={!!sentimentShown} />}
            {tab === "math" &&
              (mathLines.length ? (
                <div className="space-y-2 font-mono text-[12px]">
                  {mathLines.map((m) => (
                    <div key={m.label} className="grid gap-1 border-b border-deep-line/70 pb-2 sm:grid-cols-[12rem_1fr_4rem] sm:gap-4">
                      <span className="text-deep-muted">{m.label}</span>
                      <span className="text-deep-ink">{m.expr}</span>
                      <span className="text-ice sm:text-right">{m.result}</span>
                    </div>
                  ))}
                  <p className="pt-2 font-sans text-[12px] leading-relaxed text-deep-muted">
                    These are heuristics, not probabilities. The calibrator maps them onto realized win
                    rates once {CALIBRATOR_MIN_SAMPLES} graded signals with both outcomes exist; until then
                    they are stored raw.
                  </p>
                </div>
              ) : (
                <Empty>
                  {finished
                    ? "No confidence was computed. Nothing confirmed an event, so there is nothing to score."
                    : "Confidence is computed once a news event is confirmed, or when options flow stands alone."}
                </Empty>
              ))}
            {tab === "log" &&
              (logItems.length ? (
                <ol className="max-h-64 overflow-y-auto">
                  {logItems.map((s) => (
                    <li
                      key={s.n}
                      className="grid grid-cols-[2rem_1fr] items-baseline gap-x-3 gap-y-1 border-b border-deep-line/70 py-2.5 sm:grid-cols-[2rem_5.5rem_1fr]"
                    >
                      <span className="font-mono text-[11px] text-deep-faint">{String(s.n).padStart(2, "0")}</span>
                      <span className={`label ${kindColor(s.status)}`}>{s.stage}</span>
                      <span className="col-start-2 text-[13px] leading-relaxed text-deep-ink/90 sm:col-start-auto">{s.note}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty>Run the scenario to see the story of this scan.</Empty>
              ))}
          </div>

          {/* Output */}
          <div className="flex flex-col gap-2 border-t border-deep-line bg-deep-2 px-4 py-4 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-2.5">
              <Icon name="shield" className="h-4 w-4 text-deep-muted" />
              {!finished ? (
                <span className="text-deep-muted">Output appears when the cascade finishes.</span>
              ) : hasSignal ? (
                <span>
                  <b className="font-medium">1 signal:</b>{" "}
                  <span className="text-deep-muted">
                    {tickerLabel(scenario)} {run.signal!.direction.toUpperCase()} ${run.signal!.strike}, day{" "}
                    {run.signal!.expiryDays}, confidence {run.signal!.confidence.toFixed(2)}
                  </span>
                </span>
              ) : (
                <span>
                  <b className="font-medium">No output.</b> <span className="text-deep-muted">That is the correct answer.</span>
                </span>
              )}
            </div>
            <span className="font-mono text-[12px] text-deep-faint">calibrator inactive · raw confidence</span>
          </div>
        </div>

        <p className="mt-5 flex max-w-[62rem] items-start gap-2.5 text-[13px] leading-[1.7] text-muted">
          <Icon name="info" className="mt-0.5 h-4 w-4" />
          This model reproduces the pipeline's decision rules with synthetic inputs in your browser.
          It does not run FinBERT, fetch news, or price real contracts, and it leaves out the small
          technical-indicator nudges (RSI, Bollinger, MACD). NRVX*, TQNX* and ALTQ* are fictional
          tickers; every number is synthetic.
        </p>

        <div className="mt-9 flex flex-col gap-1 border-t border-line pt-6 lg:flex-row lg:items-center lg:gap-4">
          <span className="label mb-2 text-faint lg:mb-0 lg:w-40 lg:shrink-0">Three things to try</span>
          {[
            { n: "01", label: "Watch a quiet day produce nothing", go: () => preset("quiet") },
            { n: "02", label: "See one loud source get rejected", go: () => preset("one-source") },
            { n: "03", label: "Grade a signal that lost", go: () => preset("options-only", { grade: true }) },
          ].map((t) => (
            <button
              key={t.n}
              type="button"
              onClick={t.go}
              className="flex min-h-[44px] flex-1 items-center gap-3 rounded px-1 text-left text-[14px] text-body transition-colors hover:bg-paper-3 lg:px-3"
            >
              <b className="font-mono text-[12px] font-normal text-faint">{t.n}</b>
              {t.label}
              <Icon name="arrow-up-right" className="ml-auto h-4 w-4 text-faint" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function kindColor(s: StageStatus) {
  return s === "pass" ? "text-up-d" : s === "fail" ? "text-down-d" : s === "adjust" ? "text-gate" : "text-deep-faint";
}

function Metric({
  label,
  value,
  hint,
  tone,
  bar,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: StageStatus;
  bar?: number;
}) {
  const color = tone === "pass" ? "text-up-d" : tone === "fail" ? "text-down-d" : "text-deep-ink";
  return (
    <div className="min-w-0 p-4 [&:nth-child(n+3)]:border-t [&:nth-child(even)]:border-l border-deep-line sm:p-5 lg:[&:nth-child(n+2)]:border-l lg:[&:nth-child(n+3)]:border-t-0">
      <span className="label block text-deep-muted">{label}</span>
      <strong className={`mt-3 block font-mono text-[26px] font-normal leading-none tracking-[-0.02em] ${color}`}>{value}</strong>
      <small className="mt-2 block text-[12px] text-deep-faint">{hint}</small>
      {bar !== undefined && (
        <span className="mt-3 block h-0.5 max-w-[10rem] bg-deep-line">
          <i className="block h-0.5 bg-ice transition-[width] duration-300" style={{ width: `${Math.round(bar * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] lowercase">
      <i className={`inline-block h-1.5 w-1.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function Connector({ active }: { active: boolean }) {
  return (
    <span aria-hidden="true" className="relative mx-auto h-3 w-px bg-deep-line lg:mx-0 lg:h-px lg:w-full lg:self-center">
      {active && <i className="connector-dot absolute -top-[2px] hidden h-[5px] w-[5px] rounded-full bg-ice lg:block" />}
    </span>
  );
}

function Node({
  icon,
  title,
  desc,
  rule,
  state,
  value,
}: {
  icon: IconName;
  title: string;
  desc: string;
  rule: string;
  state: NodeState;
  value: string;
}) {
  const border =
    state === "pass"
      ? "border-up-d/50"
      : state === "fail"
        ? "border-down-d/60"
        : state === "adjust"
          ? "border-gate/60"
          : state === "active"
            ? "border-ice node-active"
            : state === "skip"
              ? // Dashed, not faded: opacity would drop the text under 4.5:1.
                "border-dashed border-deep-line bg-deep-2"
              : "border-deep-line";
  const badge =
    state === "pass" ? (
      <Icon name="check" className="h-3.5 w-3.5 text-up-d" strokeWidth={2.2} />
    ) : state === "fail" ? (
      <Icon name="x" className="h-3.5 w-3.5 text-down-d" strokeWidth={2.2} />
    ) : state === "adjust" ? (
      <span className="font-mono text-[12px] text-gate">±</span>
    ) : null;
  const valueColor =
    state === "pass" ? "text-up-d" : state === "fail" ? "text-down-d" : state === "adjust" ? "text-gate" : "text-deep-faint";
  // Phone: rule and live value share the bottom row. Desktop nodes are too
  // narrow for that, so the rule sits above a divider and the value below it.
  return (
    <div
      className={`relative flex flex-col rounded-md border bg-deep-3 px-4 py-3.5 shadow-[0_6px_15px_rgba(4,10,24,0.2)] transition-[border-color,opacity] duration-300 lg:px-3.5 lg:py-4 ${border}`}
    >
      <div className="flex items-center gap-2 text-[14px] font-medium text-deep-ink lg:text-[13px]">
        <Icon name={icon} className="h-4 w-4 text-ice" />
        {title}
        <span className="ml-auto">{badge}</span>
      </div>
      <p className="mt-1 text-[12px] text-deep-muted lg:mt-3">{desc}</p>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-deep-line pt-2.5 font-mono text-[12px] lg:mt-2 lg:block lg:border-t-0 lg:pt-0">
        <code className="text-deep-ink/85 lg:block lg:border-b lg:border-deep-line lg:pb-2.5">{rule}</code>
        <span className={`text-right lg:mt-2.5 lg:block lg:text-left ${valueColor}`}>{value}</span>
      </div>
    </div>
  );
}

function Articles({ scenario, marked }: { scenario: Scenario; marked: boolean }) {
  if (!scenario.articles.length)
    return <Empty>No articles in the last six hours. Only the options chain has anything to say.</Empty>;
  const mark = (ext: boolean) =>
    marked ? (
      ext ? (
        <span className="text-ice">extreme</span>
      ) : (
        <span className="text-deep-faint">not extreme</span>
      )
    ) : (
      <span className="text-deep-faint">—</span>
    );
  return (
    <>
      <ul className="divide-y divide-deep-line/60 sm:hidden">
        {scenario.articles.map((a, i) => (
          <li key={i} className="py-3">
            <div className="flex items-center justify-between gap-3 font-mono text-[12px]">
              <span className="text-deep-muted">{a.source}</span>
              {mark(isExtreme(a))}
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-deep-ink/90">
              {a.headline.replace(scenario.ticker, tickerLabel(scenario))}
            </p>
            <p className="mt-1 font-mono text-[12px] text-deep-faint">
              neg {a.neg.toFixed(2)} · pos {a.pos.toFixed(2)}
            </p>
          </li>
        ))}
      </ul>
      <ArticleTable scenario={scenario} marked={marked} />
    </>
  );
}

function ArticleTable({ scenario, marked }: { scenario: Scenario; marked: boolean }) {
  return (
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <thead>
          <tr className="label text-deep-muted">
            <th className="border-b border-deep-line py-2 pr-4 font-normal">Source</th>
            <th className="border-b border-deep-line py-2 pr-4 font-normal">Headline</th>
            <th className="border-b border-deep-line py-2 pr-4 text-right font-normal">FinBERT neg / pos</th>
            <th className="border-b border-deep-line py-2 text-right font-normal">Extreme</th>
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {scenario.articles.map((a, i) => {
            const ext = isExtreme(a);
            return (
              <tr key={i} className="border-b border-deep-line/60">
                <td className="whitespace-nowrap py-2.5 pr-4 font-mono text-[12px] text-deep-muted">{a.source}</td>
                <td className="py-2.5 pr-4 text-deep-ink/90">{a.headline.replace(scenario.ticker, tickerLabel(scenario))}</td>
                <td className="whitespace-nowrap py-2.5 pr-4 text-right font-mono text-[12px] text-deep-ink/85">
                  {a.neg.toFixed(2)} / {a.pos.toFixed(2)}
                  <span className="ml-2 text-deep-faint">
                    ({compound(a) >= 0 ? "+" : ""}
                    {compound(a).toFixed(2)})
                  </span>
                </td>
                <td className="py-2.5 text-right font-mono text-[12px]">
                  {marked ? (
                    ext ? (
                      <span className="text-ice">yes</span>
                    ) : (
                      <span className="text-deep-faint">no</span>
                    )
                  ) : (
                    <span className="text-deep-faint">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <div className="flex min-h-[11rem] items-center justify-center rounded border border-dashed border-deep-line p-5 text-center text-[13px] text-deep-muted">
      {children}
    </div>
  );
}

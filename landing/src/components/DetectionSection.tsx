import Section from "./Section";
import { MockPanel } from "./Panel";

/** Stage 01 of the pipeline: what gets watched, and what counts as an anomaly.
 *  Deliberately upstream of SignalsSection — nothing here maps to a strike yet.
 *  Every number is synthetic; the panel is labelled as such. */

/** Illustrative rolling news-volume z-scores for one ticker, oldest first. */
const Z = [0.4, -0.2, 0.6, 0.1, -0.5, 0.3, 0.8, -0.1, 0.5, 1.1, 0.7, 1.6, 2.2, 3.2];
const Z_MAX = 3.6;
const THRESHOLD = 2.5;

function ZBars() {
  const w = 260;
  const h = 84;
  const gap = 3;
  const bw = (w - gap * (Z.length - 1)) / Z.length;
  const zero = h * 0.72;
  const scale = (v: number) => (v / Z_MAX) * zero;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block w-full" role="img" aria-label="Illustrative rolling news-volume z-scores rising from below one sigma to 3.2 sigma, crossing a 2.5 sigma threshold">
      <line
        x1="0"
        x2={w}
        y1={zero - scale(THRESHOLD)}
        y2={zero - scale(THRESHOLD)}
        stroke="#448aff"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.65"
      />
      <line x1="0" x2={w} y1={zero} y2={zero} stroke="#1a2233" strokeWidth="1" />
      {Z.map((v, i) => {
        const hgt = Math.max(1.5, Math.abs(scale(v)));
        const fired = v >= THRESHOLD;
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={v >= 0 ? zero - hgt : zero}
            width={bw}
            height={hgt}
            rx="1"
            fill={fired ? "#448aff" : "#3c4761"}
          />
        );
      })}
      {/* Label sits at the left: anchored right it collided with the final,
          threshold-breaking bar, which occupies the right edge. */}
      <text
        x="0"
        y={zero - scale(THRESHOLD) - 5}
        textAnchor="start"
        fontSize="9"
        fill="#7a8497"
        fontFamily="'JetBrains Mono', monospace"
      >
        2.5σ threshold
      </text>
    </svg>
  );
}

function SentimentScale() {
  const v = 0.62;
  const pct = ((v + 1) / 2) * 100;
  return (
    <div className="pt-2">
      <div
        className="relative h-1.5 rounded-full bg-panel-2"
        role="img"
        aria-label="Illustrative FinBERT sentiment of plus 0.62 on a scale from minus one to plus one, outside the neutral band"
      >
        <div className="absolute inset-y-0 left-[38%] right-[38%] rounded-full bg-edge" />
        <div
          className="absolute -top-1 h-3.5 w-[3px] rounded-full bg-up"
          style={{ left: `calc(${pct}% - 1.5px)` }}
        />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[9px] text-faint">
        <span>-1.00</span>
        <span>neutral band</span>
        <span>+1.00</span>
      </div>
      <div className="mt-3 font-mono text-lg font-semibold tracking-tight text-up">+0.62</div>
    </div>
  );
}

function FlowBars() {
  const rows = [
    { label: "Call volume", pct: 82, cls: "bg-up" },
    { label: "Open interest", pct: 34, cls: "bg-edge" },
  ];
  return (
    <div className="space-y-3 pt-2">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
            <span>{r.label}</span>
            <span className="text-muted">{r.pct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-panel-2">
            <div className={`h-1.5 rounded-full ${r.cls}`} style={{ width: `${r.pct}%` }} />
          </div>
        </div>
      ))}
      <div className="font-mono text-[10px] leading-snug text-faint">
        Volume 2.4× open interest — flagged as unusual activity.
      </div>
    </div>
  );
}

function DetectionMockup() {
  const cols = [
    { title: "News volume", sub: "Rolling z-score · 30d baseline", body: <ZBars /> },
    { title: "Sentiment", sub: "FinBERT, finance-tuned", body: <SentimentScale /> },
    { title: "Options flow", sub: "Volume vs open interest", body: <FlowBars /> },
  ];
  return (
    <MockPanel label="OutlierQ · Detector rail">
      <div className="grid gap-px bg-edge sm:grid-cols-3">
        {cols.map((c) => (
          <div key={c.title} className="bg-panel p-4 sm:p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              {c.title}
            </div>
            <div className="mt-1 font-mono text-[10px] text-faint">{c.sub}</div>
            <div className="mt-4">{c.body}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-edge px-4 py-3 sm:px-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          Escalation gate
        </span>
        <span className="font-mono text-[11px] text-muted">
          2 of 3 detectors must agree before an event becomes a signal
        </span>
      </div>
    </MockPanel>
  );
}

export default function DetectionSection() {
  return (
    <Section
      id="detection"
      kicker="01 · Detection"
      headline={
        <>
          Most days, nothing happens.
          <br className="hidden sm:block" /> The job is noticing when it does.
        </>
      }
      lede="Before anything becomes a signal, three independent detectors watch the same ticker: how far its news flow has broken from its own baseline, what a finance-tuned language model reads in the tone, and whether the options chain agrees. Any one of them alone is noise."
      mockup={<DetectionMockup />}
      cards={[
        {
          title: "Baselines are per-ticker",
          body: "A quiet small cap getting five articles is a bigger anomaly than a mega cap getting fifty. The z-score is computed against each ticker's own rolling history, never a global threshold.",
        },
        {
          title: "Confirmation gate",
          body: "One loud source is not an event. Detections only escalate when independent signals — news, tone, and options activity — point the same way, which throws away most of what the scanner sees.",
        },
        {
          title: "Empty output is valid",
          body: "There is no quota. On quiet days the scan finishes with nothing to report, and the pipeline is designed to treat that as a correct answer rather than a failure to find something.",
        },
      ]}
      glowSide="right"
    />
  );
}

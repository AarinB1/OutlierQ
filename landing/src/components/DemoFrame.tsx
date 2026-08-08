import { DEMO_URL, DEMO_URL_DISPLAY } from "../lib/site";

/** Hero product frame.
 *
 *  Built as real HTML/CSS rather than a screenshot: browser chrome, faint inner
 *  border, soft accent glow underneath, gentle perspective on >=md.
 *
 *  This ships as a *static* mockup — the deferred-iframe variant was measured
 *  and rejected; see the note in App.tsx and the report. The only interactive
 *  element is the address pill, which is a real link to the demo; everything
 *  else is decorative and hidden from assistive tech, so the frame contributes
 *  exactly one sane tab stop. */

const NAV = ["Signals", "Arbitrage", "Portfolio", "Calibration"];

/** Illustrative weekly paper-portfolio marks; same synthetic series as the
 *  Tracking section so the page never shows two contradicting track records. */
const SPARK = [
  10000, 10140, 10080, 10260, 10190, 10430, 10370, 10540, 10310, 10480, 10620, 10560, 10790,
  10730, 10980, 10900, 11150, 11060, 11320, 11480, 11390, 11630, 11550, 11820, 11940, 11870,
  12110, 12310,
];

function Spark() {
  const w = 560;
  const h = 96;
  const min = 9800;
  const max = 12600;
  const x = (i: number) => (i / (SPARK.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / (max - min)) * h;
  const line = SPARK.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(
    " "
  );
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="frame-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#448aff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#448aff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="url(#frame-spark)" />
      <path d={line} fill="none" stroke="#448aff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

const KPIS: { label: string; value: string; sub?: string; cls?: string }[] = [
  { label: "Portfolio", value: "$12,310", sub: "+23.1%", cls: "text-headline" },
  { label: "Win rate", value: "61.4%", sub: "n = 312 evaluated", cls: "text-up" },
  { label: "Open signals", value: "3" },
  { label: "Calibrator", value: "Inactive", sub: "needs n ≥ 40", cls: "text-muted" },
];

const FEED: { t: string; fake?: boolean; label: string; dir: string; cls: string }[] = [
  { t: "NVDA", label: "Options-flow outlier", dir: "CALL", cls: "text-up" },
  { t: "NRVX", fake: true, label: "Sentiment reversal", dir: "PUT", cls: "text-down" },
  { t: "TSM", label: "Cross-source cluster", dir: "CALL", cls: "text-up" },
  { t: "COIN", label: "Volume anomaly", dir: "FLAT", cls: "text-muted" },
];

export default function DemoFrame() {
  return (
    <div className="relative">
      {/* Soft accent glow beneath the frame. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 bottom-0 top-16 blur-2xl"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 60%, rgba(68,138,255,0.20), transparent 72%)",
        }}
      />
      <div className="frame-tilt relative">
        <div className="overflow-hidden rounded-2xl border border-edge bg-panel shadow-[0_50px_120px_-52px_rgba(0,0,0,0.95)] ring-1 ring-inset ring-white/[0.04]">
          {/* window bar */}
          <div className="flex items-center gap-3 border-b border-edge bg-panel-2/80 px-3 py-2.5 sm:px-4">
            <div aria-hidden="true" className="hidden shrink-0 items-center gap-1.5 sm:flex">
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            </div>
            <a
              href={DEMO_URL}
              className="group flex min-w-0 flex-1 items-center gap-2 rounded-md border border-edge bg-ink/60 px-3 py-1 transition-colors hover:border-accent/50"
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="h-3 w-3 shrink-0 text-faint transition-colors group-hover:text-accent"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <rect x="3.5" y="7" width="9" height="6.5" rx="1.4" />
                <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" strokeLinecap="round" />
              </svg>
              <span className="truncate font-mono text-[10px] text-muted transition-colors group-hover:text-body sm:text-[11px]">
                {DEMO_URL_DISPLAY}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-faint transition-colors group-hover:text-accent">
                Open ↗
              </span>
            </a>
            <span className="hidden shrink-0 rounded-full border border-edge bg-panel px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint md:inline-block">
              Synthetic data
            </span>
          </div>

          {/* body — decorative preview of the demo dashboard */}
          <div aria-hidden="true" className="grid grid-cols-1 md:grid-cols-[8.5rem_1fr]">
            <div className="hidden flex-col gap-1 border-r border-edge bg-panel-2/40 p-3 md:flex">
              {NAV.map((n, i) => (
                <div
                  key={n}
                  className={`rounded-md px-2.5 py-1.5 font-mono text-[11px] ${
                    i === 0 ? "bg-accent/10 text-accent" : "text-faint"
                  }`}
                >
                  {n}
                </div>
              ))}
              <div className="mt-auto pt-4 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                Demo build
              </div>
            </div>

            <div className="min-w-0 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-edge bg-edge sm:grid-cols-4">
                {KPIS.map((k) => (
                  <div key={k.label} className="bg-panel px-3 py-2.5">
                    <div className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                      {k.label}
                    </div>
                    <div
                      className={`mt-1 truncate font-mono text-[13px] font-semibold sm:text-sm ${
                        k.cls ?? "text-headline"
                      }`}
                    >
                      {k.value}
                    </div>
                    {k.sub ? (
                      <div className="mt-0.5 truncate font-mono text-[9px] text-faint">{k.sub}</div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="mt-3 overflow-hidden rounded-lg border border-edge bg-panel">
                <div className="flex items-center justify-between border-b border-edge px-3 py-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                    Paper portfolio · 6 mo
                  </span>
                  <span className="font-mono text-[10px] text-up">+23.1%</span>
                </div>
                <div className="h-16 sm:h-20">
                  <Spark />
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-lg border border-edge bg-panel">
                <div className="border-b border-edge px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                  Signal feed
                </div>
                {FEED.map((r) => (
                  <div
                    key={r.t}
                    className="flex items-center gap-2.5 border-b border-edge px-3 py-2 last:border-b-0"
                  >
                    <span className="w-11 shrink-0 font-mono text-[11px] font-semibold text-headline">
                      {r.t}
                      {r.fake ? <span className="text-faint">*</span> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted">
                      {r.label}
                    </span>
                    <span className={`shrink-0 font-mono text-[10px] font-semibold ${r.cls}`}>
                      {r.dir}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
        Preview of the interactive demo · all figures synthetic · * fictional ticker
      </p>
    </div>
  );
}

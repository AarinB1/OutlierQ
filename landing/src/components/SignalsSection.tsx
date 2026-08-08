import Section from "./Section";
import { MockPanel, StatCell } from "./Panel";

function ConfidenceBar({
  value,
  baseline,
  n,
}: {
  value: number;
  baseline: number;
  /** Sample size the calibration was fitted on. Required: a calibrated
   *  confidence without its n attached is not a meaningful number. */
  n: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          Calibrated confidence · n = {n}
        </span>
        <span className="font-mono text-sm font-medium text-headline sm:text-base">
          {value.toFixed(2)}
        </span>
      </div>
      <div
        className="relative mt-2 h-1.5 rounded-full bg-panel-2"
        role="img"
        aria-label={`Confidence ${value.toFixed(2)} versus ${baseline.toFixed(2)} baseline`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${value * 100}%` }}
        />
        <div
          className="absolute -top-1 bottom-[-4px] w-px bg-faint"
          style={{ left: `${baseline * 100}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-faint">
        <span>0.00</span>
        <span style={{ marginLeft: "-10%" }}>{baseline.toFixed(2)} baseline</span>
        <span>1.00</span>
      </div>
    </div>
  );
}

function SignalMockup() {
  return (
    <MockPanel label="OutlierQ · Signal feed">
      <div className="grid gap-px bg-edge lg:grid-cols-[1.6fr_1fr]">
        {/* primary signal card */}
        <div className="bg-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-mono text-2xl font-semibold tracking-tight text-headline sm:text-3xl">
              NVDA
            </span>
            <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
              Options-flow outlier
            </span>
            <span className="ml-auto rounded-md bg-up/10 px-3 py-1 font-mono text-sm font-semibold text-up">
              CALL
            </span>
          </div>
          {/* Describes what the detectors saw, never an event at the company:
              nothing here asserts a real business outcome. */}
          <p className="mt-3 text-[13px] leading-snug text-muted">
            News volume 3.2σ above its own baseline across 42 sources, with call volume running
            ahead of open interest. Synthetic example.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <StatCell label="Suggested strike" value="$145 C" />
            <StatCell label="Expiry" value="Aug 21" />
            <StatCell label="FinBERT sentiment" value="+0.81" valueClass="text-up" />
            <StatCell label="News z-score" value="3.2σ" valueClass="text-accent" />
          </div>
          <div className="mt-6">
            <ConfidenceBar value={0.68} baseline={0.5} n={312} />
          </div>
          <div className="mt-5 flex items-center gap-2 border-t border-edge pt-4 font-mono text-[11px] text-faint">
            <svg viewBox="0 0 12 12" className="h-3 w-3 text-up" fill="currentColor" aria-hidden="true">
              <path d="M4.6 8.4 2.2 6l-.9.9 3.3 3.3 6-6-.9-.9-5.1 5.1Z" />
            </svg>
            Cross-source confirmed · news + options flow
          </div>
        </div>
        {/* secondary feed */}
        <div className="flex flex-col bg-panel">
          <div className="border-b border-edge px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
            Queue · 3 open events
          </div>
          {/* Bearish rows use fictional tickers (verified absent from the Nasdaq
              Trader symbol directory and SEC company_tickers.json); real tickers
              only ever carry neutral/bullish rows with detector-level labels. */}
          {[
            { t: "NRVX", fake: true, ev: "Sentiment reversal", dir: "PUT", dirUp: false, conf: "0.61" },
            { t: "TSM", fake: false, ev: "Cross-source cluster", dir: "CALL", dirUp: true, conf: "0.57" },
            { t: "COIN", fake: false, ev: "Volume anomaly", dir: "—", dirUp: null, conf: "0.52" },
          ].map((row) => (
            <div
              key={row.t}
              className="flex items-center gap-3 border-b border-edge px-5 py-3.5 last:border-b-0"
            >
              <span className="w-14 font-mono text-sm font-semibold text-headline">
                {row.t}
                {row.fake ? <span className="text-faint">*</span> : null}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted">{row.ev}</span>
              <span
                className={`font-mono text-xs font-semibold ${
                  row.dirUp === null ? "text-faint" : row.dirUp ? "text-up" : "text-down"
                }`}
              >
                {row.dir}
              </span>
              <span className="font-mono text-xs text-muted">{row.conf}</span>
            </div>
          ))}
          <div className="mt-auto px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            Scanning 500+ tickers · every 15 min
            <span className="mt-1 block normal-case tracking-normal">* fictional ticker</span>
          </div>
        </div>
      </div>
    </MockPanel>
  );
}

export default function SignalsSection() {
  return (
    <Section
      id="signals"
      kicker="02 · Options signals"
      headline={
        <>
          From headline to strike price,
          <br className="hidden sm:block" /> in one pipeline.
        </>
      }
      lede="When a news event breaks the pattern, OutlierQ classifies it and maps it to a concrete options structure — direction, strike, expiry — with a confidence score that is calibrated against its own realized win rate."
      mockup={<SignalMockup />}
      cards={[
        {
          title: "FinBERT sentiment",
          body: "Every headline is scored by a finance-tuned BERT model, not generic sentiment. Direction comes from what the language actually implies for the underlying.",
        },
        {
          title: "News-volume anomalies",
          body: "A rolling z-score flags tickers whose news flow suddenly breaks from baseline. Quiet names getting loud is often the earliest signal available.",
        },
        {
          title: "Unusual options activity",
          body: "Options chains are scanned for volume and open-interest outliers. A signal only fires with conviction when independent sources confirm each other.",
        },
      ]}
      glowSide="left"
    />
  );
}

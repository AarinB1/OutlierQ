import Icon from "./Icon";
import SectionHeading from "./SectionHeading";
import { sourceUrl } from "../lib/site";

const steps = [
  { n: "01", title: "Ingest", body: "Finnhub news and yfinance prices land in SQLite with full history." },
  { n: "02", title: "Detect", body: "Volume, FinBERT tone and source checks run in order. Options flow can corroborate." },
  { n: "03", title: "Classify", body: "A keyword classifier labels the event: earnings miss, FDA approval, recall, and so on." },
  { n: "04", title: "Signal", body: "The event's profile sets direction, strike offset and expiry. The chain adjusts confidence." },
  { n: "05", title: "Grade", body: "Expired signals are marked against Black-Scholes and feed the calibrator." },
];

const invariants = [
  "An empty scan is a valid result, not an error.",
  "A signal that cannot be priced honestly stays pending instead of being guessed.",
  "The calibrator is the identity function until n ≥ 40 with both outcomes.",
  "Raw confidence is kept on every signal, so any calibration stays auditable.",
];

// Worked example, using arbitrage_detector.py's own arithmetic.
const POLY_YES = 0.57;
const KALSHI_YES = 0.63;
const spread = Math.abs(KALSHI_YES - POLY_YES);
const fee = 0.07 * KALSHI_YES * (1 - KALSHI_YES);
const cents = (v: number) => `${(v * 100).toFixed(1)}¢`;

export default function Architecture() {
  return (
    <section id="architecture" aria-labelledby="arch-title" className="wrap py-20 sm:py-24 lg:py-28">
      <SectionHeading
        id="arch-title"
        eyebrow="03 / Under the surface"
        title={
          <>
            One pipeline.
            <br />
            Five small contracts.
          </>
        }
        aside="Each stage has one job and one rule you can find in the source. A stage that says no ends the news path; only strong options flow can raise a separate event."
      />

      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
        <div className="rounded-lg border border-line bg-paper-2 px-5 py-5 sm:px-7 sm:py-6">
          <div className="label flex items-center justify-between border-b border-line pb-4 text-faint">
            <span>The pipeline contract</span>
            <span>01 to 05</span>
          </div>
          <ol>
            {steps.map((s, i) => {
              const last = i === steps.length - 1;
              return (
                <li
                  key={s.n}
                  className={`relative flex items-center gap-5 py-5 ${
                    last
                      ? ""
                      : "after:absolute after:-bottom-2.5 after:left-[15px] after:h-5 after:border-l after:border-dashed after:border-line-2"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] ${
                      last ? "border-accent/30 bg-accent-soft text-accent" : "border-line-2 bg-paper-3 text-muted"
                    }`}
                  >
                    {s.n}
                  </span>
                  <div>
                    <h3 className="text-[16px] font-medium text-ink">{s.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.body}</p>
                  </div>
                  <Icon
                    name={last ? "check" : "arrow-down"}
                    className={`ml-auto h-4 w-4 shrink-0 ${last ? "text-accent" : "text-faint"}`}
                  />
                </li>
              );
            })}
          </ol>
        </div>

        <div>
          <p className="eyebrow">Results you can audit</p>
          <h3 className="mt-5 text-[1.75rem] font-medium leading-[1.3] tracking-[-0.025em] text-ink sm:text-[1.9rem]">
            Every number has a line
            <br />
            you can point to.
          </h3>
          <p className="mt-5 max-w-[34rem] text-[15px] leading-[1.85] text-muted">
            The pipeline is replayable from stored raw events, so a result can be recomputed rather
            than taken on trust. The rules below hold across every stage.
          </p>
          <ul className="my-7 space-y-3.5">
            {invariants.map((t) => (
              <li key={t} className="flex items-start gap-3 text-[14px] leading-relaxed text-body">
                <Icon name="check" className="mt-1 h-4 w-4 text-accent" strokeWidth={2} />
                {t}
              </li>
            ))}
          </ul>
          <a href={sourceUrl("src/detection/__init__.py")} target="_blank" rel="noreferrer" className="text-link">
            Read the detection pipeline
            <Icon name="arrow-up-right" className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="mt-16 grid gap-8 border-t border-line pt-10 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div>
          <p className="eyebrow">
            <Icon name="scale" className="h-4 w-4" />
            Also in the repo · prediction markets
          </p>
          <h3 className="mt-4 text-[1.4rem] font-medium leading-[1.3] tracking-[-0.025em] text-ink">
            Polymarket and Kalshi, matched by question text.
          </h3>
          <p className="mt-4 max-w-[34rem] text-[14px] leading-[1.8] text-muted">
            A second scanner pairs questions across the two venues (exact, substring, entity overlap,
            token Jaccard, then fuzzy), needs a 0.55 match score and at least a 3¢ spread, and nets out
            Kalshi's trading fee. Text similarity cannot prove two markets resolve identically, so
            matches are for study, not blind execution.
          </p>
        </div>
        <div className="self-start rounded-lg border border-line bg-paper-2 p-5 font-mono text-[13px] sm:p-6">
          <div className="label mb-4 flex justify-between text-faint">
            <span>Worked example</span>
            <span>synthetic prices</span>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-y-2.5 text-body">
            <dt>Polymarket YES</dt>
            <dd className="text-right">${POLY_YES.toFixed(2)}</dd>
            <dt>Kalshi YES</dt>
            <dd className="text-right">${KALSHI_YES.toFixed(2)}</dd>
            <dt>Spread</dt>
            <dd className="text-right">{cents(spread)}</dd>
            <dt className="text-muted">Kalshi fee, 0.07 · P · (1 − P)</dt>
            <dd className="text-right text-down">−{cents(fee)}</dd>
            <dt className="border-t border-line pt-2.5 font-semibold text-ink">Edge after fees</dt>
            <dd className="border-t border-line pt-2.5 text-right font-semibold text-ink">{cents(spread - fee)}</dd>
          </dl>
        </div>
      </div>
    </section>
  );
}

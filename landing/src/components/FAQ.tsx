import { useId, useState } from "react";
import Reveal from "./Reveal";

const faqs = [
  {
    q: "Is this financial advice?",
    a: "No. OutlierQ is a personal research project for studying event-driven signals. Nothing it produces — signals, confidence scores, arbitrage spreads — is a recommendation to buy or sell any security or contract.",
  },
  {
    q: "Does it trade real money?",
    a: "No. Not in the demo, and not in the repository's default configuration. The execution engine is paper-trading: it records what an order would have been and later marks it against market data. No broker is connected, no account is funded, and no order is ever routed anywhere.",
  },
  {
    q: "What data does the interactive demo use?",
    a: "Synthetic fixtures, baked into the build. The demo is deployed to GitHub Pages, which serves static files only — so there is no FastAPI process, no database, and no connection to Finnhub, yfinance, Polymarket, Kalshi, or FinBERT behind the page you are clicking. Every ticker, price, win rate, return, Sharpe figure, and sample count you see there and here was generated to make the interface legible. None of it is a real track record.",
  },
  {
    q: "Are the numbers on this page real?",
    a: "No. Every figure in every mockup on this page is synthetic and illustrative — including the equity curve, the 61.4% win rate, the sample counts, and the ticker tape. Tickers marked with an asterisk are fictional symbols, checked against the Nasdaq Trader symbol directory and the SEC's registrant list so they do not collide with a real listed company. Real ticker symbols appear only on neutral or bullish rows whose labels describe what a detector saw, never an event at the company.",
  },
  {
    q: "How do I run it myself?",
    a: "Clone the repository, create a virtualenv and install requirements.txt, copy .env.example to .env and add your own Finnhub key, then run the scheduler. The frontend is a Vite app: npm ci && npm run dev in the dashboard directory. Everything is MIT licensed, and the pipeline is replayable from stored raw events, so you can recompute the whole track record yourself rather than taking a number on trust.",
  },
  {
    q: "Why is the confidence calibrator inactive?",
    a: "Because it has not earned the right to be active yet. The calibrator fits an isotonic regression from stated confidence to realized win rate, and src/signals/confidence_calibrator.py sets MIN_SAMPLES = 40: it refuses to fit unless there are at least 40 evaluated signals and both outcome classes are present — at least one win and at least one non-win. Below that threshold calibrate() is the identity function and the pipeline stores raw confidence unchanged, so the scaffolding is inert rather than quietly guessing. It attempts a refit after every evaluation pass, and the pre-calibration value is kept on each signal as raw_confidence so any adjustment stays auditable.",
  },
  {
    q: "What happens when the market is quiet?",
    a: "Nothing fires, and that is the intended behaviour. Anomaly scores are z-scores against each ticker's own rolling baseline, so a flat news week simply does not clear the threshold, and an event has to be confirmed by more than one independent detector before it escalates into a signal. On a quiet day the scan finishes with an empty result set. There is no daily quota to fill, because a system that always finds something is a system that has stopped measuring anything.",
  },
  {
    q: "Is the code open?",
    a: "Yes. The full pipeline — ingestion, detection, signal generation, tracking, and calibration — is on GitHub under the MIT license. You can read every model and every assumption, including the thresholds quoted in these answers.",
  },
  {
    q: "Where does the data come from when it is running for real?",
    a: "Company news comes from Finnhub and market data from yfinance, ingested on a schedule. The prediction-market module reads public prices from Polymarket and Kalshi. None of those sources are reachable from the deployed demo, which is static.",
  },
  {
    q: "How is the confidence score computed?",
    a: "It starts from the detected event's strength — sentiment, news-volume z-score, options-flow confirmation — and is then mapped through the calibrator described above onto the realized win rate for similar signals. A stored 0.8 is meant to say \"signals like this have won about 80% of the time\", not \"the heuristics summed to 0.8\". Until the sample threshold is met, it says the second thing, and the interface labels it as raw.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const uid = useId();
  const btnId = `faq-btn-${uid}`;
  const panelId = `faq-panel-${uid}`;

  return (
    <div className="border-b border-edge">
      <h3>
        <button
          id={btnId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="group flex w-full items-center justify-between gap-4 py-5 text-left sm:py-6"
        >
          <span className="text-base font-medium tracking-tight text-headline transition-colors group-hover:text-accent sm:text-lg">
            {q}
          </span>
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-muted transition-[transform,color] duration-300 group-hover:text-accent ${
              open ? "rotate-45" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M8 2v12M2 8h12" />
          </svg>
        </button>
      </h3>
      {/* The panel is named by its button, and hidden from assistive tech when
          collapsed. It holds no focusable content, so aria-hidden is sufficient
          — there is nothing that could become an invisible tab stop. */}
      <div
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        aria-hidden={!open}
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <p className="max-w-2xl pb-6 text-[15px] leading-relaxed text-muted">{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function FAQ() {
  return (
    <section id="faq" className="relative overflow-hidden py-24 sm:py-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(40rem 26rem at 88% 10%, rgba(68,138,255,0.06), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-wrap px-5 sm:px-8">
        <Reveal>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-accent">FAQ</p>
          <h2
            className="font-semibold leading-[1.06] text-headline"
            style={{ fontSize: "clamp(1.9rem, 4.4vw, 3.25rem)", letterSpacing: "-0.02em" }}
          >
            Honest answers.
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-10 border-t border-edge sm:mt-12">
            {faqs.map((f) => (
              <FAQItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

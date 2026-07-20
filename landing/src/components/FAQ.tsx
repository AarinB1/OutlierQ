import { useState } from "react";
import Reveal from "./Reveal";

const faqs = [
  {
    q: "Is this financial advice?",
    a: "No. OutlierQ is a personal research project for studying event-driven signals. Nothing it produces — signals, confidence scores, arbitrage spreads — is a recommendation to buy or sell any security or contract.",
  },
  {
    q: "Does it trade real money?",
    a: "No. The execution engine is paper-trading by default. Signals and arbitrage spreads are simulated and evaluated against real market data, but no live orders are placed.",
  },
  {
    q: "Is the code open?",
    a: "Yes. The full pipeline — ingestion, detection, signal generation, and tracking — is on GitHub under the MIT license. You can read every model and every assumption.",
  },
  {
    q: "Where does the data come from?",
    a: "Company news comes from Finnhub and market data from yfinance, ingested on a schedule. The prediction-market module reads public prices from Polymarket and Kalshi.",
  },
  {
    q: "How is the confidence score computed?",
    a: "It starts from the detected event's strength — sentiment, news-volume z-score, options-flow confirmation — and is then calibrated against the platform's realized win rate for similar signals. If a signal type stops working, its confidence drops.",
  },
  {
    q: "Can I run it myself?",
    a: "Yes. It's a Python/FastAPI backend with a React + TypeScript frontend. Clone the repo, add your own API keys for the data sources, and the scheduler does the rest.",
  },
];

function FAQItem({ q, a, id }: { q: string; a: string; id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-edge">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-4 py-5 text-left sm:py-6"
        >
          <span className="text-base font-medium tracking-tight text-headline sm:text-lg">
            {q}
          </span>
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-muted transition-transform duration-300 ${
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
      <div
        id={id}
        role="region"
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
    <section id="faq" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-wrap px-5 sm:px-8">
        <Reveal>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-accent">FAQ</p>
          <h2
            className="font-semibold leading-[1.06] tracking-tight text-headline"
            style={{ fontSize: "clamp(1.9rem, 4.4vw, 3.25rem)" }}
          >
            Honest answers.
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-10 border-t border-edge sm:mt-12">
            {faqs.map((f, i) => (
              <FAQItem key={f.q} q={f.q} a={f.a} id={`faq-panel-${i}`} />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

import { useEffect, useState } from "react";
import Icon from "./Icon";
import SectionHeading from "./SectionHeading";
import { DEMO_URL } from "../lib/site";

const COMMANDS = [
  "git clone https://github.com/AarinB1/OutlierQ.git",
  "cd OutlierQ && pip install -r requirements.txt",
  "cp .env.example .env",
  "python scripts/run_ingestion.py --once --signals --tickers NVDA",
];

const faqs = [
  {
    q: "Is this financial advice?",
    a: "No. OutlierQ is a personal research project. Nothing it produces, whether a signal, a confidence score or an arbitrage spread, is a recommendation to buy or sell any security or contract.",
  },
  {
    q: "Does it trade real money?",
    a: "No. The execution engine is paper trading: it records what an order would have been and marks it against market data later. No broker is connected and no order is ever routed anywhere.",
  },
  {
    q: "Is the dashboard demo running the pipeline?",
    a: "No. It is a static build over synthetic fixtures on GitHub Pages, with no FastAPI process, no database, and no connection to Finnhub, yfinance, Polymarket, Kalshi or FinBERT. NRVX, ALTQ and TQNX are invented companies.",
  },
  {
    q: "Why is confidence labelled raw?",
    a: "Because the calibrator has not earned the right to change it. It fits an isotonic regression from stated confidence to realized win rate, and refuses to fit until 40 signals have been graded with at least one win and one non-win. Until then it is the identity function, and the interface says raw.",
  },
  {
    q: "What happens when the market is quiet?",
    a: "Nothing fires, by design. Scores are relative to each ticker's own baseline, so an ordinary week never clears the threshold. There is no daily quota: a system that always finds something has stopped measuring anything.",
  },
];

export default function Docs() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COMMANDS.join("\n"));
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure context or permissions); the commands stay selectable.
    }
  };

  return (
    <section id="docs" aria-labelledby="docs-title" className="wrap py-20 sm:py-24 lg:py-28">
      <SectionHeading
        id="docs-title"
        eyebrow="05 / Go a little deeper"
        title={
          <>
            From the lab
            <br />
            to the source.
          </>
        }
        aside={
          <>
            Run the real pipeline locally with your own Finnhub key, or{" "}
            <a href={DEMO_URL} className="font-medium text-ink underline decoration-line-2 underline-offset-4 hover:text-accent">
              open the dashboard demo
            </a>{" "}
            to click through synthetic results.
          </>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div className="self-start overflow-hidden rounded-md bg-deep text-deep-ink">
          <div className="flex items-center justify-between gap-3 border-b border-deep-line px-5 py-4">
            <span aria-hidden="true" className="flex gap-1.5">
              <i className="block h-2 w-2 rounded-full bg-[#b07e6b]" />
              <i className="block h-2 w-2 rounded-full bg-[#b3a06b]" />
              <i className="block h-2 w-2 rounded-full bg-deep-line" />
            </span>
            <span className="label text-deep-muted">Get started / Python 3.11</span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-8 items-center gap-1.5 rounded px-2 text-[12px] text-deep-muted transition-colors hover:bg-deep-3 hover:text-deep-ink"
            >
              <Icon name={copied ? "check" : "copy"} className="h-4 w-4" />
              <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap px-5 py-5 font-mono text-[13px] leading-[2.1] [overflow-wrap:anywhere] sm:px-6">
            <span className="text-deep-faint"># Get the pipeline</span>
            {"\n"}
            <Cmd>{COMMANDS[0]}</Cmd>
            <Cmd>{COMMANDS[1]}</Cmd>
            {"\n"}
            <span className="text-deep-faint"># Add a free Finnhub key to .env, then scan once</span>
            {"\n"}
            <Cmd>{COMMANDS[2]}</Cmd>
            <Cmd>{COMMANDS[3]}</Cmd>
          </pre>
          <div className="flex items-center gap-2 bg-deep-2 px-5 py-3.5 text-[12px] text-deep-muted">
            <Icon name="terminal" className="h-4 w-4" />
            Runs locally. Tests: <code className="font-mono">pytest tests/</code>
          </div>
        </div>

        <div className="border-t border-line">
          {faqs.map((f, i) => (
            <details key={f.q} open={i === 0} className="group border-b border-line py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-[15px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                {f.q}
                <Icon name="plus" className="h-4 w-4 shrink-0 text-faint transition-transform group-open:rotate-45" />
              </summary>
              <p className="mr-6 mt-4 max-w-[34rem] text-[14px] leading-[1.85] text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cmd({ children }: { children: string }) {
  return (
    <>
      <span className="mr-2 select-none text-ice">$</span>
      {children}
      {"\n"}
    </>
  );
}

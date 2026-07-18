import Reveal from "./Reveal";
import { GitHubMark } from "./Nav";

const GITHUB_URL = "https://github.com/AarinB1/OutlierQ";

const stack = ["Finnhub", "yfinance", "FinBERT", "Polymarket", "Kalshi"];

export default function Hero() {
  return (
    <section id="top" className="relative flex min-h-screen flex-col justify-center overflow-hidden pb-16 pt-28 sm:pt-32">
      {/* background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(56rem 32rem at 50% -6rem, rgba(68,138,255,0.13), transparent 65%), radial-gradient(40rem 26rem at 85% 95%, rgba(68,138,255,0.05), transparent 70%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-wrap px-5 sm:px-8">
        <Reveal>
          <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.22em] text-muted sm:text-xs">
            An open research platform for event-driven trading signals
          </p>
        </Reveal>
        <Reveal delay={80}>
          <h1
            className="max-w-5xl font-semibold leading-[1.02] tracking-tight text-headline"
            style={{ fontSize: "clamp(2.75rem, 7vw, 5rem)" }}
          >
            Markets overreact.
            <br />
            <span className="text-accent">Machines notice first.</span>
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            OutlierQ turns anomalous news flow into calibrated options signals — then grades
            every one of them against what the market actually did.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-ink transition-all hover:brightness-110 sm:text-base"
            >
              <GitHubMark className="h-4 w-4" />
              View on GitHub
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border border-edge px-6 py-3 text-sm font-medium text-headline transition-colors hover:border-accent/60 sm:text-base"
            >
              Read the architecture
              <span aria-hidden="true" className="text-muted">↓</span>
            </a>
          </div>
        </Reveal>
        <Reveal delay={320}>
          <p className="mt-8 inline-flex max-w-full items-start gap-2 rounded-lg border border-edge bg-panel/70 px-4 py-2.5 text-[13px] leading-snug text-muted">
            <span aria-hidden="true" className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>
              <span className="font-medium text-body">Paper trading / research only.</span> Not
              financial advice.
            </span>
          </p>
        </Reveal>
        <Reveal delay={400}>
          <div className="mt-16 border-t border-white/5 pt-7 sm:mt-20">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
              Works with
            </p>
            <ul className="flex flex-wrap items-center gap-x-8 gap-y-3">
              {stack.map((name) => (
                <li
                  key={name}
                  className="font-mono text-sm tracking-wide text-faint transition-colors hover:text-muted sm:text-base"
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

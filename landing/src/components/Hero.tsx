import { useEffect, useRef, useState } from "react";
import Reveal from "./Reveal";
import SignalTape from "./SignalTape";
import DemoFrame from "./DemoFrame";
import { GitHubMark } from "./Nav";
import { DEMO_URL, GITHUB_URL } from "../lib/site";

const stack = ["Finnhub", "yfinance", "FinBERT", "Polymarket", "Kalshi"];

/** Cursor-following spotlight. Cheap: writes two CSS custom properties on a
 *  ref, no React state per move. Disabled for coarse pointers and under
 *  prefers-reduced-motion (the .spotlight rule is display:none there). */
function useSpotlight() {
  const hostRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    setEnabled(fine.matches && !still.matches);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const glow = glowRef.current;
    if (!enabled || !host || !glow) return;
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      glow.style.setProperty("--mx", `${e.clientX - r.left}px`);
      glow.style.setProperty("--my", `${e.clientY - r.top}px`);
      glow.classList.add("spotlight-on");
    };
    const onLeave = () => glow.classList.remove("spotlight-on");
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled]);

  return { hostRef, glowRef, enabled };
}

export default function Hero() {
  const { hostRef, glowRef, enabled } = useSpotlight();

  return (
    <section
      id="top"
      ref={hostRef}
      className="relative flex flex-col justify-center overflow-hidden pb-20 pt-28 sm:pt-32"
    >
      {/* gradient mesh */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(56rem 32rem at 50% -6rem, rgba(68,138,255,0.14), transparent 65%), radial-gradient(40rem 26rem at 88% 78%, rgba(68,138,255,0.06), transparent 70%), radial-gradient(34rem 22rem at 6% 58%, rgba(0,214,143,0.045), transparent 72%)",
        }}
      />
      {enabled ? <div ref={glowRef} aria-hidden="true" className="spotlight" /> : null}

      <div className="relative mx-auto w-full max-w-wrap px-5 sm:px-8">
        <Reveal instant>
          <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.22em] text-muted sm:text-xs">
            An open research platform for event-driven trading signals
          </p>
        </Reveal>
        <Reveal instant>
          <h1
            className="max-w-5xl font-semibold leading-[1.02] text-headline"
            style={{ fontSize: "clamp(2.75rem, 7vw, 5rem)", letterSpacing: "-0.02em" }}
          >
            Markets overreact.
            <br />
            <span className="text-accent">Machines notice first.</span>
          </h1>
        </Reveal>
        <Reveal instant>
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            OutlierQ turns anomalous news flow into calibrated options signals — then grades
            every one of them against what the market actually did.
          </p>
        </Reveal>
        <Reveal instant>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a
              href={DEMO_URL}
              className="inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-ink transition-[filter,transform] duration-200 hover:-translate-y-0.5 hover:brightness-110 sm:text-base"
            >
              Open the demo
              <span aria-hidden="true">→</span>
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-edge px-6 py-3 text-sm font-medium text-headline transition-colors hover:border-accent/60 sm:text-base"
            >
              <GitHubMark className="h-4 w-4" />
              View on GitHub
            </a>
          </div>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
            Interactive demo · synthetic data · no signup
          </p>
        </Reveal>
        <Reveal instant>
          <p className="mt-8 inline-flex max-w-full items-start gap-2 rounded-lg border border-edge bg-panel/70 px-4 py-2.5 text-[13px] leading-snug text-muted">
            <span
              aria-hidden="true"
              className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            />
            <span>
              <span className="font-medium text-body">Paper trading / research only.</span> Not
              financial advice. Every figure on this page and in the demo — tickers, prices, win
              rates, returns, sample counts — is synthetic.
            </span>
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-12 sm:mt-14">
          <SignalTape />
        </Reveal>

        <Reveal delay={140} className="mt-10 sm:mt-14">
          <DemoFrame />
        </Reveal>

        <Reveal delay={120}>
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

import Reveal from "./Reveal";
import { GitHubMark } from "./Nav";
import { DEMO_URL, GITHUB_URL } from "../lib/site";

/** Third and last placement of the demo CTA, immediately above the footer. */
export default function DemoBand() {
  return (
    <section className="relative overflow-hidden border-t border-edge py-20 sm:py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(46rem 24rem at 50% 120%, rgba(68,138,255,0.12), transparent 68%), radial-gradient(30rem 18rem at 12% -20%, rgba(0,214,143,0.05), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-wrap px-5 text-center sm:px-8">
        <Reveal>
          <h2
            className="mx-auto max-w-3xl font-semibold leading-[1.06] text-headline"
            style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)", letterSpacing: "-0.02em" }}
          >
            Read the numbers yourself.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted">
            The dashboard is deployed as a static build over baked synthetic fixtures — no backend,
            no market data, nothing to sign up for.
          </p>
        </Reveal>
        <Reveal delay={80}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
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
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
            Interactive demo · synthetic data · not financial advice
          </p>
        </Reveal>
      </div>
    </section>
  );
}

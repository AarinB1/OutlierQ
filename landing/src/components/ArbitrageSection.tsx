import Section from "./Section";
import { MockPanel } from "./Panel";

function VenueCard({
  venue,
  price,
  side,
  accented,
}: {
  venue: string;
  price: string;
  side: string;
  accented?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 sm:p-5 ${
        accented ? "border-accent/50 bg-accent/[0.06]" : "border-edge bg-panel-2"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          {venue}
        </span>
        {/* accent/15 behind accent text measured 4.49:1 — a hair under AA.
            accent/10 keeps the same read at 4.83:1. */}
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
            accented ? "bg-accent/10 text-accent" : "bg-panel text-faint"
          }`}
        >
          {side}
        </span>
      </div>
      <div className="mt-3 font-mono text-3xl font-semibold tracking-tight text-headline sm:text-4xl">
        {price}
      </div>
      <div className="mt-1 font-mono text-[11px] text-faint">YES price · last trade</div>
    </div>
  );
}

function ArbMockup() {
  return (
    <MockPanel label="OutlierQ · Arbitrage scanner">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              Matched market
            </div>
            <h3 className="mt-1.5 text-base font-semibold tracking-tight text-headline sm:text-lg">
              Fed cuts rates at the September meeting?
            </h3>
          </div>
          <span className="rounded-full border border-edge bg-panel-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Match score 0.96
          </span>
        </div>

        <div className="mt-5 grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
          <VenueCard venue="Polymarket" price="$0.57" side="Buy YES" accented />
          <div className="flex items-center justify-center py-1 sm:flex-col sm:px-1" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-5 w-5 rotate-90 text-faint sm:rotate-0" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M7 8h13m0 0-3-3m3 3-3 3M17 16H4m0 0 3-3m-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <VenueCard venue="Kalshi" price="$0.63" side="Buy NO" />
        </div>

        <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-edge bg-edge sm:grid-cols-3">
          <div className="bg-panel-2 px-4 py-3.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Spread</div>
            <div className="mt-1 font-mono text-lg font-semibold text-headline">6.0¢</div>
          </div>
          <div className="bg-panel-2 px-4 py-3.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              Est. edge after fees
            </div>
            <div className="mt-1 font-mono text-lg font-semibold text-up">+3.1%</div>
          </div>
          <div className="bg-panel-2 px-4 py-3.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              Execution
            </div>
            <div className="mt-1 font-mono text-lg font-semibold text-accent">Paper order</div>
          </div>
        </div>

        <p className="mt-4 font-mono text-[11px] leading-relaxed text-faint">
          Combined cost $0.57 + $0.37 = $0.94 → locks $1.00 payout either way, before slippage.
        </p>
      </div>
    </MockPanel>
  );
}

export default function ArbitrageSection() {
  return (
    <Section
      id="arbitrage"
      kicker="03 · Prediction-market arbitrage"
      headline={
        <>
          The same event. Two prices.
          <br className="hidden sm:block" /> One spread.
        </>
      }
      lede="Polymarket and Kalshi routinely price the identical real-world outcome differently. OutlierQ matches equivalent markets across both platforms and surfaces the spreads worth studying — after fees, not before."
      mockup={<ArbMockup />}
      cards={[
        {
          title: "Cross-platform matching",
          body: "Markets are matched on resolution criteria and settlement dates, not just similar titles. A near-match that resolves differently is not an arbitrage — it's a trap.",
        },
        {
          title: "Fee-aware edge",
          body: "Raw spread is a vanity number. The scanner nets out each platform's fee structure to estimate the edge that would actually survive execution.",
        },
        {
          title: "Paper execution engine",
          body: "Detected spreads route to an execution engine that is paper-trading by default. The point is measuring whether the edge is real, not risking capital on it.",
        },
      ]}
      glowSide="right"
    />
  );
}

import { DEMO_URL, GITHUB_URL } from "../lib/site";

const columns = [
  {
    heading: "Project",
    links: [
      { label: "GitHub", href: GITHUB_URL, external: true },
      { label: "Architecture", href: "#how-it-works" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    heading: "Pipeline",
    links: [
      { label: "Detection", href: "#detection" },
      { label: "Options signals", href: "#signals" },
      { label: "Prediction-market arbitrage", href: "#arbitrage" },
      { label: "Tracking & calibration", href: "#tracking" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-edge">
      <div className="mx-auto max-w-wrap px-5 py-14 sm:px-8 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2 text-headline">
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
              <span className="font-semibold tracking-tight">OutlierQ</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              An open research platform for event-driven trading signals, built and
              maintained by Aarin Basu.
            </p>
            <a
              href={DEMO_URL}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-edge bg-panel px-4 py-2 text-sm font-medium text-headline transition-colors hover:border-accent/60"
            >
              Open the demo
              <span aria-hidden="true" className="text-accent">
                →
              </span>
            </a>
            <p className="mt-5 font-mono text-xs text-faint">MIT License</p>
          </div>
          {columns.map((col) => (
            <div key={col.heading}>
              {/* h3, not h4: the previous heading on the page is the demo
                  band's h2, and jumping h2 -> h4 breaks sequential heading
                  order (Lighthouse/axe heading-order). */}
              <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
                {col.heading}
              </h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      {...("external" in l && l.external
                        ? { target: "_blank", rel: "noreferrer" }
                        : {})}
                      className="text-sm text-muted transition-colors hover:text-headline"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-edge pt-8">
          <p className="max-w-3xl text-[13px] leading-relaxed text-muted">
            <span className="font-medium text-body">
              Paper trading / research only. Not financial advice.
            </span>{" "}
            OutlierQ is a personal research project.{" "}
            <span className="font-medium text-body">
              Every figure shown on this page and in the interactive demo is synthetic.
            </span>{" "}
            That covers all tickers, prices, spreads, confidence scores, win rates, returns,
            Sharpe figures, drawdowns, and sample counts, in the mockups here and in the demo
            build — the demo is a static site over baked fixtures with no backend, no database,
            and no market-data connection. It is not a track record, and no result on it has been
            achieved with capital. Tickers marked with an asterisk are fictional symbols. Nothing
            here is a recommendation to buy or sell any security, option, or prediction-market
            contract.
          </p>
          <p className="mt-6 font-mono text-xs text-faint">
            © {new Date().getFullYear()} OutlierQ
          </p>
        </div>
      </div>
    </footer>
  );
}

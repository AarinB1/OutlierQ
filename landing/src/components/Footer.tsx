const GITHUB_URL = "https://github.com/AarinB1/OutlierQ";

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
            <p className="mt-4 font-mono text-xs text-faint">MIT License</p>
          </div>
          {columns.map((col) => (
            <div key={col.heading}>
              <h4 className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
                {col.heading}
              </h4>
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
          <p className="max-w-3xl text-[13px] leading-relaxed text-faint">
            <span className="font-medium text-muted">
              Paper trading / research only. Not financial advice.
            </span>{" "}
            OutlierQ is a personal research project. All numbers shown in product mockups on this
            page are illustrative sample data, not live results. Nothing here is a recommendation
            to buy or sell any security, option, or prediction-market contract.
          </p>
          <p className="mt-6 font-mono text-xs text-faint">
            © {new Date().getFullYear()} OutlierQ
          </p>
        </div>
      </div>
    </footer>
  );
}

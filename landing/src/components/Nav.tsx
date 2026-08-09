import { DEMO_URL, GITHUB_URL } from "../lib/site";

const links = [
  { label: "Detection", href: "#detection" },
  { label: "Signals", href: "#signals" },
  { label: "Arbitrage", href: "#arbitrage" },
  { label: "Tracking", href: "#tracking" },
  { label: "FAQ", href: "#faq" },
];

export default function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-ink/80 backdrop-blur-md">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-wrap items-center justify-between gap-4 px-5 sm:px-8"
      >
        <a href="#top" className="flex shrink-0 items-center gap-2 text-headline">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="font-semibold tracking-tight">OutlierQ</span>
        </a>
        <div className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-muted transition-colors hover:text-headline"
            >
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-edge bg-panel px-3.5 py-1.5 text-sm font-medium text-headline transition-colors hover:border-accent/60 sm:px-4"
          >
            <GitHubMark className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
            <span className="sr-only sm:hidden">View on GitHub</span>
          </a>
          <a
            href={DEMO_URL}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-ink transition-[filter] duration-200 hover:brightness-110 sm:px-4"
          >
            Open the demo
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </nav>
    </header>
  );
}

export function GitHubMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

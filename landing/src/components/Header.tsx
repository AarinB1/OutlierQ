import Icon, { GitHubMark, Wordmark } from "./Icon";
import { DEMO_URL, GITHUB_URL } from "../lib/site";

const links = [
  { label: "Why OutlierQ", href: "#principles" },
  { label: "Signal lab", href: "#lab" },
  { label: "Architecture", href: "#architecture" },
  { label: "Dashboard demo", href: DEMO_URL },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur-md">
      <nav aria-label="Main" className="wrap flex h-[4.5rem] items-center justify-between gap-6">
        <a href="#top" aria-label="OutlierQ home" className="text-[22px] sm:text-2xl">
          <Wordmark />
        </a>
        <div className="hidden items-center gap-8 text-[13px] font-medium md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-muted transition-colors hover:text-accent">
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-paper-3 hover:text-ink"
          >
            <GitHubMark className="h-[18px] w-[18px]" />
            <span className="sr-only">OutlierQ on GitHub</span>
          </a>
          <a href="#lab" className="btn btn-sm">
            Open the lab
            <Icon name="arrow-up-right" className="h-4 w-4" />
          </a>
        </div>
      </nav>
    </header>
  );
}

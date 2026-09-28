import Icon, { Wordmark } from "./Icon";
import { AUTHOR_URL, DEMO_URL, GITHUB_URL } from "../lib/site";

export function Closing() {
  return (
    <section aria-labelledby="closing-title" className="wrap">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-6 border-y border-line py-12">
        <Icon name="spike" className="h-14 w-14 -rotate-6 text-[#7f93c4] sm:h-20 sm:w-20" strokeWidth={1.3} />
        <div>
          <p className="eyebrow">Most days, nothing. Some days, something.</p>
          <h2 id="closing-title" className="heading mt-4 text-[1.75rem] text-ink sm:text-[2rem]">
            Notice the outlier.
            <br />
            Then grade it.
          </h2>
        </div>
        <a href={DEMO_URL} className="btn sm:ml-auto">
          Open the dashboard demo
          <Icon name="arrow-right" />
        </a>
      </div>
    </section>
  );
}

export default function Footer() {
  return (
    <footer className="wrap pb-10 pt-8">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <span className="text-[22px]">
          <Wordmark />
        </span>
        <span className="text-[13px] text-muted">An event-driven signal research project by Aarin Basu.</span>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted sm:ml-auto">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-accent">
            GitHub ↗
          </a>
          <a href={DEMO_URL} className="hover:text-accent">
            Dashboard demo
          </a>
          <a href={AUTHOR_URL} target="_blank" rel="noreferrer" className="hover:text-accent">
            aarinbasu.com ↗
          </a>
          <span className="rounded border border-line px-2 py-1 font-mono text-[11px] text-faint">MIT</span>
        </nav>
      </div>
      <p className="mt-6 max-w-[52rem] text-[12px] leading-[1.75] text-faint">
        Paper trading and research only. Not financial advice. Every figure on this page and in the
        dashboard demo is synthetic, and none of it is a track record. Tickers marked with an asterisk
        are fictional.
      </p>
    </footer>
  );
}

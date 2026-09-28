import Icon, { GitHubMark } from "./Icon";
import HeroFigure from "./HeroFigure";
import { GITHUB_URL } from "../lib/site";

const proof = [
  { icon: "activity", label: "Per-ticker baselines" },
  { icon: "filter", label: "Staged confirmation" },
  { icon: "check-circle", label: "Every signal graded" },
] as const;

export default function Hero() {
  return (
    <>
      <section
        id="top"
        className="wrap grid items-center gap-10 pb-16 pt-12 sm:pt-16 lg:min-h-[680px] lg:grid-cols-[1.2fr_1fr] lg:gap-8 lg:pb-16"
      >
        <div>
          <p className="eyebrow">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-up shadow-[0_0_0_3px_rgba(28,117,71,0.12)]" />
            Open source · Python + React
          </p>
          {/* Sized so each sentence holds one line beside the figure: "Machines
              notice first." measures 8.8em in Plex Sans 500 at this tracking. */}
          <h1 className="display mt-6 text-[clamp(3rem,7vw,5rem)] text-ink lg:text-[clamp(3.3rem,5.2vw,4.25rem)]">
            Markets overreact.
            <br />
            <span className="text-[#56657f]">Machines notice first.</span>
          </h1>
          <p className="mt-6 max-w-[30rem] text-base leading-[1.85] text-muted">
            OutlierQ watches news flow for the rare day a ticker breaks from its own baseline, turns
            that event into an options signal, and grades every signal against what the market
            actually did.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
            <a href="#lab" className="btn">
              Run a scenario
              <Icon name="arrow-right" />
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="text-link">
              <GitHubMark className="h-4 w-4" />
              Explore the source
              <span aria-hidden="true" className="text-faint">
                ↗
              </span>
            </a>
          </div>
          <p className="mt-7 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-faint">
            <Icon name="terminal" className="h-4 w-4" />
            <code className="font-mono text-[12px]">Python 3.11 · FinBERT · FastAPI</code>
            <span aria-hidden="true">·</span>
            <span>Research only. Every figure here is synthetic.</span>
          </p>
        </div>
        <HeroFigure />
      </section>

      <div className="border-y border-line">
        <div className="wrap flex flex-wrap items-center justify-between gap-x-8 gap-y-3 py-6 sm:min-h-[5.5rem]">
          <span className="w-full text-[13px] text-muted sm:w-auto">Grading is the deliverable.</span>
          {proof.map((p) => (
            <span key={p.label} className="flex items-center gap-2.5 text-[13px] font-medium text-ink">
              <Icon name={p.icon} className="h-[17px] w-[17px] text-accent" />
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
